// FateRead - Main Entry
export { paipan, formatChart } from './core/index.js';
export { FateReadAgent } from './agent/agent.js';
export type { AgentOptions } from './agent/agent.js';
export type { BaziChart, PaipanInput, UserProfile, ParentInfo, SiblingInfo, LifeEvent } from './core/types.js';

// Skill system
export { loadSkills, getSkill, buildSkillCatalog, saveDocument, getDefaultSkillsDir, getDefaultOutputDir } from './skills/index.js';
export type { Skill, SkillMeta } from './skills/index.js';

// Legacy skill functions
export { generateMingBook, generateYunBook } from './skills/index.js';
export type { MingBookOptions, YunBookOptions } from './skills/index.js';
