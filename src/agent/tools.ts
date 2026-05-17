// ============================================================
// FateRead - Agent Tools (工具定义)
// Instance-based state, context window management, intake state machine
// ============================================================

import { paipan, formatChart, calculateLiuNian, calculateLiuNianRange } from '../core/index.js';
import type { PaipanInput, BaziChart, UserProfile, LifeEvent } from '../core/types.js';
import { CITY_LONGITUDE } from '../core/solar-time.js';
import { getShiShen, STEM_ELEMENT, TIAN_GAN, DI_ZHI } from '../core/constants.js';
import { loadSkills, getSkill, saveDocument as saveDocToDisk, getDefaultSkillsDir, getDefaultOutputDir } from '../skills/loader.js';
import { buildMingBookContext } from '../skills/ming-book.js';
import { buildYunBookContext } from '../skills/yun-book.js';
import type { Skill } from '../skills/loader.js';
import { verifyPillars } from './verify-pillars.js';
import { Orchestrator } from './schools/orchestrator.js';
import type { SynthesizedReport, AnalysisDimension, SchoolId } from './schools/types.js';
import { SCHOOL_NAMES } from './schools/types.js';
import type { TokenTracker } from '../shared/llm-client.js';
import { createLlmClient } from '../shared/llm-client.js';
import {
  createIntakeState,
  advanceIntake,
  declineCurrentStep,
  canStartCharting,
  getStepPromptHint,
  getIntakeSummary,
} from '../shared/intake-state.js';
import type { IntakeState, IntakeStep } from '../shared/intake-state.js';

// ============================================================
// Tool Definitions (OpenAI function calling format)
// ============================================================

/**
 * Build the dynamic tool list based on debate mode and active school.
 */
