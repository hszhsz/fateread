// ============================================================
// FateRead - Agent Runtime (Agent 核心运行时)
// ============================================================

import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOLS, executeTool, getCurrentChart, setCurrentChart } from './tools.js';

export interface AgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * FateRead Agent
 * 管理对话流程、工具调用、LLM 交互
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

    // 初始化系统提示
    this.messages.push({
      role: 'system',
      content: SYSTEM_PROMPT,
    });
  }

  /**
   * 发送用户消息并获取回复（完整流程，含工具调用循环）
   */
  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });

    // 工具调用循环
    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const response = await this.callLLM();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        // 没有工具调用，返回最终回复
        const content = response.content || '';
        this.messages.push({ role: 'assistant', content });
        return content;
      }

      // 有工具调用
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      // 执行工具
      for (const toolCall of response.tool_calls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n⚙️  调用工具: ${funcName}`);
        const result = executeTool(funcName, funcArgs);

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

    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const response = await this.callLLM();

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const content = response.content || '';
        this.messages.push({ role: 'assistant', content });
        yield content;
        return;
      }

      // 工具调用
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      for (const toolCall of response.tool_calls) {
        const funcName = toolCall.function.name;
        const funcArgs = JSON.parse(toolCall.function.arguments);

        yield `\n⚙️  正在排盘计算 (${funcName})...\n`;
        const result = executeTool(funcName, funcArgs);

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
      }
    }

    yield '抱歉，处理超时，请重试。';
  }

  /**
   * 调用 LLM
   */
  private async callLLM(): Promise<{
    content: string | null;
    tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls,
    };
  }

  /**
   * 重置对话
   */
  reset(): void {
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  /**
   * 获取当前命盘
   */
  getChart() {
    return getCurrentChart();
  }
}
