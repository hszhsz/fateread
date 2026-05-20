// ============================================================
// FateRead - Agent Runtime (Agent 核心运行时)
// Instance-based state, context window management, smart loop,
// proper streaming, token tracking, session persistence
// ============================================================

import OpenAI from 'openai';
import { buildSystemPrompt } from './prompt.js';
import {
  getTools,
  executeTool,
  compressToolResult,
  SessionState,
} from './tools.js';
import type { SchoolId } from './schools/types.js';
import { buildSkillCatalog } from '../skills/loader.js';
import {
  createLlmClient,
  resolveModel,
  resolveMaxTokens,
  createTokenTracker,
  recordUsage,
  formatTokenReport,
  withRetry,
  extractContent,
  extractReasoning,
} from '../shared/llm-client.js';
import type { TokenTracker } from '../shared/llm-client.js';
import {
  saveSession,
  loadSession,
  generateSessionId,
  appendMessage,
} from '../shared/session-store.js';
import type { SessionData } from '../shared/session-store.js';
import { dbCreateSession, dbUpdateSession } from '../shared/database.js';
import type { UserProfile } from '../core/types.js';
import type { BaziChart } from '../core/types.js';

// ============================================================
// Types
// ============================================================

export interface AgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  skillsDir?: string;
  maxTokens?: number;
  /** Maximum LLM call iterations per user message (default 10) */
  maxIterations?: number;
  /** Enable token tracking */
  trackTokens?: boolean;
  /** Active school (default: 'ziping' 子平八字) */
  school?: SchoolId;
  /** Enable multi-school debate mode (default: false, single agent only) */
  debate?: boolean;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

export interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_end' | 'reasoning' | 'progress' | 'error';
  content: string;
  data?: Record<string, unknown>;
}

// ============================================================
// Context Window Management
// ============================================================

const MAX_CONTEXT_TOKENS = 200000; // Keep ~56k headroom in 256k window
const ESTIMATED_CHARS_PER_TOKEN = 2.5; // Rough Chinese text estimate

function estimateTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens in the message array.
 */
function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => {
    let chars = (m.content?.length || 0);
    if (m.tool_calls) {
      chars += JSON.stringify(m.tool_calls).length;
    }
    if (m.reasoning_content) {
      chars += m.reasoning_content.length;
    }
    return sum + Math.ceil(chars / ESTIMATED_CHARS_PER_TOKEN);
  }, 0);
}

/**
 * Prune old tool messages when approaching context limit.
 * Keeps system prompt, recent user/assistant messages, and compresses tool results.
 */