export function getTools(debateMode: boolean, schoolName: string) {
  const analyzeTool = debateMode
    ? {
        type: 'function' as const,
        function: {
          name: 'multi_school_analyze',
          description: '三派会诊综合分析：同时调用子平八字、紫微斗数、盲派命理三个流派对命盘进行分析，如三派结论有分歧将自动启动辩论协调。必须先排盘。',
          parameters: {
            type: 'object',
            properties: {
              dimensions: {
                type: 'array',
                items: { type: 'string', enum: ['personality', 'career', 'wealth', 'marriage', 'health', 'education', 'interpersonal', 'timing', 'overall'] },
                description: '分析维度列表',
              },
            },
            required: [],
          },
        },
      }
    : {
        type: 'function' as const,
        function: {
          name: 'multi_school_analyze',
          description: `使用${schoolName}流派对命盘进行分析。当前仅运行${schoolName}单一流派，不启动多派辩论。必须先排盘。`,
          parameters: {
            type: 'object',
            properties: {
              dimensions: {
                type: 'array',
                items: { type: 'string', enum: ['personality', 'career', 'wealth', 'marriage', 'health', 'education', 'interpersonal', 'timing', 'overall'] },
                description: '分析维度列表',
              },
            },
            required: [],
          },
        },
      };

  return [
    // ---- 缘主画像采集 ----
    {
      type: 'function' as const,
      function: {
        name: 'update_profile',
        description: '更新缘主画像信息。在对话中逐步收集到的信息通过此工具保存。支持增量更新——每次只需传入新获取的字段。当所有必要信息收集完毕后，设置 intake_complete=true。',
        parameters: {
          type: 'object',
          properties: {
            birth_year: { type: 'number', description: '出生年份（公历）' },
            birth_month: { type: 'number', description: '出生月份（公历）' },
            birth_day: { type: 'number', description: '出生日期（公历）' },
            birth_hour: { type: 'number', description: '出生小时（24小时制）' },
            birth_minute: { type: 'number', description: '出生分钟' },
            gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
            birth_city: { type: 'string', description: '出生城市' },
            father_birth_year: { type: 'number', description: '父亲出生年份' },
            mother_birth_year: { type: 'number', description: '母亲出生年份' },
            parent_notes: { type: 'string', description: '关于父母的补充说明' },
            sibling_rank: { type: 'number', description: '排行第几' },
            total_siblings: { type: 'number', description: '兄弟姐妹总数（含自己）' },
            sibling_birth_years: { type: 'array', items: { type: 'number' }, description: '兄弟姐妹出生年份列表' },
            is_twin: { type: 'boolean', description: '是否双胞胎' },
            twin_birth_minute_diff: { type: 'number', description: '双胞胎出生时间差（分钟）' },
            sibling_notes: { type: 'string', description: '关于兄弟姐妹的补充说明' },
            life_events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  year: { type: 'number', description: '事件年份' },
                  category: { type: 'string', enum: ['career', 'education', 'marriage', 'health', 'wealth', 'family', 'other'] },
                  description: { type: 'string', description: '事件描述' },
                  is_positive: { type: 'boolean', description: '是否为正面事件' },
                },
                required: ['year', 'category', 'description'],
              },
              description: '重大人生事件列表',
            },
            concerns: { type: 'array', items: { type: 'string' }, description: '缘主最关心的领域' },
            specific_question: { type: 'string', description: '缘主具体想问的问题' },
            intake_complete: { type: 'boolean', description: '信息采集是否完成' },
            decline_step: { type: 'boolean', description: '缘主是否表示不想继续当前步骤，设为 true 跳过当前步骤' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_profile',
        description: '获取当前已采集的缘主画像信息，查看采集进度。',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    // ---- 排盘 ----
    {
      type: 'function' as const,
      function: {
        name: 'paipan',
        description: '八字排盘：根据缘主画像中的出生信息，计算完整的四柱八字命盘。调用前应确保已收集完整出生信息。',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'number', description: '出生年份（公历）' },
            month: { type: 'number', description: '出生月份（公历），1-12' },
            day: { type: 'number', description: '出生日期（公历），1-31' },
            hour: { type: 'number', description: '出生小时（24小时制），0-23' },
            minute: { type: 'number', description: '出生分钟，默认0' },
            gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
            city: { type: 'string', description: '出生城市名（中文），用于真太阳时校正' },
            longitude: { type: 'number', description: '出生地经度（可选）' },
          },
          required: ['year', 'month', 'day', 'hour', 'gender'],
        },
      },
    },
    {
      type: 'function' as const,
      function: { name: 'analyze_liunian', description: '分析特定年份的流年运势', parameters: { type: 'object', properties: { year: { type: 'number' } }, required: ['year'] } },
    },
    {
      type: 'function' as const,
      function: { name: 'analyze_liunian_range', description: '分析一段时间范围的流年运势', parameters: { type: 'object', properties: { start_year: { type: 'number' }, end_year: { type: 'number' } }, required: ['start_year', 'end_year'] } },
    },
    // ---- 命盘分析 ----
    analyzeTool,
    // ---- Skill 系统 ----
    {
      type: 'function' as const,
      function: { name: 'read_skill', description: '加载专业技能说明', parameters: { type: 'object', properties: { skill_name: { type: 'string' } }, required: ['skill_name'] } },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_chart_context',
        description: '获取当前命盘的结构化上下文数据（用于撰写命之书/运之书）',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['ming', 'yun'], description: '上下文类型' },
            start_year: { type: 'number' },
            end_year: { type: 'number' },
          },
          required: ['type'],
        },
      },
    },
    {
      type: 'function' as const,
      function: { name: 'save_document', description: '将生成的 Markdown 文档保存为本地文件', parameters: { type: 'object', properties: { content: { type: 'string' }, filename: { type: 'string' } }, required: ['content', 'filename'] } },
    },
  ];
}

// Keep the original static TOOLS for backward compatibility
export const TOOLS = getTools(false, '子平八字');

// ============================================================
// SessionState — per-session, no globals
// ============================================================

export class SessionState {
  chart: BaziChart | null = null;
  profile: UserProfile | null = null;
  intake: IntakeState;
  skills: Skill[] = [];
  orchestrator: Orchestrator | null = null;
  lastReport: SynthesizedReport | null = null;
  outputDir: string;
  tokenTracker: TokenTracker | undefined;
  activeSchool: SchoolId;
  debateMode: boolean;
  /** 进度回调，用于 TUI 实时显示分析过程 */
  onProgress?: (message: string) => void;

