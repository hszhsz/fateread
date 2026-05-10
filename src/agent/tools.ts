// ============================================================
// FateRead - Agent Tools (工具定义)
// 支持 Skill 系统：read_skill + save_document
// ============================================================

import { paipan, formatChart, calculateLiuNian, calculateLiuNianRange } from '../core/index.js';
import type { PaipanInput, BaziChart } from '../core/types.js';
import { CITY_LONGITUDE } from '../core/solar-time.js';
import { getShiShen, STEM_ELEMENT } from '../core/constants.js';
import { loadSkills, getSkill, saveDocument, getDefaultSkillsDir, getDefaultOutputDir } from '../skills/loader.js';
import { buildMingBookContext } from '../skills/ming-book.js';
import { buildYunBookContext } from '../skills/yun-book.js';
import type { Skill } from '../skills/loader.js';

// ============================================================
// Skills 加载（启动时）
// ============================================================

let loadedSkills: Skill[] = [];

export function initSkills(skillsDir?: string): void {
  const dir = skillsDir || getDefaultSkillsDir();
  loadedSkills = loadSkills(dir);
  if (loadedSkills.length > 0) {
    console.log(`📚 已加载 ${loadedSkills.length} 个技能: ${loadedSkills.map(s => s.meta.name).join(', ')}`);
  }
}

export function getLoadedSkills(): Skill[] {
  return loadedSkills;
}

// ============================================================
// 工具定义
// ============================================================

/**
 * OpenAI function calling 格式的工具定义
 */
export const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'paipan',
      description: '八字排盘：根据出生时间和地点，计算完整的四柱八字命盘。返回四柱、藏干、十神、大运、流年、神煞、五行分析等全部信息。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '出生年份（公历），如 1990' },
          month: { type: 'number', description: '出生月份（公历），1-12' },
          day: { type: 'number', description: '出生日期（公历），1-31' },
          hour: { type: 'number', description: '出生小时（24小时制），0-23' },
          minute: { type: 'number', description: '出生分钟，0-59，默认0' },
          gender: { type: 'string', enum: ['male', 'female'], description: '性别：male=男, female=女' },
          city: { type: 'string', description: '出生城市名（中文），用于真太阳时校正。如：北京、上海、成都' },
          longitude: { type: 'number', description: '出生地经度（可选，如果提供了city则自动获取）' },
        },
        required: ['year', 'month', 'day', 'hour', 'gender'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_liunian',
      description: '分析特定年份的流年运势：计算该年的干支并分析其与命局的关系',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '要分析的年份' },
        },
        required: ['year'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_liunian_range',
      description: '分析一段时间范围内的流年运势',
      parameters: {
        type: 'object',
        properties: {
          start_year: { type: 'number', description: '起始年份' },
          end_year: { type: 'number', description: '结束年份' },
        },
        required: ['start_year', 'end_year'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_skill',
      description: '加载一个专业技能的完整说明。返回技能的方法论和执行步骤，LLM 应严格按照技能说明中的流程执行。可用技能：ming-book（命之书，先天特质分析）、yun-book（运之书，大运流年分析）。',
      parameters: {
        type: 'object',
        properties: {
          skill_name: { type: 'string', description: '技能名称：ming-book 或 yun-book' },
        },
        required: ['skill_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_chart_context',
      description: '获取当前命盘的结构化上下文数据（用于命之书/运之书撰写）。type=ming 返回先天特质分析所需数据，type=yun 返回大运流年分析所需数据。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['ming', 'yun'], description: '上下文类型：ming=命之书, yun=运之书' },
          start_year: { type: 'number', description: '（仅 yun 类型）流年分析起始年份' },
          end_year: { type: 'number', description: '（仅 yun 类型）流年分析结束年份' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_document',
      description: '将生成的 Markdown 文档保存为本地文件。用于保存命之书、运之书等长文档。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要保存的 Markdown 文档内容' },
          filename: { type: 'string', description: '文件名（含 .md 后缀），如"命之书_庚午庚辰壬子庚戌_2026-05-10.md"' },
        },
        required: ['content', 'filename'],
      },
    },
  },
];

// ============================================================
// 当前会话状态
// ============================================================

let currentChart: BaziChart | null = null;
let outputDir: string = getDefaultOutputDir();

export function getCurrentChart(): BaziChart | null {
  return currentChart;
}

export function setCurrentChart(chart: BaziChart): void {
  currentChart = chart;
}

