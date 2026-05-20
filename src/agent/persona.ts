// ============================================================
// FateRead - Persona System (人设系统)
// Loads SOUL.md persona definitions and injects them into prompts.
// Inspired by OpenClaw's SOUL.md pattern.
// ============================================================

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SchoolId } from './schools/types.js';

// ============================================================
// Types
// ============================================================

export interface PersonaDefinition {
  /** The raw SOUL.md content */
  content: string;
  /** Which school this persona belongs to */
  schoolId: SchoolId;
  /** Display name */
  name: string;
}

// ============================================================
// Persona Registry
// ============================================================

const SOUL_FILES: Record<SchoolId, { file: string; name: string }> = {
  ziping: { file: 'ziping-scholar.soul.md', name: '注重逻辑的子平学者' },
  ziwei: { file: 'ziwei-teacher.soul.md', name: '温婉知心紫薇先生' },
  mangpai: { file: 'mangpai-master.soul.md', name: '铁口直断盲派大师' },
};

// ============================================================
// Cache
// ============================================================

const personaCache = new Map<SchoolId, PersonaDefinition>();

function getSoulsDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // In dev (tsx): __dirname = .../src/agent → souls/ is direct child
  let dir = resolve(__dirname, 'souls');
  if (existsSync(dir)) return dir;
  // In prod (compiled): __dirname = .../dist/agent → go up to project root → src/agent/souls
  dir = resolve(__dirname, '..', '..', 'src', 'agent', 'souls');
  return dir;
}

// ============================================================
// Public API
// ============================================================

/**
 * Load a persona definition for a given school.
 */
export function loadPersona(schoolId: SchoolId): PersonaDefinition {
  const cached = personaCache.get(schoolId);
  if (cached) return cached;

  const config = SOUL_FILES[schoolId];
  const filepath = resolve(getSoulsDir(), config.file);

  if (!existsSync(filepath)) {
    // Fallback: return a minimal persona
    const fallback: PersonaDefinition = {
      content: `你是一位${config.name}命理师。`,
      schoolId,
      name: config.name,
    };
    personaCache.set(schoolId, fallback);
    return fallback;
  }

  const content = readFileSync(filepath, 'utf-8');
  const persona: PersonaDefinition = { content, schoolId, name: config.name };
  personaCache.set(schoolId, persona);
  return persona;
}

/**
 * Get the persona injection for the system prompt.
 * This is the condensed version appended to the main system prompt to shape the assistant's persona.
 */
export function getPersonaPrompt(schoolId: SchoolId): string {
  const persona = loadPersona(schoolId);
  return `
---
# 当前人设：${persona.name}

**重要**：上文定义了你在与缘主交互时的完整人格设定。请严格遵循其中的：
1. **身份认同**和**性格特质** — 这是你与缘主交流的人格基础
2. **说话风格** — 这是你在所有回复中必须保持的语言风格
3. **情绪智慧** — 在面对缘主情绪波动时的回应方式
4. **心理疏导心法** — 当命盘中出现不利信息时的应对策略（最重要）
5. **核心信念** — 你的价值观底线
6. **禁忌** — 绝对不可违反的言行边界

${persona.content}
`;
}

/**
 * Get the school-specific persona prompt for sub-agents.
 * Lighter weight — focuses on the methodological approach rather than full interaction style.
 */
export function getSchoolPersonaPrompt(schoolId: SchoolId): string {
  const persona = loadPersona(schoolId);
  return `
## 你的人设：${persona.name}

以下是你作为${persona.name}的核心行为准则，请在分析中内化：
${persona.content}
`;
}

/**
 * Get all available persona names.
 */
export function listPersonas(): { schoolId: SchoolId; name: string }[] {
  return Object.entries(SOUL_FILES).map(([id, config]) => ({
    schoolId: id as SchoolId,
    name: config.name,
  }));
}