  constructor(tokenTracker?: TokenTracker, activeSchool: SchoolId = 'ziping', debateMode = false) {
    this.outputDir = getDefaultOutputDir();
    this.tokenTracker = tokenTracker;
    this.intake = createIntakeState();
    this.activeSchool = activeSchool;
    this.debateMode = debateMode;
  }

  loadSkills(skillsDir?: string): void {
    const dir = skillsDir || getDefaultSkillsDir();
    this.skills = loadSkills(dir);
    if (this.skills.length > 0) {
      console.log(`📚 已加载 ${this.skills.length} 个技能: ${this.skills.map(s => s.meta.name).join(', ')}`);
    }
  }

  getOrchestrator(): Orchestrator {
    if (!this.orchestrator) {
      this.orchestrator = new Orchestrator({ verbose: true, onProgress: this.onProgress });
    }
    return this.orchestrator;
  }

  /**
   * Get the intake prompt hint for the current step.
   * Injected into the system prompt dynamically.
   */
  getIntakeHint(): string {
    return getStepPromptHint(this.intake);
  }

  /**
   * Serialize all mutable state for session persistence.
   */
  toJSON(): Record<string, unknown> {
    return {
      chart: this.chart,
      profile: this.profile,
      intake: this.intake,
    };
  }

  /**
   * Restore state from serialized data.
   */
  fromJSON(data: Record<string, unknown>): void {
    if (data.chart) this.chart = data.chart as BaziChart;
    if (data.profile) {
      this.profile = data.profile as UserProfile;
      this.intake = createIntakeState(this.profile);
    }
    if (data.intake) this.intake = data.intake as IntakeState;
  }
}

// ============================================================
// Tool Execution
// ============================================================

/**
 * Execute a tool call and return the result string.
 * The state parameter contains all per-session mutable state.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  state: SessionState,
): Promise<string> {
  switch (name) {
    case 'update_profile': return executeUpdateProfile(args, state);
    case 'get_profile': return executeGetProfile(state);
    case 'paipan': return executePaipan(args, state);
    case 'analyze_liunian': return executeAnalyzeLiuNian(args, state);
    case 'analyze_liunian_range': return executeAnalyzeLiuNianRange(args, state);
    case 'multi_school_analyze': return executeMultiSchoolAnalyze(args, state);
    case 'read_skill': return executeReadSkill(args, state);
    case 'get_chart_context': return executeGetChartContext(args, state);
    case 'save_document': return executeSaveDocument(args, state);
    default: return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

// ============================================================
// Tool Result Compression
// ============================================================

/**
 * Extract a compact summary from a tool result for context window management.
 * Returns a short string that replaces the full result in conversation messages.
 */
export function compressToolResult(name: string, resultStr: string): string {
  try {
    const result = JSON.parse(resultStr);

    switch (name) {
      case 'paipan':
        if (result.formatted) {
          // Return only the formatted text, strip full data
          return result.formatted;
        }
        break;
      case 'multi_school_analyze':
        if (result.meta) {
          const debatedDims = result.meta.debatedDimensions as string[];
          const isDebate = debatedDims && debatedDims.length > 0;
          const summary = isDebate
            ? `三派会诊完成 | 一致率: ${result.meta.agreementRate}% | 辩论维度: ${debatedDims.join(', ')}`
            : `单流派分析完成 | ${result.meta.agreementRate}%`;
          return JSON.stringify({
            summary,
            meta: result.meta,
            formatted: result.formatted?.slice(0, 500) + '...(完整报告见后续展示)',
          });
        }
        break;
      case 'get_chart_context':
        // Context is already structured data for the LLM, keep as-is but truncate if huge
        if (resultStr.length > 4000) {
          return resultStr.slice(0, 4000) + '\n...(数据已截断，关键信息完整)';
        }
        break;
      case 'read_skill':
        if (result.methodology) {
          return JSON.stringify({
            name: result.name,
            description: result.description,
            methodology: result.methodology,
          });
        }
        break;
      default:
        break;
    }
  } catch {
    // Not JSON, return as-is
  }
  return resultStr;
}

