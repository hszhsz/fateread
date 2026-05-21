// ============================================================
// FateRead - Shared LLM Client Factory
// Centralized OpenAI client creation, token tracking, retry logic
// ============================================================

import OpenAI from 'openai';

// ============================================================
// Types
// ============================================================

export interface LlmClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenTracker {
  total: TokenUsage;
  calls: number;
  /** Per-model breakdown */
  byModel: Record<string, TokenUsage>;
  /** Most recent call's usage */
  lastCall: TokenUsage;
}

// ============================================================
// Client Factory
// ============================================================

/**
 * Create an OpenAI client from environment + overrides.
 * Call this once and reuse the client for all LLM calls.
 */
export function createLlmClient(options: LlmClientOptions = {}): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  });
}

/**
 * Resolve model name from environment + overrides.
 */
export function resolveModel(options: LlmClientOptions = {}): string {
  return options.model || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';
}

/**
 * Resolve max tokens from environment + overrides.
 */
export function resolveMaxTokens(options: LlmClientOptions = {}): number {
  return options.maxTokens || Number(process.env.FATEREAD_MAX_TOKENS) || 262144;
}

// ============================================================
// Token Tracking
// ============================================================

export function createTokenTracker(): TokenTracker {
  return {
    total: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    calls: 0,
    byModel: {},
    lastCall: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function recordUsage(tracker: TokenTracker, model: string, usage: TokenUsage): void {
  tracker.total.promptTokens += usage.promptTokens;
  tracker.total.completionTokens += usage.completionTokens;
  tracker.total.totalTokens += usage.totalTokens;
  tracker.calls++;
  // Track per-call usage
  tracker.lastCall = { ...usage };

  if (!tracker.byModel[model]) {
    tracker.byModel[model] = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  tracker.byModel[model].promptTokens += usage.promptTokens;
  tracker.byModel[model].completionTokens += usage.completionTokens;
  tracker.byModel[model].totalTokens += usage.totalTokens;
}

export function formatTokenReport(tracker: TokenTracker): string {
  const lines: string[] = [
    `📊 Token 使用统计:`,
    `  总调用: ${tracker.calls} 次`,
    `  总 Tokens: ${tracker.total.totalTokens} (输入: ${tracker.total.promptTokens}, 输出: ${tracker.total.completionTokens})`,
  ];
  for (const [model, usage] of Object.entries(tracker.byModel)) {
    lines.push(`  ${model}: ${usage.totalTokens} tokens (${usage.promptTokens}+${usage.completionTokens})`);
  }
  return lines.join('\n');
}

/** Snapshot the cumulative tracker state to compute per-round deltas later. */
export function snapshotUsage(tracker: TokenTracker): TokenUsage {
  return { ...tracker.total };
}

/** Compute the delta between a prior snapshot and the current tracker state. */
export function diffUsage(tracker: TokenTracker, snapshot: TokenUsage): TokenUsage {
  return {
    promptTokens: tracker.total.promptTokens - snapshot.promptTokens,
    completionTokens: tracker.total.completionTokens - snapshot.completionTokens,
    totalTokens: tracker.total.totalTokens - snapshot.totalTokens,
  };
}

/** Format a single TokenUsage as a one-liner. */
export function formatUsage(usage: TokenUsage): string {
  return `💰 本轮消耗: ${usage.totalTokens} tokens (输入: ${usage.promptTokens}, 输出: ${usage.completionTokens})`;
}

// ============================================================
// Retry Logic
// ============================================================

const RETRYABLE_ERRORS = [
  'rate_limit',
  'server_error',
  'timeout',
  'network',
  'ECONNRESET',
  'ETIMEDOUT',
];

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return RETRYABLE_ERRORS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Execute an async function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY, ...config };

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * (0.5 + Math.random());
      console.warn(`⚠️  LLM 调用失败 (${attempt + 1}/${maxRetries}), ${Math.round(jitter)}ms 后重试...`);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }
  throw lastError;
}

// ============================================================
// DeepSeek Reasoning Content Helper
// ============================================================

/**
 * Extract content from a response, falling back to reasoning_content
 * for DeepSeek reasoning models that may exhaust output tokens.
 */
export function extractContent(message: Record<string, unknown> | undefined | null): string {
  if (!message) return '';
  const content = (message.content as string) || '';
  if (content) return content;
  // Fallback: DeepSeek reasoning models may only have reasoning_content
  return (message.reasoning_content as string) || '';
}

/**
 * Extract reasoning_content if available (for preservation across requests).
 */
export function extractReasoning(message: Record<string, unknown> | undefined | null): string | undefined {
  if (!message) return undefined;
  return (message.reasoning_content as string) || undefined;
}
