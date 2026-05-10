// ============================================================
// FateRead - Agent Runtime (Agent 核心运行时)
// 支持 Skill 系统 + 缘主画像采集
// ============================================================

import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOLS, executeTool, getCurrentChart, setCurrentChart, getCurrentProfile, initSkills, getLoadedSkills, getOrchestrator } from './tools.js';
import { buildSkillCatalog } from '../skills/loader.js';
import type { UserProfile } from '../core/types.js';

export interface AgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  skillsDir?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string; // DeepSeek thinking mode
}

/**
 * FateRead Agent
 * 管理对话流程、工具调用、LLM 交互、Skill 加载、缘主画像采集
 */
export class FateReadAgent {
  private client: OpenAI;
  private model: string;
  private messages: Message[] = [];

  constructor(options: AgentOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    });
    this.model = options.model || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';

    // 加载 Skills
    initSkills(options.skillsDir);

    // 构建系统提示（含 Skill 目录）
    const skillCatalog = buildSkillCatalog(getLoadedSkills());
    const systemPrompt = SYSTEM_PROMPT + skillCatalog;

    this.messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  /**
   * 发送用户消息并获取回复（完整流程，含工具调用循环）
   */
  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });

    // 工具调用循环（增加到 10 次以支持 skill 多步流程）
    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.callLLM();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        // 没有工具调用，返回最终回复
        const content = response.content || '';
        const msg: Message = { role: 'assistant', content };
        if (response.reasoning_content) {
          msg.reasoning_content = response.reasoning_content;
        }
        this.messages.push(msg);
        return content;
      }

      // 有工具调用，保存 assistant 消息（含 reasoning_content）
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      };
      if (response.reasoning_content) {
        assistantMsg.reasoning_content = response.reasoning_content;
      }
      this.messages.push(assistantMsg);

      // 执行工具
      for (const toolCall of response.tool_calls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n⚙️  调用工具: ${funcName}`);
        const result = await executeTool(funcName, funcArgs);

        this.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }
    }

    return '抱歉，处理超时，请重试。';
  }

  /**
   * 流式输出版本
   */
  async *chatStream(userMessage: string): AsyncGenerator<string, void, unknown> {
    this.messages.push({ role: 'user', content: userMessage });

    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.callLLM();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const content = response.content || '';
        const msg: Message = { role: 'assistant', content };
        if (response.reasoning_content) {
          msg.reasoning_content = response.reasoning_content;
        }
        this.messages.push(msg);
        yield content;
        return;
      }

      // 工具调用
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      };
      if (response.reasoning_content) {
        assistantMsg.reasoning_content = response.reasoning_content;
      }
      this.messages.push(assistantMsg);

      for (const toolCall of response.tool_calls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        yield `\n⚙️  正在处理 (${funcName})...\n`;
        const result = await executeTool(funcName, funcArgs);

        this.messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });

        // 如果是排盘，展示格式化结果
        if (funcName === 'paipan') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.formatted) {
              yield '\n' + parsed.formatted + '\n';
            }
          } catch { /* ignore */ }
        }

        // 如果是更新画像，展示采集进度
        if (funcName === 'update_profile') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.progress) {
              yield `\n📋 信息采集进度: ${parsed.progress.completeness}\n`;
            }
          } catch { /* ignore */ }
        }

        // 如果是保存文档，通知用户
        if (funcName === 'save_document') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.success) {
              yield `\n💾 文档已保存: ${parsed.filepath}\n`;
            }
          } catch { /* ignore */ }
        }

        // 如果是多流派分析，展示摘要
        if (funcName === 'multi_school_analyze') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.meta) {
              yield `\n🎭 三派会诊完成 | 一致率: ${parsed.meta.agreementRate}%`;
              if (parsed.meta.debatedDimensions.length > 0) {
                yield ` | 辩论维度: ${parsed.meta.debatedDimensions.join(', ')}`;
              }
              yield '\n';
            }
          } catch { /* ignore */ }
        }
      }
    }

    yield '抱歉，处理超时，请重试。';
  }

  /**
   * 调用 LLM
   * DeepSeek V4 Pro 的 thinking 模式会返回 reasoning_content，
   * 必须在后续请求中原样回传该字段。
   */
  private async callLLM(): Promise<{
    content: string | null;
    reasoning_content?: string;
    tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  }> {
    // 构建请求消息，确保 reasoning_content 被正确传递
    const requestMessages = this.messages.map(msg => {
      const m: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.tool_calls) m.tool_calls = msg.tool_calls;
      if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
      if (msg.name) m.name = msg.name;
      // 关键：回传 reasoning_content
      if (msg.reasoning_content) m.reasoning_content = msg.reasoning_content;
      return m;
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: requestMessages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: TOOLS,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const message = choice.message as unknown as Record<string, unknown>;

    return {
      content: (message.content as string) || null,
      reasoning_content: (message.reasoning_content as string) || undefined,
      tool_calls: message.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
    };
  }

  /**
   * 重置对话
   */
  reset(): void {
    const skillCatalog = buildSkillCatalog(getLoadedSkills());
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT + skillCatalog }];
  }

  /**
   * 获取当前命盘
   */
  getChart() {
    return getCurrentChart();
  }

  /**
   * 获取当前缘主画像
   */
  getProfile(): UserProfile | null {
    return getCurrentProfile();
  }
}
