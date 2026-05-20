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
  appendMessage,
  getDb,
} from './session-store.js';
export type { SessionData } from './session-store.js';
export { closeDb as closeDatabase } from './database.js';
export {
  createIntakeState,
  advanceIntake,
  declineCurrentStep,
  canStartCharting,
  getStepPromptHint,
  getIntakeSummary,
} from './intake-state.js';
export type { IntakeState, IntakeStep } from './intake-state.js';
