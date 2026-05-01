// ============================================================
// FateRead - Agent Tools (工具定义)
// ============================================================

import { paipan, formatChart, calculateLiuNian, calculateLiuNianRange } from '../core/index.js';
import type { PaipanInput, BaziChart } from '../core/types.js';
import { CITY_LONGITUDE } from '../core/solar-time.js';
import { getShiShen, STEM_ELEMENT } from '../core/constants.js';

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
];

// 存储当前会话的命盘
let currentChart: BaziChart | null = null;

export function getCurrentChart(): BaziChart | null {
  return currentChart;
}

export function setCurrentChart(chart: BaziChart): void {
  currentChart = chart;
}

/**
 * 执行工具调用
 */
export function executeTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'paipan':
      return executePaipan(args);
    case 'analyze_liunian':
      return executeAnalyzeLiuNian(args);
    case 'analyze_liunian_range':
      return executeAnalyzeLiuNianRange(args);
    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

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

    // 返回格式化的命盘文本 + JSON 数据
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
