// ============================================================
// FateRead - Agent Tools (工具定义)
// 支持 Skill 系统 + 交互式缘主画像采集 + LLM 验证
// ============================================================

import { paipan, formatChart, calculateLiuNian, calculateLiuNianRange } from '../core/index.js';
import type { PaipanInput, BaziChart, UserProfile, LifeEvent, ParentInfo, SiblingInfo } from '../core/types.js';
import { CITY_LONGITUDE } from '../core/solar-time.js';
import { getShiShen, STEM_ELEMENT, TIAN_GAN, DI_ZHI } from '../core/constants.js';
import { loadSkills, getSkill, saveDocument, getDefaultSkillsDir, getDefaultOutputDir } from '../skills/loader.js';
import { buildMingBookContext } from '../skills/ming-book.js';
import { buildYunBookContext } from '../skills/yun-book.js';
import type { Skill } from '../skills/loader.js';
import { verifyPillars } from './verify-pillars.js';
import { Orchestrator } from './schools/orchestrator.js';
import type { SynthesizedReport, AnalysisDimension } from './schools/types.js';

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
// 多流派分析协调器（启动时初始化）
// ============================================================

let orchestrator: Orchestrator | null = null;
let lastSynthesizedReport: SynthesizedReport | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestrator) {
    orchestrator = new Orchestrator({ verbose: true });
  }
  return orchestrator;
}

export function getLastSynthesizedReport(): SynthesizedReport | null {
  return lastSynthesizedReport;
}

// ============================================================
// 工具定义
// ============================================================

/**
 * OpenAI function calling 格式的工具定义
 */
