// ============================================================
// FateRead - Shared Utilities Barrel Export
// ============================================================

export { sanitizeJson, safeJsonParse, getField } from './json-utils.js';
export {
  createLlmClient,
  resolveModel,
  resolveMaxTokens,
  createTokenTracker,
  recordUsage,
  formatTokenReport,
  withRetry,
  extractContent,
  extractReasoning,
} from './llm-client.js';
export type { LlmClientOptions, TokenTracker, TokenUsage, RetryConfig } from './llm-client.js';
export {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  generateSessionId,
} from './session-store.js';
export type { SessionData, SerializableMessage } from './session-store.js';
export {
  createIntakeState,
  advanceIntake,
  declineCurrentStep,
  canStartCharting,
  getStepPromptHint,
  getIntakeSummary,
} from './intake-state.js';
export type { IntakeState, IntakeStep } from './intake-state.js';
