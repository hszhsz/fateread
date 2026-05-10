// ============================================================
// FateRead Skills - Index
// ============================================================

export {
  loadSkills,
  getSkill,
  buildSkillCatalog,
  saveDocument,
  getDefaultSkillsDir,
  getDefaultOutputDir,
} from './loader.js';

export type { Skill, SkillMeta } from './loader.js';

export { buildMingBookContext } from './ming-book.js';
export { buildYunBookContext } from './yun-book.js';
