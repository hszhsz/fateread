// ============================================================
// FateRead - DaYun Calculator (大运排盘)
// ============================================================

import type { TianGan, DiZhi, Pillar, DaYun, DaYunPillar, FourPillars } from './types.js';
import { TIAN_GAN, DI_ZHI, STEM_YIN_YANG } from './constants.js';
import { getNearestJieQi } from './calendar.js';

/**
 * 计算大运
 *
 * 规则：
 * - 阳年男命 / 阴年女命 → 顺排
 * - 阴年男命 / 阳年女命 → 逆排
 * - 起运岁数 = 出生日到最近节气的天数 ÷ 3（三天折一年）
 *
 * @param fourPillars 四柱
 * @param gender 性别
 * @param birthYear 出生年
 * @param birthMonth 出生月
 * @param birthDay 出生日
 * @param count 大运步数（默认8步，即80年）
 */
export function calculateDaYun(
  fourPillars: FourPillars,
  gender: 'male' | 'female',
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  count: number = 8
): DaYun {
  // 1. 判断顺逆
  const yearStemYinYang = STEM_YIN_YANG[fourPillars.year.stem];
  const isYangYear = yearStemYinYang === '阳';
  const isMale = gender === 'male';

  // 阳男阴女顺排，阴男阳女逆排
  const isForward = (isYangYear && isMale) || (!isYangYear && !isMale);
  const direction: 'forward' | 'backward' = isForward ? 'forward' : 'backward';

  // 2. 计算起运岁数
  const searchDirection = isForward ? 'forward' : 'backward';
  const nearestJieQi = getNearestJieQi(birthYear, birthMonth, birthDay, searchDirection);
  // 三天折一年，一天折四个月
  const startAge = Math.round(nearestJieQi.daysDistance / 3 * 10) / 10;
  // 实际取整数（向最近整数取）
  const startAgeInt = Math.max(1, Math.round(startAge));

  // 3. 排大运柱
  const monthStemIdx = TIAN_GAN.indexOf(fourPillars.month.stem);
  const monthBranchIdx = DI_ZHI.indexOf(fourPillars.month.branch);

  const pillars: DaYunPillar[] = [];
  for (let i = 1; i <= count; i++) {
    const offset = isForward ? i : -i;
    const stemIdx = ((monthStemIdx + offset) % 10 + 10) % 10;
    const branchIdx = ((monthBranchIdx + offset) % 12 + 12) % 12;

    const pillar: Pillar = {
      stem: TIAN_GAN[stemIdx],
      branch: DI_ZHI[branchIdx],
    };

    pillars.push({
      pillar,
      startAge: startAgeInt + (i - 1) * 10,
      endAge: startAgeInt + i * 10 - 1,
    });
  }

  return {
    startAge: startAgeInt,
    direction,
    pillars,
  };
}

/**
 * 计算流年
 * @param year 公历年份
 * @returns 该年的干支
 */
export function calculateLiuNian(year: number): Pillar {
  const stemIdx = ((year - 4) % 10 + 10) % 10;
  const branchIdx = ((year - 4) % 12 + 12) % 12;
  return {
    stem: TIAN_GAN[stemIdx],
    branch: DI_ZHI[branchIdx],
  };
}

/**
 * 计算一段年份范围的流年
 */
export function calculateLiuNianRange(startYear: number, endYear: number): { year: number; pillar: Pillar }[] {
  const result: { year: number; pillar: Pillar }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    result.push({ year: y, pillar: calculateLiuNian(y) });
  }
  return result;
}