// ============================================================
// Helper: year → GanZhi
// ============================================================

function yearToGanZhi(year: number): string {
  const stemIdx = (year - 4) % 10;
  const branchIdx = (year - 4) % 12;
  return `${TIAN_GAN[stemIdx >= 0 ? stemIdx : stemIdx + 10]}${DI_ZHI[branchIdx >= 0 ? branchIdx : branchIdx + 12]}`;
}

// ============================================================
// Profile Context Formatter (for injection into LLM context)
// ============================================================

export function formatProfileContext(profile: UserProfile): string {
  let ctx = '# 缘主画像（纬线信息）\n\n';

  if (profile.parents) {
    ctx += '## 第一类：根源信息（定根基）\n';
    const p = profile.parents;
    if (p.fatherBirthYear) ctx += `- 父亲年命：${p.fatherBirthYear}年（${p.fatherGanZhi || yearToGanZhi(p.fatherBirthYear)}年）\n`;
    if (p.motherBirthYear) ctx += `- 母亲年命：${p.motherBirthYear}年（${p.motherGanZhi || yearToGanZhi(p.motherBirthYear)}年）\n`;
    if (p.notes) ctx += `- 补充说明：${p.notes}\n`;
    ctx += '\n';
  }

  if (profile.siblings) {
    ctx += '## 第二类：结构信息（定太极点）\n';
    const s = profile.siblings;
    ctx += `- 排行：第${s.rank}（共${s.totalSiblings}个兄弟姐妹）\n`;
    if (s.isTwin) {
      ctx += `- 双胞胎：是`;
      if (s.twinBirthMinuteDiff) ctx += `（出生时间差 ${s.twinBirthMinuteDiff} 分钟）`;
      ctx += '\n';
    }
    if (s.siblingBirthYears && s.siblingBirthYears.length > 0) {
      ctx += `- 兄弟姐妹出生年份：${s.siblingBirthYears.map(y => `${y}年(${yearToGanZhi(y)})`).join('、')}\n`;
    }
    if (s.notes) ctx += `- 补充说明：${s.notes}\n`;
    ctx += '\n';
  }

  if (profile.lifeEvents && profile.lifeEvents.length > 0) {
    ctx += '## 第三类：应期信息（定刻度）\n';
    const categoryMap: Record<string, string> = {
      career: '事业', education: '学业', marriage: '婚恋',
      health: '健康', wealth: '财运', family: '家庭', other: '其他',
    };
    for (const ev of profile.lifeEvents) {
      const cat = categoryMap[ev.category] || ev.category;
      const nature = ev.isPositive === true ? '（吉）' : ev.isPositive === false ? '（凶）' : '';
      ctx += `- ${ev.year}年【${cat}${nature}】：${ev.description}\n`;
    }
    ctx += '\n';
  }

  if (profile.concerns && profile.concerns.length > 0) {
    ctx += `## 缘主关注\n- 关心领域：${profile.concerns.join('、')}\n`;
  }
  if (profile.specificQuestion) {
    ctx += `- 具体问题：${profile.specificQuestion}\n`;
  }

  return ctx;
}

// ============================================================
// Tool Handlers
// ============================================================