export function setOutputDir(dir: string): void {
  outputDir = dir;
}

// ============================================================
// 工具执行分发
// ============================================================

/**
 * 执行工具调用
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'paipan':
      return executePaipan(args);
    case 'analyze_liunian':
      return executeAnalyzeLiuNian(args);
    case 'analyze_liunian_range':
      return executeAnalyzeLiuNianRange(args);
    case 'read_skill':
      return executeReadSkill(args);
    case 'get_chart_context':
      return executeGetChartContext(args);
    case 'save_document':
      return executeSaveDocument(args);
    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

// ============================================================
// 工具实现
// ============================================================

function executePaipan(args: Record<string, unknown>): string {
  const city = args.city as string | undefined;
  let longitude = args.longitude as number | undefined;

  if (city && !longitude) {
    longitude = CITY_LONGITUDE[city];
  }

  const input: PaipanInput = {
    year: args.year as number,
    month: args.month as number,
    day: args.day as number,
    hour: args.hour as number,
    minute: (args.minute as number) || 0,
    gender: args.gender as 'male' | 'female',
    longitude: longitude || 120,
  };

  try {
    const chart = paipan(input);
    currentChart = chart;

    const formatted = formatChart(chart);
    return JSON.stringify({
      formatted,
      data: chart,
    }, null, 2);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `排盘失败: ${msg}` });
  }
}

function executeAnalyzeLiuNian(args: Record<string, unknown>): string {
  const year = args.year as number;
  const pillar = calculateLiuNian(year);

  const result: Record<string, unknown> = {
    year,
    ganZhi: `${pillar.stem}${pillar.branch}`,
    stem: pillar.stem,
    branch: pillar.branch,
    stemElement: STEM_ELEMENT[pillar.stem],
  };

  if (currentChart) {
    const dayStem = currentChart.fourPillars.day.stem;
    result.stemRelation = getShiShen(dayStem, pillar.stem);
    result.dayMaster = dayStem;
    result.usefulGod = currentChart.analysis.usefulGod;
    result.harmfulGod = currentChart.analysis.harmfulGod;
  }

  return JSON.stringify(result, null, 2);
}

function executeAnalyzeLiuNianRange(args: Record<string, unknown>): string {
  const startYear = args.start_year as number;
  const endYear = args.end_year as number;

  const range = calculateLiuNianRange(startYear, endYear);

  const result = range.map(({ year, pillar }) => {
    const entry: Record<string, unknown> = {
      year,
      ganZhi: `${pillar.stem}${pillar.branch}`,
    };
    if (currentChart) {
      const dayStem = currentChart.fourPillars.day.stem;
      entry.stemRelation = getShiShen(dayStem, pillar.stem);
    }
    return entry;
  });

  return JSON.stringify(result, null, 2);
}

function executeReadSkill(args: Record<string, unknown>): string {
  const skillName = args.skill_name as string;
  const skill = getSkill(loadedSkills, skillName);

  if (!skill) {
    const available = loadedSkills.map(s => s.meta.name).join(', ');
    return JSON.stringify({
      error: `技能 "${skillName}" 未找到。可用技能: ${available || '无'}`,
    });
  }

  return JSON.stringify({
    name: skill.meta.name,
    description: skill.meta.description,
    methodology: skill.content,
  });
}

function executeGetChartContext(args: Record<string, unknown>): string {
  if (!currentChart) {
    return JSON.stringify({ error: '请先使用 paipan 工具排盘' });
  }

  const type = args.type as string;

  if (type === 'ming') {
    return buildMingBookContext(currentChart);
  } else if (type === 'yun') {
    const startYear = args.start_year as number | undefined;
    const endYear = args.end_year as number | undefined;
    return buildYunBookContext(currentChart, startYear, endYear);
  }

  return JSON.stringify({ error: `未知上下文类型: ${type}` });
}

function executeSaveDocument(args: Record<string, unknown>): string {
  const content = args.content as string;
  const filename = args.filename as string;

  if (!content || !filename) {
    return JSON.stringify({ error: '缺少 content 或 filename 参数' });
  }

  try {
    const filepath = saveDocument(content, filename, outputDir);
    console.log(`\n💾 文档已保存: ${filepath}\n`);
    return JSON.stringify({
      success: true,
      filepath,
      size: content.length,
      message: `文档已保存到: ${filepath}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `保存失败: ${msg}` });
  }
}
