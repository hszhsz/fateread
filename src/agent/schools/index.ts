// ============================================================
// FateRead - Schools Module Entry (多流派模块入口)
// ============================================================

export { Orchestrator } from './orchestrator.js';
export type { OrchestratorConfig } from './orchestrator.js';

export { DebateProtocol } from './debate.js';
export type { DebateConfig } from './debate.js';

export { BaseSchoolAgent } from './base-school.js';
export { ZipingAgent } from './ziping-agent.js';
export { ZiweiAgent } from './ziwei-agent.js';
export { MangpaiAgent } from './mangpai-agent.js';

export type {
  SchoolId,
  SchoolAgent,
  SchoolReport,
  AnalysisDimension,
  DimensionAnalysis,
  DebateStatement,
  DebateConsensus,
  SynthesizedReport,
  SchoolAgentOptions,
} from './types.js';
export { SCHOOL_NAMES } from './types.js';