function executeUpdateProfile(args: Record<string, unknown>, state: SessionState): string {
  if (!state.profile) {
    state.profile = { birthYear: 0, birthMonth: 0, birthDay: 0, birthHour: 0, gender: 'male' };
  }

  const p = state.profile;

  if (args.birth_year !== undefined) p.birthYear = args.birth_year as number;
  if (args.birth_month !== undefined) p.birthMonth = args.birth_month as number;
  if (args.birth_day !== undefined) p.birthDay = args.birth_day as number;
  if (args.birth_hour !== undefined) p.birthHour = args.birth_hour as number;
  if (args.birth_minute !== undefined) p.birthMinute = args.birth_minute as number;
  if (args.gender !== undefined) p.gender = args.gender as 'male' | 'female';
  if (args.birth_city !== undefined) p.birthCity = args.birth_city as string;

  if (args.father_birth_year !== undefined || args.mother_birth_year !== undefined || args.parent_notes !== undefined) {
    if (!p.parents) p.parents = {};
    if (args.father_birth_year !== undefined) {
      p.parents.fatherBirthYear = args.father_birth_year as number;
      p.parents.fatherGanZhi = yearToGanZhi(args.father_birth_year as number);
    }
    if (args.mother_birth_year !== undefined) {
      p.parents.motherBirthYear = args.mother_birth_year as number;
      p.parents.motherGanZhi = yearToGanZhi(args.mother_birth_year as number);
    }
    if (args.parent_notes !== undefined) p.parents.notes = args.parent_notes as string;
  }

  if (args.sibling_rank !== undefined || args.total_siblings !== undefined || args.is_twin !== undefined) {
    if (!p.siblings) p.siblings = { rank: 1, totalSiblings: 1 };
    if (args.sibling_rank !== undefined) p.siblings.rank = args.sibling_rank as number;
    if (args.total_siblings !== undefined) p.siblings.totalSiblings = args.total_siblings as number;
    if (args.sibling_birth_years !== undefined) p.siblings.siblingBirthYears = args.sibling_birth_years as number[];
    if (args.is_twin !== undefined) p.siblings.isTwin = args.is_twin as boolean;
    if (args.twin_birth_minute_diff !== undefined) p.siblings.twinBirthMinuteDiff = args.twin_birth_minute_diff as number;
    if (args.sibling_notes !== undefined) p.siblings.notes = args.sibling_notes as string;
  }

  if (args.life_events !== undefined) {
    const events = args.life_events as LifeEvent[];
    if (!p.lifeEvents) p.lifeEvents = [];
    p.lifeEvents.push(...events);
  }

  if (args.concerns !== undefined) p.concerns = args.concerns as string[];
  if (args.specific_question !== undefined) p.specificQuestion = args.specific_question as string;
  if (args.intake_complete !== undefined) p.intakeComplete = args.intake_complete as boolean;

  if (p.birthCity) {
    p.birthLongitude = CITY_LONGITUDE[p.birthCity] || p.birthLongitude;
  }

  // Handle decline step
  if (args.decline_step) {
    declineCurrentStep(state.intake);
  }

  // Sync profile to intake state machine and advance
  state.intake.profile = p;
  advanceIntake(state.intake);

  const progress = getIntakeProgress(p);

  return JSON.stringify({
    success: true,
    message: '缘主画像已更新',
    progress,
    intake_step: state.intake.step,
    intake_hint: getStepPromptHint(state.intake),
  }, null, 2);
}

function executeGetProfile(state: SessionState): string {
  if (!state.profile) {
    return JSON.stringify({
      message: '尚未开始采集缘主信息',
      profile: null,
      progress: { hasBasicInfo: false, completeness: '0%' },
      intake_step: state.intake.step,
    });
  }
  return JSON.stringify({
    profile: state.profile,
    progress: getIntakeProgress(state.profile),
    intake_step: state.intake.step,
    intake_summary: getIntakeSummary(state.intake),
  }, null, 2);
}

function getIntakeProgress(profile: UserProfile): Record<string, unknown> {
  const hasBasicInfo = !!(profile.birthYear && profile.birthMonth && profile.birthDay && profile.birthHour && profile.gender);
  const hasBirthCity = !!profile.birthCity;
  const hasParentInfo = !!(profile.parents && (profile.parents.fatherBirthYear || profile.parents.motherBirthYear));
  const hasSiblingInfo = !!(profile.siblings && profile.siblings.rank && profile.siblings.totalSiblings);
  const hasLifeEvents = !!(profile.lifeEvents && profile.lifeEvents.length > 0);
  const hasConcerns = !!(profile.concerns && profile.concerns.length > 0);

  let score = 0;
  if (hasBasicInfo) score += 30;
  if (hasBirthCity) score += 10;
  if (profile.gender) score += 5;
  if (hasParentInfo) score += 15;
  if (hasSiblingInfo) score += 10;
  if (hasLifeEvents) score += 20;
  if (hasConcerns) score += 10;

  return {
    hasBasicInfo, hasBirthCity, hasParentInfo, hasSiblingInfo, hasLifeEvents, hasConcerns,
    intakeComplete: !!profile.intakeComplete,
    completeness: `${Math.min(score, 100)}%`,
    missingRequired: !hasBasicInfo ? ['出生年月日时', '性别'] : [],
    missingRecommended: [
      ...(!hasBirthCity ? ['出生城市'] : []),
      ...(!hasParentInfo ? ['父母出生年份'] : []),
      ...(!hasSiblingInfo ? ['兄弟姐妹排行'] : []),
      ...(!hasLifeEvents ? ['重大人生事件'] : []),
      ...(!hasConcerns ? ['关心的领域'] : []),
    ],
  };
}

