// ============================================================
// FateRead - Ten Gods Calculator (十神推算)
// ============================================================

import type { TianGan, ShiShen, FourPillars, TenGodsMap } from './types.js';
import { HIDDEN_STEMS, getShiShen } from './constants.js';

/**
 * 计算完整的十神分布
 * 以日干为中心，推算四柱所有天干地支的十神关系
 */
export function calculateTenGods(fourPillars: FourPillars): TenGodsMap {
  const dayStem = fourPillars.day.stem;

  return {
    year: {
      stem: getShiShen(dayStem, fourPillars.year.stem) as ShiShen,
      branch: HIDDEN_STEMS[fourPillars.year.branch].map(
        hs => getShiShen(dayStem, hs) as ShiShen
      ),
    },
    month: {
      stem: getShiShen(dayStem, fourPillars.month.stem) as ShiShen,
      branch: HIDDEN_STEMS[fourPillars.month.branch].map(
        hs => getShiShen(dayStem, hs) as ShiShen
      ),
    },
    day: {
      stem: '日主',
      branch: HIDDEN_STEMS[fourPillars.day.branch].map(
        hs => getShiShen(dayStem, hs) as ShiShen
      ),
    },
    hour: {
      stem: getShiShen(dayStem, fourPillars.hour.stem) as ShiShen,
      branch: HIDDEN_STEMS[fourPillars.hour.branch].map(
        hs => getShiShen(dayStem, hs) as ShiShen
      ),
    },
  };
}

/**
 * 统计十神出现次数
 */
export function countTenGods(tenGods: TenGodsMap): Record<ShiShen, number> {
  const count: Record<string, number> = {
    '比肩': 0, '劫财': 0,
    '食神': 0, '伤官': 0,
    '偏财': 0, '正财': 0,
    '七杀': 0, '正官': 0,
    '偏印': 0, '正印': 0,
  };

  for (const pos of ['year', 'month', 'hour'] as const) {
    const stemGod = tenGods[pos].stem as string;
    if (count[stemGod] !== undefined) count[stemGod]++;
    for (const bg of tenGods[pos].branch) {
      if (count[bg] !== undefined) count[bg]++;
    }
  }

  // 日支藏干
  for (const bg of tenGods.day.branch) {
    if (count[bg] !== undefined) count[bg]++;
  }

  return count as Record<ShiShen, number>;
}
