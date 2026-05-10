export { FateReadAgent } from './agent.js';
export type { AgentOptions, Message } from './agent.js';
export { SYSTEM_PROMPT } from './prompt.js';
export { TOOLS, executeTool } from './tools.js';

// 多流派系统
export { Orchestrator } from './schools/orchestrator.js';
export { ZipingAgent } from './schools/ziping-agent.js';
export { ZiweiAgent } from './schools/ziwei-agent.js';
export { MangpaiAgent } from './schools/mangpai-agent.js';
export { DebateProtocol } from './schools/debate.js';
export type {
  SchoolId,
  SchoolAgent,
  SchoolReport,
  AnalysisDimension,
  SynthesizedReport,
} from './schools/types.js';