// ============================================================
// Paipan
// ============================================================

async function executePaipan(args: Record<string, unknown>, state: SessionState): Promise<string> {
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
    let chart = paipan(input);

    // LLM Verification
    let verificationNote = '';
    try {
      console.log('🔍 正在调用 LLM 验证四柱计算结果...');
      const verifyResult = await verifyPillars(chart, {
        year: input.year, month: input.month, day: input.day,
        hour: input.hour, minute: input.minute, city, longitude: input.longitude,
      });

      if (!verifyResult.verified && verifyResult.corrections && verifyResult.corrections.length > 0) {
        console.warn('⚠️  LLM 验证发现四柱差异，尝试修正...');
        for (const c of verifyResult.corrections) {
          console.warn(`   ${c.pillar}柱: ${c.original} → ${c.corrected} (${c.reason})`);
        }
        verificationNote = '\n\n⚠️ LLM 验证提示：';
        for (const c of verifyResult.corrections) {
          verificationNote += `\n- ${c.pillar}柱：算法计算为"${c.original}"，LLM 认为应为"${c.corrected}"（${c.reason}）`;
        }
        verificationNote += '\n请以 LLM 验证结果为准进行解读。';

        const hasDayCorrection = verifyResult.corrections.some(c => c.pillar === 'day');
        if (hasDayCorrection) {
          verificationNote += '\n⚠️ 注意：日柱存在差异，衍生数据可能不准确。';
        } else {
          for (const c of verifyResult.corrections) {
            if (c.pillar !== 'day') {
              chart.fourPillars[c.pillar] = {
                stem: c.corrected[0] as typeof chart.fourPillars.year.stem,
                branch: c.corrected[1] as typeof chart.fourPillars.year.branch,
              };
            }
          }
        }
      } else if (verifyResult.skipped) {
        console.log(`⚠️  LLM 验证未完成（${verifyResult.skipReason}），使用算法结果`);
        verificationNote = `\n\n⚠️ LLM 验证未完成（${verifyResult.skipReason}），使用算法计算结果。`;
      } else {
        console.log('✅ LLM 验证通过，四柱计算正确');
        verificationNote = '\n\n✅ 四柱已通过 LLM 独立验证，结果正确。';
      }
    } catch (verifyError: unknown) {
      const msg = verifyError instanceof Error ? verifyError.message : String(verifyError);
      console.warn(`⚠️  LLM 验证失败 (${msg})，继续使用算法结果`);
      verificationNote = '\n\n⚠️ LLM 验证未能完成，使用算法计算结果。';
    }

    state.chart = chart;

    // Sync profile
    if (state.profile) {
      state.profile.birthYear = input.year;
      state.profile.birthMonth = input.month;
      state.profile.birthDay = input.day;
      state.profile.birthHour = input.hour;
      state.profile.birthMinute = input.minute;
      state.profile.gender = input.gender;
      if (city) state.profile.birthCity = city;
      if (longitude) state.profile.birthLongitude = longitude;
    }

    const formatted = formatChart(chart) + verificationNote;
    return JSON.stringify({ formatted, data: chart }, null, 2);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `排盘失败: ${msg}` });
  }
}