export const TOOLS = [
  // ---- 缘主画像采集 ----
  {
    type: 'function' as const,
    function: {
      name: 'update_profile',
      description: '更新缘主画像信息。在对话中逐步收集到的信息通过此工具保存。支持增量更新——每次只需传入新获取的字段。当所有必要信息收集完毕后，设置 intake_complete=true。',
      parameters: {
        type: 'object',
        properties: {
          // 基础信息
          birth_year: { type: 'number', description: '出生年份（公历）' },
          birth_month: { type: 'number', description: '出生月份（公历）' },
          birth_day: { type: 'number', description: '出生日期（公历）' },
          birth_hour: { type: 'number', description: '出生小时（24小时制）' },
          birth_minute: { type: 'number', description: '出生分钟' },
          gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
          birth_city: { type: 'string', description: '出生城市' },

          // 第一类：根源信息
          father_birth_year: { type: 'number', description: '父亲出生年份' },
          mother_birth_year: { type: 'number', description: '母亲出生年份' },
          parent_notes: { type: 'string', description: '关于父母的补充说明' },

          // 第二类：结构信息
          sibling_rank: { type: 'number', description: '排行第几' },
          total_siblings: { type: 'number', description: '兄弟姐妹总数（含自己）' },
          sibling_birth_years: {
            type: 'array', items: { type: 'number' },
            description: '兄弟姐妹出生年份列表',
          },
          is_twin: { type: 'boolean', description: '是否双胞胎' },
          twin_birth_minute_diff: { type: 'number', description: '双胞胎出生时间差（分钟）' },
          sibling_notes: { type: 'string', description: '关于兄弟姐妹的补充说明' },

          // 第三类：应期信息
          life_events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                year: { type: 'number', description: '事件年份' },
                category: {
                  type: 'string',
                  enum: ['career', 'education', 'marriage', 'health', 'wealth', 'family', 'other'],
                  description: '事件类别',
                },
                description: { type: 'string', description: '事件描述' },
                is_positive: { type: 'boolean', description: '是否为正面事件' },
              },
              required: ['year', 'category', 'description'],
            },
            description: '重大人生事件列表',
          },

          // 缘主关注
          concerns: {
            type: 'array', items: { type: 'string' },
            description: '缘主最关心的领域列表（如：事业、财运、感情、健康、学业）',
          },
          specific_question: { type: 'string', description: '缘主具体想问的问题' },

          // 采集状态
          intake_complete: { type: 'boolean', description: '信息采集是否完成，设为 true 表示可以开始排盘分析' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_profile',
      description: '获取当前已采集的缘主画像信息，查看采集进度和已有数据。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ---- 排盘工具 ----
  {
    type: 'function' as const,
    function: {
      name: 'paipan',
      description: '八字排盘：根据缘主画像中的出生信息，计算完整的四柱八字命盘。调用前应确保 update_profile 已收集到完整的出生信息。排盘结果会自动与缘主画像关联。',
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
  // ---- 多流派综合分析 ----
  {
    type: 'function' as const,
    function: {
      name: 'multi_school_analyze',
      description: '多流派综合分析：同时调用子平八字、紫微斗数、盲派命理三个子 Agent 独立分析命盘，对比结论，对有分歧的维度启动辩论协调，最终输出三派共识的综合报告。必须先完成排盘（paipan）才能调用。',
      parameters: {
        type: 'object',
        properties: {
          dimensions: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['personality', 'career', 'wealth', 'marriage', 'health', 'education', 'interpersonal', 'timing', 'overall'],
            },
            description: '要分析的维度列表。默认分析全部维度。可选: personality(性格), career(事业), wealth(财运), marriage(婚姻), health(健康), education(学业), interpersonal(人际), timing(流年), overall(综合)',
          },
        },
        required: [],
      },
    },
  },
  // ---- Skill 系统 ----
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
      description: '获取当前命盘的结构化上下文数据（用于命之书/运之书撰写）。会自动附带缘主画像中的纬线信息（父母年命、排行、重大事件等），使分析更具针对性。type=ming 返回先天特质分析所需数据，type=yun 返回大运流年分析所需数据。',
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
let currentProfile: UserProfile | null = null;
let outputDir: string = getDefaultOutputDir();

export function getCurrentChart(): BaziChart | null {
  return currentChart;
}

export function setCurrentChart(chart: BaziChart): void {
  currentChart = chart;
}

export function getCurrentProfile(): UserProfile | null {
  return currentProfile;
}

export function setCurrentProfile(profile: UserProfile): void {
  currentProfile = profile;
}

export function setOutputDir(dir: string): void {
  outputDir = dir;
}

// ============================================================
// 辅助：年份 → 干支
// ============================================================

function yearToGanZhi(year: number): string {
  const stemIdx = (year - 4) % 10;
  const branchIdx = (year - 4) % 12;
  return `${TIAN_GAN[stemIdx >= 0 ? stemIdx : stemIdx + 10]}${DI_ZHI[branchIdx >= 0 ? branchIdx : branchIdx + 12]}`;
}

// ============================================================
// 缘主画像序列化（用于注入上下文）
// ============================================================

/**
 * 将缘主画像序列化为 Markdown 格式，供 LLM 和命之书/运之书使用
 */
export function formatProfileContext(profile: UserProfile): string {
  let ctx = '# 缘主画像（纬线信息）\n\n';

  // 第一类：根源信息
  if (profile.parents) {
    ctx += '## 第一类：根源信息（定根基）\n';
    const p = profile.parents;
    if (p.fatherBirthYear) {
      ctx += `- 父亲年命：${p.fatherBirthYear}年（${p.fatherGanZhi || yearToGanZhi(p.fatherBirthYear)}年）\n`;
    }
    if (p.motherBirthYear) {
      ctx += `- 母亲年命：${p.motherBirthYear}年（${p.motherGanZhi || yearToGanZhi(p.motherBirthYear)}年）\n`;
    }
    if (p.notes) {
      ctx += `- 补充说明：${p.notes}\n`;
    }
    ctx += '\n';
  }

  // 第二类：结构信息
  if (profile.siblings) {
    ctx += '## 第二类：结构信息（定太极点）\n';
    const s = profile.siblings;
    ctx += `- 排行：第${s.rank}（共${s.totalSiblings}个兄弟姐妹）\n`;
    if (s.isTwin) {
      ctx += `- 双胞胎：是`;
      if (s.twinBirthMinuteDiff) {
        ctx += `（出生时间差 ${s.twinBirthMinuteDiff} 分钟）`;
      }
      ctx += '\n';
    }
    if (s.siblingBirthYears && s.siblingBirthYears.length > 0) {
      const siblingGZ = s.siblingBirthYears.map(y => `${y}年(${yearToGanZhi(y)})`).join('、');
      ctx += `- 兄弟姐妹出生年份：${siblingGZ}\n`;
    }
    if (s.notes) {
      ctx += `- 补充说明：${s.notes}\n`;
    }
    ctx += '\n';
  }

  // 第三类：应期信息
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

  // 缘主关注
  if (profile.concerns && profile.concerns.length > 0) {
    ctx += '## 缘主关注\n';
    ctx += `- 关心领域：${profile.concerns.join('、')}\n`;
  }
  if (profile.specificQuestion) {
    ctx += `- 具体问题：${profile.specificQuestion}\n`;
  }

  return ctx;
}

// ============================================================
// 工具执行分发
// ============================================================

/**
 * 执行工具调用
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'update_profile':
      return executeUpdateProfile(args);
    case 'get_profile':
      return executeGetProfile();
    case 'paipan':
      return executePaipan(args);
    case 'analyze_liunian':
      return executeAnalyzeLiuNian(args);
    case 'analyze_liunian_range':
      return executeAnalyzeLiuNianRange(args);
    case 'multi_school_analyze':
      return executeMultiSchoolAnalyze(args);
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
// 缘主画像工具实现
// ============================================================

function executeUpdateProfile(args: Record<string, unknown>): string {
  // 初始化或增量更新
  if (!currentProfile) {
    currentProfile = {
      birthYear: 0, birthMonth: 0, birthDay: 0,
      birthHour: 0, gender: 'male',
    };
  }

  // 基础信息
  if (args.birth_year !== undefined) currentProfile.birthYear = args.birth_year as number;
  if (args.birth_month !== undefined) currentProfile.birthMonth = args.birth_month as number;
  if (args.birth_day !== undefined) currentProfile.birthDay = args.birth_day as number;
  if (args.birth_hour !== undefined) currentProfile.birthHour = args.birth_hour as number;
  if (args.birth_minute !== undefined) currentProfile.birthMinute = args.birth_minute as number;
  if (args.gender !== undefined) currentProfile.gender = args.gender as 'male' | 'female';
  if (args.birth_city !== undefined) currentProfile.birthCity = args.birth_city as string;

  // 第一类：根源信息
  if (args.father_birth_year !== undefined || args.mother_birth_year !== undefined || args.parent_notes !== undefined) {
    if (!currentProfile.parents) currentProfile.parents = {};
    if (args.father_birth_year !== undefined) {
      currentProfile.parents.fatherBirthYear = args.father_birth_year as number;
      currentProfile.parents.fatherGanZhi = yearToGanZhi(args.father_birth_year as number);
    }
    if (args.mother_birth_year !== undefined) {
      currentProfile.parents.motherBirthYear = args.mother_birth_year as number;
      currentProfile.parents.motherGanZhi = yearToGanZhi(args.mother_birth_year as number);
    }
    if (args.parent_notes !== undefined) {
      currentProfile.parents.notes = args.parent_notes as string;
    }
  }

  // 第二类：结构信息
  if (args.sibling_rank !== undefined || args.total_siblings !== undefined || args.is_twin !== undefined) {
    if (!currentProfile.siblings) {
      currentProfile.siblings = { rank: 1, totalSiblings: 1 };
    }
    if (args.sibling_rank !== undefined) currentProfile.siblings.rank = args.sibling_rank as number;
    if (args.total_siblings !== undefined) currentProfile.siblings.totalSiblings = args.total_siblings as number;
    if (args.sibling_birth_years !== undefined) currentProfile.siblings.siblingBirthYears = args.sibling_birth_years as number[];
    if (args.is_twin !== undefined) currentProfile.siblings.isTwin = args.is_twin as boolean;
    if (args.twin_birth_minute_diff !== undefined) currentProfile.siblings.twinBirthMinuteDiff = args.twin_birth_minute_diff as number;
    if (args.sibling_notes !== undefined) currentProfile.siblings.notes = args.sibling_notes as string;
  }

  // 第三类：应期信息
  if (args.life_events !== undefined) {
    const events = args.life_events as LifeEvent[];
    if (!currentProfile.lifeEvents) currentProfile.lifeEvents = [];
    currentProfile.lifeEvents.push(...events);
  }

  // 缘主关注
  if (args.concerns !== undefined) currentProfile.concerns = args.concerns as string[];
  if (args.specific_question !== undefined) currentProfile.specificQuestion = args.specific_question as string;

  // 采集状态
  if (args.intake_complete !== undefined) currentProfile.intakeComplete = args.intake_complete as boolean;

  // 计算经度（如果有城市信息）
  if (currentProfile.birthCity) {
    currentProfile.birthLongitude = CITY_LONGITUDE[currentProfile.birthCity] || currentProfile.birthLongitude;
  }

  // 返回采集进度
  const progress = getIntakeProgress(currentProfile);
  return JSON.stringify({
    success: true,
    message: '缘主画像已更新',
    profile: currentProfile,
    progress,
  }, null, 2);
}

function executeGetProfile(): string {
  if (!currentProfile) {
    return JSON.stringify({
      message: '尚未开始采集缘主信息',
      profile: null,
      progress: {
        hasBasicInfo: false,
        hasParentInfo: false,
        hasSiblingInfo: false,
        hasLifeEvents: false,
        hasConcerns: false,
        intakeComplete: false,
        completeness: '0%',
      },
    });
  }

  return JSON.stringify({
    profile: currentProfile,
    progress: getIntakeProgress(currentProfile),
  }, null, 2);
}

/**
 * 计算信息采集进度
 */
function getIntakeProgress(profile: UserProfile): Record<string, unknown> {
  const hasBasicInfo = !!(profile.birthYear && profile.birthMonth && profile.birthDay && profile.birthHour && profile.gender);
  const hasBirthCity = !!profile.birthCity;
  const hasParentInfo = !!(profile.parents && (profile.parents.fatherBirthYear || profile.parents.motherBirthYear));
  const hasSiblingInfo = !!(profile.siblings && profile.siblings.rank && profile.siblings.totalSiblings);
  const hasLifeEvents = !!(profile.lifeEvents && profile.lifeEvents.length > 0);
  const hasConcerns = !!(profile.concerns && profile.concerns.length > 0);

  // 必填项权重 60%，选填项权重 40%
  let score = 0;
  if (hasBasicInfo) score += 30;    // 基础八字信息（必填核心）
  if (hasBirthCity) score += 10;    // 出生地（重要）
  if (profile.gender) score += 5;   // 性别
  if (hasParentInfo) score += 15;   // 父母年命
  if (hasSiblingInfo) score += 10;  // 排行信息
  if (hasLifeEvents) score += 20;   // 重大事件（核心纬线）
  if (hasConcerns) score += 10;     // 关注领域

  return {
    hasBasicInfo,
    hasBirthCity,
    hasParentInfo,
    hasSiblingInfo,
    hasLifeEvents,
    hasConcerns,
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
// 排盘工具实现（增强：关联缘主画像 + LLM验证）
// ============================================================

async function executePaipan(args: Record<string, unknown>): Promise<string> {
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

    // ========== LLM 验证四柱 ==========
    let verificationNote = '';
    try {
      console.log('🔍 正在调用 LLM 验证四柱计算结果...');
      const verifyResult = await verifyPillars(chart, {
        year: input.year,
        month: input.month,
        day: input.day,
        hour: input.hour,
        minute: input.minute,
        city: city,
        longitude: input.longitude,
      });

      if (!verifyResult.verified && verifyResult.corrections && verifyResult.corrections.length > 0) {
        // 有修正 —— 重新排盘
        console.warn('⚠️  LLM 验证发现四柱差异，尝试修正...');
        for (const c of verifyResult.corrections) {
          console.warn(`   ${c.pillar}柱: ${c.original} → ${c.corrected} (${c.reason})`);
        }

        // 用 LLM 修正的日柱重新定位日期来重排，但这很复杂
        // 更实际的做法：信任日柱算法（已验证正确），仅对年/月/时柱修正可以考虑
        // 为安全起见，将修正信息附加到结果中，让主 Agent LLM 知晓差异
        verificationNote = '\n\n⚠️ LLM 验证提示：';
        for (const c of verifyResult.corrections) {
          verificationNote += `\n- ${c.pillar}柱：算法计算为"${c.original}"，LLM 认为应为"${c.corrected}"（${c.reason}）`;
        }
        verificationNote += '\n请以 LLM 验证结果为准进行解读。';

        // 直接修正 chart 的四柱数据（仅修改柱位，不重算衍生数据）
        // 如果是日柱差异，需要完全重新排盘
        const hasDayCorrection = verifyResult.corrections.some(c => c.pillar === 'day');
        if (hasDayCorrection) {
          // 日柱修正影响十神等所有衍生数据，记录但不自动修正
          // 让主Agent根据验证信息自行判断
          verificationNote += '\n⚠️ 注意：日柱存在差异，衍生数据（十神等）可能不准确，请谨慎使用。';
        } else {
          // 年/月/时柱修正可以直接应用
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
        // 验证被跳过（解析失败等），不打"通过"，如实告知
        console.log(`⚠️  LLM 验证未完成（${verifyResult.skipReason}），使用算法结果`);
        verificationNote = `\n\n⚠️ LLM 验证未完成（${verifyResult.skipReason}），使用算法计算结果。`;
      } else {
        console.log('✅ LLM 验证通过，四柱计算正确');
        verificationNote = '\n\n✅ 四柱已通过 LLM 独立验证，结果正确。';
      }
    } catch (verifyError: unknown) {
      // 验证失败不阻塞主流程
      const msg = verifyError instanceof Error ? verifyError.message : String(verifyError);
      console.warn(`⚠️  LLM 验证失败 (${msg})，继续使用算法结果`);
      verificationNote = '\n\n⚠️ LLM 验证未能完成，使用算法计算结果。';
    }
    // ========== 验证结束 ==========

    currentChart = chart;

    // 同步更新画像中的基础信息（如果画像存在）
    if (currentProfile) {
      currentProfile.birthYear = input.year;
      currentProfile.birthMonth = input.month;
      currentProfile.birthDay = input.day;
      currentProfile.birthHour = input.hour;
      currentProfile.birthMinute = input.minute;
      currentProfile.gender = input.gender;
      if (city) currentProfile.birthCity = city;
      if (longitude) currentProfile.birthLongitude = longitude;
    }

    const formatted = formatChart(chart) + verificationNote;
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

// ============================================================
// 多流派综合分析工具实现
// ============================================================

async function executeMultiSchoolAnalyze(args: Record<string, unknown>): Promise<string> {
  if (!currentChart) {
    return JSON.stringify({ error: '请先使用 paipan 工具排盘后再进行多流派分析' });
  }

  const dimensions = (args.dimensions as AnalysisDimension[] | undefined) ||
    ['personality', 'career', 'wealth', 'marriage', 'health', 'timing', 'overall'];

  try {
    const orch = getOrchestrator();
    const report = await orch.analyze(currentChart, currentProfile, dimensions);

    // 缓存最新报告
    lastSynthesizedReport = report;

    // 返回格式化的报告 + 结构化数据
    const formatted = orch.formatReport(report);
    return JSON.stringify({
      formatted,
      meta: report.meta,
      finalAnalysis: report.finalAnalysis,
    }, null, 2);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `多流派分析失败: ${msg}` });
  }
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

  let chartContext: string;
  if (type === 'ming') {
    chartContext = buildMingBookContext(currentChart);
  } else if (type === 'yun') {
    const startYear = args.start_year as number | undefined;
    const endYear = args.end_year as number | undefined;
    chartContext = buildYunBookContext(currentChart, startYear, endYear);
  } else {
    return JSON.stringify({ error: `未知上下文类型: ${type}` });
  }

  // 注入缘主画像纬线信息
  if (currentProfile) {
    const profileContext = formatProfileContext(currentProfile);
    chartContext += '\n\n' + profileContext;
  }

  return chartContext;
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
