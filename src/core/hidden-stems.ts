// ============================================================
// FateRead - Hidden Stems (藏干)
// ============================================================

import type { TianGan, DiZhi, FourPillars } from './types.js';
import { HIDDEN_STEMS } from './constants.js';

/**
 * 获取四柱的所有藏干
 */
export function calculateHiddenStems(fourPillars: FourPillars): {
  year: TianGan[];
  month: TianGan[];
  day: TianGan[];
  hour: TianGan[];
} {
  return {
    year: HIDDEN_STEMS[fourPillars.year.branch],
    month: HIDDEN_STEMS[fourPillars.month.branch],
    day: HIDDEN_STEMS[fourPillars.day.branch],
    hour: HIDDEN_STEMS[fourPillars.hour.branch],
  };
}

/**
 * 获取指定地支的藏干
 * @param branch 地支
 * @returns 藏干数组，第一个为本气，后面为中气、余气
 */
export function getHiddenStems(branch: DiZhi): TianGan[] {
  return HIDDEN_STEMS[branch];
}

/**
 * 获取地支的本气（第一个藏干）
 */
export function getMainHiddenStem(branch: DiZhi): TianGan {
  return HIDDEN_STEMS[branch][0];
}