function executeAnalyzeLiuNian(args: Record<string, unknown>, state: SessionState): string {
  const year = args.year as number;
  const pillar = calculateLiuNian(year);
  const result: Record<string, unknown> = { year, ganZhi: `${pillar.stem}${pillar.branch}`, stem: pillar.stem, branch: pillar.branch, stemElement: STEM_ELEMENT[pillar.stem] };
  if (state.chart) {
    result.stemRelation = getShiShen(state.chart.fourPillars.day.stem, pillar.stem);
    result.dayMaster = state.chart.fourPillars.day.stem;
    result.usefulGod = state.chart.analysis.usefulGod;
    result.harmfulGod = state.chart.analysis.harmfulGod;
  }
  return JSON.stringify(result, null, 2);
}

function executeAnalyzeLiuNianRange(args: Record<string, unknown>, state: SessionState): string {
  const startYear = args.start_year as number;
  const endYear = args.end_year as number;
  const range = calculateLiuNianRange(startYear, endYear);
  const result = range.map(({ year, pillar }) => {
    const entry: Record<string, unknown> = { year, ganZhi: `${pillar.stem}${pillar.branch}` };
    if (state.chart) entry.stemRelation = getShiShen(state.chart.fourPillars.day.stem, pillar.stem);
    return entry;
  });
  return JSON.stringify(result, null, 2);
}

// ============================================================
// Multi-School Analyze
// ============================================================

async function executeMultiSchoolAnalyze(args: Record<string, unknown>, state: SessionState): Promise<string> {
  if (!state.chart) {
    return JSON.stringify({ error: '请先使用 paipan 工具排盘后再进行多流派分析' });
  }

  const dimensions = (args.dimensions as AnalysisDimension[] | undefined) ||
    ['personality', 'career', 'wealth', 'marriage', 'health', 'timing', 'overall'];

  try {
    const orch = state.getOrchestrator();

    if (state.debateMode) {
      // Multi-school with debate
      const report = await orch.analyze(state.chart, state.profile, dimensions);
      state.lastReport = report;
      const formatted = orch.formatReport(report);
      return JSON.stringify({ formatted, meta: report.meta, finalAnalysis: report.finalAnalysis }, null, 2);
    } else {
      // Single school only, no debate
      const report = await orch.analyzeSingle(state.activeSchool, state.chart, state.profile, dimensions);
      state.lastReport = report;
      const formatted = orch.formatSingleSchoolReport(report);
      return JSON.stringify({ formatted, meta: report.meta, finalAnalysis: report.finalAnalysis }, null, 2);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `流派分析失败: ${msg}` });
  }
}

// ============================================================
// Skill System
// ============================================================

function executeReadSkill(args: Record<string, unknown>, state: SessionState): string {
  const skillName = args.skill_name as string;
  const skill = getSkill(state.skills, skillName);

  if (!skill) {
    const available = state.skills.map(s => s.meta.name).join(', ');
    return JSON.stringify({ error: `技能 "${skillName}" 未找到。可用技能: ${available || '无'}` });
  }

  return JSON.stringify({
    name: skill.meta.name,
    description: skill.meta.description,
    methodology: skill.content,
  });
}

function executeGetChartContext(args: Record<string, unknown>, state: SessionState): string {
  if (!state.chart) {
    return JSON.stringify({ error: '请先使用 paipan 工具排盘' });
  }

  const type = args.type as string;
  let chartContext: string;
  if (type === 'ming') {
    chartContext = buildMingBookContext(state.chart);
  } else if (type === 'yun') {
    chartContext = buildYunBookContext(state.chart, args.start_year as number, args.end_year as number);
  } else {
    return JSON.stringify({ error: `未知上下文类型: ${type}` });
  }

  if (state.profile) {
    chartContext += '\n\n' + formatProfileContext(state.profile);
  }

  return chartContext;
}

function executeSaveDocument(args: Record<string, unknown>, state: SessionState): string {
  const content = args.content as string;
  const filename = args.filename as string;

  if (!content || !filename) {
    return JSON.stringify({ error: '缺少 content 或 filename 参数' });
  }

  try {
    const filepath = saveDocToDisk(content, filename, state.outputDir);
    console.log(`\n💾 文档已保存: ${filepath}\n`);
    return JSON.stringify({ success: true, filepath, size: content.length, message: `文档已保存到: ${filepath}` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `保存失败: ${msg}` });
  }
}
