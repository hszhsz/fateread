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
export {
  generateUserId,
  identifyReturningUser,
  findOrCreateUser,
  getUser,
  listUsers,
  addMemory,
  addFactMemory,
  addPreferenceMemory,
  addInsightMemory,
  addSessionSummary,
  getMemories,
  pruneMemories,
  deleteMemory,
  updateMemoryImportance,
  extractMemoriesFromProfile,
  buildMemoryContext,
  buildReturningUserGreeting,
} from './memory-store.js';
export type { MemoryType, UserMemory } from './memory-store.js';
