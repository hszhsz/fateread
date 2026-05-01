// ============================================================
// FateRead - WuXing Analysis & Pattern Recognition
// (五行分析与格局判定)
// ============================================================

import type {
  TianGan, WuXing, FourPillars, WuXingCount,
  DayMasterStrength, GeJu, ShiShen,
} from './types.js';
import {
  STEM_ELEMENT, BRANCH_ELEMENT, HIDDEN_STEMS,
  WUXING_SHENG, WUXING_KE, WUXING_SHENG_WO, WUXING_KE_WO,
  STEM_YIN_YANG, TIAN_GAN, getShiShen,
} from './constants.js';
import { countTenGods } from './ten-gods.js';
import type { TenGodsMap } from './types.js';

// ============================================================
// 五行力量计算
// ============================================================

/** 天干力量权重 */
const STEM_WEIGHT = 1.0;
/** 地支本气权重 */
const BRANCH_MAIN_WEIGHT = 0.7;
/** 地支中气权重 */
const BRANCH_MID_WEIGHT = 0.3;
/** 地支余气权重 */
const BRANCH_REST_WEIGHT = 0.1;

/**
 * 计算五行力量分布
 */
export function calculateWuXingCount(fourPillars: FourPillars): WuXingCount {
  const count: WuXingCount = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };

  // 四柱天干
  for (const pos of ['year', 'month', 'day', 'hour'] as const) {
    const stem = fourPillars[pos].stem;
    const element = STEM_ELEMENT[stem];
    count[element] += STEM_WEIGHT;
  }

  // 四柱地支（含藏干权重）
  for (const pos of ['year', 'month', 'day', 'hour'] as const) {
    const branch = fourPillars[pos].branch;
    const hiddenStems = HIDDEN_STEMS[branch];
    const weights = [BRANCH_MAIN_WEIGHT, BRANCH_MID_WEIGHT, BRANCH_REST_WEIGHT];

    for (let i = 0; i < hiddenStems.length; i++) {
      const element = STEM_ELEMENT[hiddenStems[i]];
      count[element] += weights[i] || BRANCH_REST_WEIGHT;
    }
  }

  // 四舍五入到一位小数
  for (const key of Object.keys(count) as WuXing[]) {
    count[key] = Math.round(count[key] * 10) / 10;
  }

  return count;
}

// ============================================================
// 日主旺衰判断
// ============================================================

/**
 * 月令得时评分
 * 月支为日主的旺相休囚死状态
 */
function getMonthScore(dayStem: TianGan, monthBranch: string): number {
  const dayElement = STEM_ELEMENT[dayStem];
  const monthElement = BRANCH_ELEMENT[monthBranch as keyof typeof BRANCH_ELEMENT];

  if (dayElement === monthElement) return 3;    // 旺
  if (WUXING_SHENG_WO[dayElement] === monthElement) return 2;  // 相（生我）
  if (WUXING_SHENG[dayElement] === monthElement) return 0;     // 休（我生）
  if (WUXING_KE[dayElement] === monthElement) return -1;       // 囚（我克）
  if (WUXING_KE_WO[dayElement] === monthElement) return -2;    // 死（克我）
  return 0;
}

/**
 * 判断日主旺衰
 */
export function judgeDayMasterStrength(
  fourPillars: FourPillars,
  wuXingCount: WuXingCount
): DayMasterStrength {
  const dayStem = fourPillars.day.stem;
  const dayElement = STEM_ELEMENT[dayStem];
  const shengWoElement = WUXING_SHENG_WO[dayElement]; // 生我的五行

  // 1. 得时：月令是否帮扶日主
  const monthScore = getMonthScore(dayStem, fourPillars.month.branch);

  // 2. 得势：同类（比劫）+ 生我（印星）的力量
  const helpForce = wuXingCount[dayElement] + wuXingCount[shengWoElement];
  // 克泄耗的力量
  const totalForce = Object.values(wuXingCount).reduce((a, b) => a + b, 0);
  const harmForce = totalForce - helpForce;

  // 3. 综合评分
  const ratio = helpForce / totalForce;
  const score = monthScore + (ratio - 0.4) * 10;

  if (score >= 4) return 'very_strong';
  if (score >= 1.5) return 'strong';
  if (score >= -1.5) return 'neutral';
  if (score >= -4) return 'weak';
  return 'very_weak';
}

// ============================================================
// 用神取用
// ============================================================

/**
 * 确定用神和忌神
 * 基本原则：身强则抑（用克泄耗），身弱则扶（用生助）
 */
export function determineUsefulGod(
  dayStem: TianGan,
  strength: DayMasterStrength,
  fourPillars: FourPillars
): { usefulGod: WuXing; harmfulGod: WuXing } {
  const dayElement = STEM_ELEMENT[dayStem];

  if (strength === 'strong' || strength === 'very_strong') {
    // 身强：用克我、我生、我克（官杀、食伤、财）
    // 优先用官杀克制，其次食伤泄气
    const usefulGod = WUXING_KE_WO[dayElement]; // 克我 = 官杀
    const harmfulGod = WUXING_SHENG_WO[dayElement]; // 生我 = 印
    return { usefulGod, harmfulGod };
  } else if (strength === 'weak' || strength === 'very_weak') {
    // 身弱：用生我、同我（印、比劫）
    const usefulGod = WUXING_SHENG_WO[dayElement]; // 生我 = 印
    const harmfulGod = WUXING_KE_WO[dayElement]; // 克我 = 官杀
    return { usefulGod, harmfulGod };
  } else {
    // 中和：看调候需要
    return determineByTiaoHou(dayStem, fourPillars);
  }
}