function pruneContext(messages: Message[]): Message[] {
  const estimated = estimateTotalTokens(messages);
  if (estimated < MAX_CONTEXT_TOKENS) return messages;

  // Strategy: compress tool result messages, then drop oldest tool pairs if still too large
  const pruned: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    let msg = messages[i];

    // Always keep system prompt
    if (msg.role === 'system') {
      pruned.push(msg);
      continue;
    }

    // Compress tool messages
    if (msg.role === 'tool' && msg.content) {
      try {
        const parsed = JSON.parse(msg.content);
        // If it's a large paipan result, keep only the formatted part
        if (parsed.formatted && parsed.data) {
          msg = { ...msg, content: parsed.formatted };
        } else if (msg.content.length > 2000) {
          msg = { ...msg, content: msg.content.slice(0, 2000) + '\n...(已截断)' };
        }
      } catch {
        if (msg.content && msg.content.length > 2000) {
          msg = { ...msg, content: msg.content.slice(0, 2000) + '\n...(已截断)' };
        }
      }
    }

    pruned.push(msg);
  }

  // If still too large, drop oldest user/assistant/tool exchange pairs
  // (keep system + last 6 messages minimum)
  while (estimateTotalTokens(pruned) > MAX_CONTEXT_TOKENS && pruned.length > 7) {
    // Find first non-system, removable message
    let removed = false;
    for (let i = 1; i < pruned.length - 6; i++) {
      if (pruned[i].role !== 'system') {
        pruned.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }

  return pruned;
}

// ============================================================
// FateReadAgent
// ============================================================

export class FateReadAgent {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private messages: Message[] = [];
  private state: SessionState;
  private tokenTracker: TokenTracker | undefined;
  private maxIterations: number;
  private sessionId: string;
  private school: SchoolId;
  private debate: boolean;

  constructor(options: AgentOptions = {}) {
    this.client = createLlmClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    this.model = resolveModel({ model: options.model });
    this.maxTokens = resolveMaxTokens({ maxTokens: options.maxTokens });
    this.maxIterations = options.maxIterations || 10;
    this.school = options.school || 'ziping';
    this.debate = options.debate || false;

    if (options.trackTokens !== false) {
      this.tokenTracker = createTokenTracker();
    }

    this.state = new SessionState(this.tokenTracker, this.school, this.debate);
    this.state.loadSkills(options.skillsDir);

    const skillCatalog = buildSkillCatalog(this.state.skills);

    // Build system prompt with school/debate context
    const systemPrompt = buildSystemPrompt(this.state) + '\n\n' + skillCatalog;

    this.messages.push({ role: 'system', content: systemPrompt });
    this.sessionId = generateSessionId();

    // Initialize session in SQLite
    dbCreateSession(this.sessionId, null, null);
    appendMessage(this.sessionId, this.messages[0], null, null);
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Send a user message and get the full response (non-streaming).
   */
  async chat(userMessage: string): Promise<string> {
    return withRetry(async () => {
      return this.chatInternal(userMessage);
    });
  }

  private async chatInternal(userMessage: string): Promise<string> {
    const userMsg: Message = { role: 'user', content: userMessage };
    this.messages.push(userMsg);
    this.persist(userMsg);

    let iterations = 0;
    let consecutiveNoProgress = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Prune context if needed
      this.messages = pruneContext(this.messages);

      const response = await this.callLLM();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const content = response.content || '';
        const msg: Message = { role: 'assistant', content };
        if (response.reasoning_content) {
          msg.reasoning_content = response.reasoning_content;
        }
        this.messages.push(msg);
        this.persist(msg);
        this.updateSystemPromptIntake();
        return content;
      }

      // Tool calls
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      };
      if (response.reasoning_content) {
        assistantMsg.reasoning_content = response.reasoning_content;
      }
      this.messages.push(assistantMsg);
      this.persist(assistantMsg);

      let anyToolSucceeded = false;

      for (const toolCall of response.tool_calls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n⚙️  调用工具: ${funcName}`);

        let result: string;
        try {
          result = await executeTool(funcName, funcArgs, this.state);
          anyToolSucceeded = true;
        } catch (toolError: unknown) {
          const msg = toolError instanceof Error ? toolError.message : String(toolError);
          result = JSON.stringify({ error: `工具执行失败: ${msg}` });
        }

        // Compress tool result for context window
        const compressed = compressToolResult(funcName, result);

        const toolMsg: Message = {
          role: 'tool',
          content: compressed,
          tool_call_id: toolCall.id,
        };
        this.messages.push(toolMsg);
        this.persist(toolMsg);
      }

      // Smart termination: if no tool succeeded, it's likely a dead-end
      if (!anyToolSucceeded) {
        consecutiveNoProgress++;
        if (consecutiveNoProgress >= 2) {
          console.warn('⚠️  连续工具调用无进展，提前终止');
          break;
        }
      } else {
        consecutiveNoProgress = 0;
      }

      // If intake completed from this round, update system prompt
      this.updateSystemPromptIntake();
    }

    return iterations >= this.maxIterations
      ? '抱歉，处理超时。请尝试重新描述您的问题。'
      : '抱歉，处理过程中遇到问题，请重试。';
  }

  /**
   * Streaming version — yields structured StreamEvents.
   */
  async *chatStream(userMessage: string): AsyncGenerator<StreamEvent, void, unknown> {
    const userMsg: Message = { role: 'user', content: userMessage };
    this.messages.push(userMsg);
    this.persist(userMsg);

    let iterations = 0;
    let consecutiveNoProgress = 0;

    while (iterations < this.maxIterations) {
      iterations++;
      this.messages = pruneContext(this.messages);

      // Use streaming LLM call for actual token-level streaming
      const streamResult = await this.callLLMStream();

      if (!streamResult.toolCalls || streamResult.toolCalls.length === 0) {
        // Yield accumulated content
        const content = streamResult.content || '';
        if (content) {
          yield { type: 'text', content };
        }
        const msg: Message = { role: 'assistant', content };
        if (streamResult.reasoningContent) {
          msg.reasoning_content = streamResult.reasoningContent;
        }
        this.messages.push(msg);
        this.persist(msg);
        this.updateSystemPromptIntake();
        return;
      }

      // Yield reasoning content if any
      if (streamResult.reasoningContent) {
        yield { type: 'reasoning', content: streamResult.reasoningContent };
      }

      // Tool calls
      const assistantMsg: Message = {
        role: 'assistant',
        content: streamResult.content || '',
        tool_calls: streamResult.toolCalls,
      };
      if (streamResult.reasoningContent) {
        assistantMsg.reasoning_content = streamResult.reasoningContent;
      }
      this.messages.push(assistantMsg);
      this.persist(assistantMsg);

      let anyToolSucceeded = false;

      for (const toolCall of streamResult.toolCalls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        yield { type: 'tool_start', content: funcName };

        // Progress queue for multi_school_analyze to stream internal progress
        const progressQueue: string[] = [];
        if (funcName === 'multi_school_analyze') {
          this.state.onProgress = (msg: string) => {
            progressQueue.push(msg);
          };
        }

        let result: string;
        try {
          const toolPromise = executeTool(funcName, funcArgs, this.state);

          // Poll progress queue while tool executes
          while (true) {
            const done = await Promise.race([
              toolPromise.then(() => true),
              new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 80)),
            ]);

            // Yield any queued progress messages
            while (progressQueue.length > 0) {
              const msg = progressQueue.shift()!;
              yield { type: 'progress', content: msg };
            }

            if (done) {
              result = await toolPromise;
              anyToolSucceeded = true;
              break;
            }
          }
        } catch (toolError: unknown) {
          const msg = toolError instanceof Error ? toolError.message : String(toolError);
          result = JSON.stringify({ error: `工具执行失败: ${msg}` });
        }

        // Clean up progress callback
        if (funcName === 'multi_school_analyze') {
          this.state.onProgress = undefined;
          // Yield any remaining progress
          while (progressQueue.length > 0) {
            const msg = progressQueue.shift()!;
            yield { type: 'progress', content: msg };
          }
        }

        const compressed = compressToolResult(funcName, result);

        const toolMsg: Message = {
          role: 'tool',
          content: compressed,
          tool_call_id: toolCall.id,
        };
        this.messages.push(toolMsg);
        this.persist(toolMsg);

        // Yield tool result progress
        yield {
          type: 'tool_end',
          content: funcName,
          data: this.buildToolProgressData(funcName, result),
        };
      }

      if (!anyToolSucceeded) {
        consecutiveNoProgress++;
        if (consecutiveNoProgress >= 2) break;
      } else {
        consecutiveNoProgress = 0;
      }

      this.updateSystemPromptIntake();
    }
  }

  /**
   * Reset the conversation in-memory. Saves current session to DB first.
   */
  reset(): void {
    // Save current session to DB before resetting
    saveSession(this.sessionId, this.messages, this.state.profile, this.state.chart);

    this.state = new SessionState(this.tokenTracker, this.school, this.debate);
    this.state.loadSkills();
    const skillCatalog = buildSkillCatalog(this.state.skills);
    const systemPrompt = buildSystemPrompt(this.state) + '\n\n' + skillCatalog;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.sessionId = generateSessionId();

    // Initialize new session in SQLite
    dbCreateSession(this.sessionId, null, null);
    this.persist(this.messages[0]);
  }

  /**
   * Start a brand new session, saving the current one to DB.
   */
  newSession(): string {
    // Save current session to DB first
    saveSession(this.sessionId, this.messages, this.state.profile, this.state.chart);

    const oldId = this.sessionId;
    this.state = new SessionState(this.tokenTracker, this.school, this.debate);
    this.state.loadSkills();
    const skillCatalog = buildSkillCatalog(this.state.skills);
    const systemPrompt = buildSystemPrompt(this.state) + '\n\n' + skillCatalog;
    this.messages = [{ role: 'system', content: systemPrompt }];
    this.sessionId = generateSessionId();

    // Initialize new session in SQLite
    dbCreateSession(this.sessionId, null, null);
    this.persist(this.messages[0]);

    return oldId;
  }

  /**
   * Save current session to DB.
   */
  saveSession(customId?: string): string {
    const id = customId || this.sessionId;
    saveSession(id, this.messages, this.state.profile, this.state.chart);
    return id;
  }

  /**
   * Load a session from DB and restore all state.
   */
  loadSession(sessionId: string): boolean {
    const data = loadSession(sessionId);
    if (!data) return false;

    this.messages = data.messages as unknown as Message[];
    this.sessionId = data.id;

    if (data.profile) {
      this.state.profile = data.profile;
    }
    if (data.chart) {
      this.state.chart = data.chart;
    }

    // Rebuild system prompt
    const skillCatalog = buildSkillCatalog(this.state.skills);
    const systemPrompt = buildSystemPrompt(this.state) + '\n\n' + skillCatalog;
    this.messages[0] = { role: 'system', content: systemPrompt };

    return true;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getChart(): BaziChart | null {
    return this.state.chart;
  }

  getProfile(): UserProfile | null {
    return this.state.profile;
  }

  getState(): SessionState {
    return this.state;
  }

  getTokenReport(): string {
    return this.tokenTracker ? formatTokenReport(this.tokenTracker) : 'Token 追踪未启用';
  }

  // ============================================================
  // Internal
  // ============================================================

  /**
   * Persist a message to SQLite and update session state.
   */
  private persist(msg: Message): void {
    appendMessage(this.sessionId, msg, this.state.profile, this.state.chart);
  }

  /**
   * Update the system prompt with the current intake step hint.
   * This dynamically changes the system instructions as the intake progresses.
   */
  private updateSystemPromptIntake(): void {
    const skillCatalog = buildSkillCatalog(this.state.skills);
    const systemPrompt = buildSystemPrompt(this.state);
    if (this.messages.length > 0 && this.messages[0].role === 'system') {
      this.messages[0] = {
        role: 'system',
        content: systemPrompt + '\n\n' + skillCatalog,
      };
    }
  }

  /**
   * Non-streaming LLM call.
   */
  private async callLLM(): Promise<{
    content: string | null;
    reasoning_content?: string;
    tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  }> {
    const requestMessages = this.messages.map(msg => {
      const m: Record<string, unknown> = { role: msg.role, content: msg.content };
      if (msg.tool_calls) m.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
      if (msg.name) m.name = msg.name;
      if (msg.reasoning_content) m.reasoning_content = msg.reasoning_content;
      return m;
    });

    const tools = getTools(this.debate, this.state.activeSchool);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: requestMessages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      tool_choice: 'auto',
      max_tokens: this.maxTokens,
    });

    // Track token usage
    if (this.tokenTracker && response.usage) {
      recordUsage(this.tokenTracker, this.model, {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      });
    }

    const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;

    return {
      content: extractContent(message),
      reasoning_content: extractReasoning(message),
      tool_calls: message?.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
    };
  }

  /**
   * Streaming LLM call — collects stream chunks into a final result.
   * DeepSeek: reasoning_content comes first as delta, then content follows.
   */
  private async callLLMStream(): Promise<{
    content: string | null;
    reasoningContent?: string;
    toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  }> {
    const requestMessages = this.messages.map(msg => {
      const m: Record<string, unknown> = { role: msg.role, content: msg.content };
      if (msg.tool_calls) m.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
      if (msg.name) m.name = msg.name;
      if (msg.reasoning_content) m.reasoning_content = msg.reasoning_content;
      return m;
    });

    const tools = getTools(this.debate, this.state.activeSchool);
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: requestMessages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools,
      tool_choice: 'auto',
      max_tokens: this.maxTokens,
      stream: true,
    });

    let contentBuf = '';
    let reasoningBuf = '';
    const toolCallBuf: Map<number, { id: string; name: string; args: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Track usage from last chunk
      if (chunk.usage && this.tokenTracker) {
        recordUsage(this.tokenTracker, this.model, {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        });
      }

      // reasoning_content (DeepSeek)
      const reasoning = (delta as Record<string, unknown>).reasoning_content as string | undefined;
      if (reasoning) {
        reasoningBuf += reasoning;
      }

      // content
      if (delta.content) {
        contentBuf += delta.content;
      }

      // tool_calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallBuf.has(idx)) {
            toolCallBuf.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
          }
          const entry = toolCallBuf.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    // Build tool_calls from accumulated stream
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
    for (const [, tc] of toolCallBuf) {
      if (tc.name) {
        toolCalls.push({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        });
      }
    }

    return {
      content: contentBuf || null,
      reasoningContent: reasoningBuf || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Build progress data for tool execution display.
   */
  private buildToolProgressData(funcName: string, result: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(result);

      if (funcName === 'paipan' && parsed.formatted) {
        return { formatted: parsed.formatted };
      }
      if (funcName === 'update_profile' && parsed.progress) {
        return { progress: parsed.progress, step: parsed.intake_step };
      }
      if (funcName === 'multi_school_analyze' && parsed.meta) {
        return {
          debateMode: this.debate,
          agreementRate: parsed.meta.agreementRate,
          debatedDimensions: parsed.meta.debatedDimensions,
        };
      }
      if (funcName === 'save_document' && parsed.success) {
        return { filepath: parsed.filepath };
      }
    } catch {
      // not JSON
    }
    return {};
  }
}
