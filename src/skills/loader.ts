// ============================================================
// FateRead - Skill System (技能加载与管理)
// ============================================================

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// Types
// ============================================================

export interface SkillMeta {
  name: string;
  description: string;
  allowedTools?: string[];
}

export interface Skill {
  meta: SkillMeta;
  content: string;       // Full SKILL.md content (body after frontmatter)
  path: string;          // File path to SKILL.md
}

// ============================================================
// YAML Frontmatter Parser (lightweight, no deps)
// ============================================================

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { meta: {}, body: raw };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { meta: {}, body: raw };
  }

  const yamlBlock = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');

  // Simple YAML parser for our use case (flat keys + arrays)
  const meta: Record<string, unknown> = {};
  let currentKey = '';
  let currentArray: string[] | null = null;
  let multiLineValue = '';
  let inMultiLine = false;

  for (const line of yamlBlock.split('\n')) {
    // Multi-line string continuation (indented)
    if (inMultiLine) {
      if (line.match(/^\s{2,}/) && !line.match(/^\w/)) {
        multiLineValue += line.trim() + '\n';
        continue;
      } else {
        meta[currentKey] = multiLineValue.trim();
        inMultiLine = false;
        currentArray = null; // Clear any stale array state
      }
    }

    // Array item
    if (line.match(/^\s+-\s+/)) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      if (currentArray) {
        currentArray.push(val);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      // Save previous array if any
      if (currentArray) {
        meta[currentKey] = currentArray;
        currentArray = null;
      }

      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '' || value === '|') {
        // Start multi-line or array
        if (value === '|') {
          inMultiLine = true;
          multiLineValue = '';
        } else {
          // Empty value — will be determined by next lines (array or empty)
          currentArray = [];
        }
      } else {
        meta[currentKey] = value;
      }
    }
  }

  // Finalize
  if (currentArray && currentArray.length > 0) {
    meta[currentKey] = currentArray;
  }
  if (inMultiLine) {
    meta[currentKey] = multiLineValue.trim();
  }

  return { meta, body };
}

// ============================================================
// Skill Discovery & Loading
// ============================================================

/**
 * 从 skills/ 目录加载所有技能
 */
export function loadSkills(skillsDir: string): Skill[] {
  const skills: Skill[] = [];

  if (!existsSync(skillsDir)) {
    return skills;
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    try {
      const raw = readFileSync(skillMdPath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);

      const skill: Skill = {
        meta: {
          name: (meta.name as string) || entry.name,
          description: (meta.description as string) || '',
          allowedTools: meta['allowed-tools'] as string[] | undefined,
        },
        content: body,
        path: skillMdPath,
      };

      skills.push(skill);
    } catch {
      // Skip malformed skills
    }
  }

  return skills;
}

/**
 * 根据名称获取技能
 */
export function getSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find(s => s.meta.name === name);
}

/**
 * 构建技能目录描述（注入到系统 prompt 中）
 */
export function buildSkillCatalog(skills: Skill[]): string {
  if (skills.length === 0) return '';

  let catalog = '\n\n## 可用技能（Skills）\n\n';
  catalog += '以下是你可以使用的专业深度分析技能。当用户请求匹配某个技能时，';
  catalog += '请先使用 `read_skill` 工具加载完整的技能说明，然后严格按照技能中定义的流程执行。\n\n';

  for (const skill of skills) {
    catalog += `### ${skill.meta.name}\n`;
    catalog += `- **描述**：${skill.meta.description.split('\n')[0]}\n`;
    catalog += `- **加载命令**：调用 read_skill 工具，参数 skill_name="${skill.meta.name}"\n\n`;
  }

  return catalog;
}

// ============================================================
// Document Output (保存 Markdown 文档)
// ============================================================

/**
 * 保存文档到 outputs 目录
 */
export function saveDocument(content: string, filename: string, outputDir: string): string {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filepath = join(outputDir, filename);
  writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

/**
 * 获取默认 skills 目录路径
 */
export function getDefaultSkillsDir(): string {
  // 从当前文件位置推算项目根目录
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // src/skills/loader.ts → 项目根/skills/
  return resolve(__dirname, '..', '..', 'skills');
}

/**
 * 获取默认 outputs 目录路径
 */
export function getDefaultOutputDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '..', '..', 'outputs');
}
