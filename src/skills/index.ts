// ============================================================
// FateRead Skills - Index
// ============================================================

// Skill system (loader, types, document output)
export {
  loadSkills,
  getSkill,
  buildSkillCatalog,
  saveDocument,
  getDefaultSkillsDir,
  getDefaultOutputDir,
} from './loader.js';

export type { Skill, SkillMeta } from './loader.js';

// Legacy skill functions (kept for backward compatibility)
export { generateMingBook, buildMingBookContext } from './ming-book.js';
export type { MingBookOptions } from './ming-book.js';

export { generateYunBook, buildYunBookContext } from './yun-book.js';
export type { YunBookOptions } from './yun-book.js';