/**
 * 调候用神（根据出生月份的寒暖燥湿）
 */
function determineByTiaoHou(dayStem: TianGan, fourPillars: FourPillars): { usefulGod: WuXing; harmfulGod: WuXing } {
  const monthBranch = fourPillars.month.branch;
  const dayElement = STEM_ELEMENT[dayStem];

  // 冬月（亥、子、丑）→ 需火暖局
  if (['亥', '子', '丑'].includes(monthBranch)) {
    return { usefulGod: '火', harmfulGod: '水' };
  }
  // 夏月（巳、午、未）→ 需水润局
  if (['巳', '午', '未'].includes(monthBranch)) {
    return { usefulGod: '水', harmfulGod: '火' };
  }
  // 春秋按五行平衡
  return {
    usefulGod: WUXING_KE[dayElement], // 我克 = 财
    harmfulGod: WUXING_KE_WO[dayElement],
  };
}

// ============================================================
// 格局判定
// ============================================================

/**
 * 判定命局格局
 * 以月支藏干透出者为格
 */
export function determinePattern(
  fourPillars: FourPillars,
  tenGods: TenGodsMap,
  strength: DayMasterStrength
): GeJu {
  const dayStem = fourPillars.day.stem;
  const monthBranch = fourPillars.month.branch;
  const monthHiddenStems = HIDDEN_STEMS[monthBranch];

  // 特殊格局
  if (strength === 'very_strong') {
    return '从强格';
  }
  if (strength === 'very_weak') {
    return '从弱格';
  }

  // 建禄格：月支为日主的禄
  const luMap: Record<TianGan, string> = {
    '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳',
    '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子',
  };
  if (monthBranch === luMap[dayStem]) {
    return '建禄格';
  }

  // 羊刃格：月支为日主的刃
  const renMap: Record<TianGan, string> = {
    '甲': '卯', '乙': '辰', '丙': '午', '丁': '未', '戊': '午',
    '己': '未', '庚': '酉', '辛': '戌', '壬': '子', '癸': '丑',
  };
  if (monthBranch === renMap[dayStem]) {
    return '羊刃格';
  }

  // 正格：以月支本气的十神定格
  const monthMainStem = monthHiddenStems[0];
  const relation = getRelationToDay(dayStem, monthMainStem);

  const patternMap: Record<string, GeJu> = {
    '正官': '正官格',
    '七杀': '七杀格',
    '正印': '正印格',
    '偏印': '偏印格',
    '正财': '正财格',
    '偏财': '偏财格',
    '食神': '食神格',
    '伤官': '伤官格',
  };

  if (relation in patternMap) {
    return patternMap[relation];
  }

  // 杂气格（辰戌丑未月）
  if (['辰', '戌', '丑', '未'].includes(monthBranch)) {
    return '杂气格';
  }

  return '正官格'; // fallback
}

function getRelationToDay(dayStem: TianGan, targetStem: TianGan): string {
  return getShiShen(dayStem, targetStem) as string;
}

// ============================================================
// 调候建议
// ============================================================

/**
 * 生成调候建议文字
 */
export function getSeasonalAdvice(dayStem: TianGan, monthBranch: string): string {
  const dayElement = STEM_ELEMENT[dayStem];

  const seasonMap: Record<string, string> = {
    '寅': '春', '卯': '春', '辰': '春',
    '巳': '夏', '午': '夏', '未': '夏',
    '申': '秋', '酉': '秋', '戌': '秋',
    '亥': '冬', '子': '冬', '丑': '冬',
  };

  const season = seasonMap[monthBranch] || '春';

  const adviceMap: Record<string, Record<string, string>> = {
    '木': {
      '春': '木旺于春，需金制木，火泄秀为佳',
      '夏': '木火通明，但需水润根，防燥',
      '秋': '木逢金克，需水通关，印星护身',
      '冬': '木寒需火暖，丙丁为调候之要',
    },
    '火': {
      '春': '木火相生，气势渐旺，土泄秀为用',
      '夏': '火炎土燥，急需壬癸水制，忌再见火',
      '秋': '火被金耗，需木助火，甲木为佳',
      '冬': '火逢冬衰，急需甲木引火，丙火帮身',
    },
    '土': {
      '春': '春土虚松，需火生土，丙丁为要',
      '夏': '火炎土燥，需水润泽，壬癸调候',
      '秋': '土金相生，泄气太过，需火暖土',
      '冬': '寒土冻结，急需丙火解冻暖身',
    },
    '金': {
      '春': '金弱需土生，壬水洗金为佳',
      '夏': '金被火克，需壬水制火，土亦可通关',
      '秋': '金旺于秋，需火炼金，壬水泄秀',
      '冬': '金寒水冷，需丙火暖局调候',
    },
    '水': {
      '春': '水弱需金生，辛金发源为佳',
      '夏': '水逢夏枯，需庚辛金生水，壬癸帮身',
      '秋': '金水相生，水渐旺，需戊土制水',
      '冬': '水旺于冬，需戊土堤防，丙火暖水',
    },
  };

  return adviceMap[dayElement]?.[season] || '五行平衡，无特殊调候需求';
}
