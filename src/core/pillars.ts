// ============================================================
// FateRead - Four Pillars Calculator (四柱排盘)
// ============================================================

import type { TianGan, DiZhi, Pillar, FourPillars, PaipanInput } from './types.js';
import {
  TIAN_GAN, DI_ZHI,
  YEAR_STEM_TO_MONTH_STEM_START,
  DAY_STEM_TO_HOUR_STEM_START,
  HOUR_TO_BRANCH_INDEX,
} from './constants.js';
import { getMonthByJieQi } from './calendar.js';
import { getTrueSolarTime } from './solar-time.js';

// ============================================================
// 年柱计算
// ============================================================

/**
 * 计算年柱
 * 注意：以立春为界，立春前属上一年
 * @param year 公历年份
 * @param isBeforeLiChun 是否在立春之前
 */
export function getYearPillar(year: number, isBeforeLiChun: boolean): Pillar {
  const adjustedYear = isBeforeLiChun ? year - 1 : year;
  const stemIdx = ((adjustedYear - 4) % 10 + 10) % 10;
  const branchIdx = ((adjustedYear - 4) % 12 + 12) % 12;
  return {
    stem: TIAN_GAN[stemIdx],
    branch: DI_ZHI[branchIdx],
  };
}

// ============================================================
// 月柱计算
// ============================================================

/**
 * 计算月柱
 * 月支由节气决定，月干由年干推算
 * @param yearStem 年干
 * @param monthIndex 月序号 (0=寅月, 1=卯月, ..., 11=丑月)
 */
export function getMonthPillar(yearStem: TianGan, monthIndex: number): Pillar {
  // 月支
  const branchIdx = (monthIndex + 2) % 12; // 寅=2
  const branch = DI_ZHI[branchIdx];

  // 月干：年上起月法
  const yearStemIdx = TIAN_GAN.indexOf(yearStem);
  const startStemIdx = YEAR_STEM_TO_MONTH_STEM_START[yearStemIdx % 5];
  const stemIdx = (startStemIdx + monthIndex) % 10;
  const stem = TIAN_GAN[stemIdx];

  return { stem, branch };
}

// ============================================================
// 日柱计算
// ============================================================

/**
 * 计算日柱
 *
 * 原理：儒略日数 (JDN) 与六十甲子的固定映射关系
 * 天文学已知：JDN = 0 对应辛亥日（六十甲子序号 47）
 * 通用公式：甲子序号 = (JDN + 47) % 60
 *
 * 等价地，以 2000-01-01 (JDN=2451544) 为基准：
 * 2000-01-01 = 乙卯日（甲子序号 51）
 */
export function getDayPillar(year: number, month: number, day: number): Pillar {
  // (JDN + 47) % 60 等价于 ((JDN - 2451544 + 51) % 60)
  const jdn = getJulianDayNumber(year, month, day);
  const index = ((jdn + 47) % 60 + 60) % 60;
  const stemIdx = index % 10;
  const branchIdx = index % 12;

  return {
    stem: TIAN_GAN[stemIdx],
    branch: DI_ZHI[branchIdx],
  };
}

/**
 * 计算儒略日数（Julian Day Number）
 * 使用标准公式，返回整数 JDN
 */
export function getJulianDayNumber(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
  return Math.floor(jd);
}

// ============================================================
// 时柱计算
// ============================================================

/**
 * 计算时柱
 * @param dayStem 日干
 * @param hour 真太阳时的小时
 */
export function getHourPillar(dayStem: TianGan, hour: number): Pillar {
  const branchIndex = HOUR_TO_BRANCH_INDEX(hour);
  const branch = DI_ZHI[branchIndex];

  // 日上起时法
  const dayStemIdx = TIAN_GAN.indexOf(dayStem);
  const startStemIdx = DAY_STEM_TO_HOUR_STEM_START[dayStemIdx % 5];
  const stemIdx = (startStemIdx + branchIndex) % 10;
  const stem = TIAN_GAN[stemIdx];

  return { stem, branch };
}

// ============================================================
// 完整四柱排盘
// ============================================================

/**
 * 完整的四柱排盘
 */
export function calculateFourPillars(input: PaipanInput): {
  fourPillars: FourPillars;
  trueSolarTime: { hour: number; minute: number };
  lunarInfo: { isBeforeLiChun: boolean; monthIndex: number; branch: DiZhi };
} {
  // 1. 计算真太阳时
  const trueSolar = getTrueSolarTime(
    input.year, input.month, input.day,
    input.hour, input.minute,
    input.longitude || 120
  );

  // 调整日期（真太阳时可能跨日）
  let adjYear = input.year;
  let adjMonth = input.month;
  let adjDay = input.day + trueSolar.dayOffset;

  // 简单处理跨日（实际应更精确）
  if (adjDay <= 0) {
    const d = new Date(adjYear, adjMonth - 2, 0); // 上月最后一天
    adjDay = d.getDate() + adjDay;
    adjMonth -= 1;
    if (adjMonth <= 0) {
      adjMonth = 12;
      adjYear -= 1;
    }
  } else {
    const daysInMonth = new Date(adjYear, adjMonth, 0).getDate();
    if (adjDay > daysInMonth) {
      adjDay -= daysInMonth;
      adjMonth += 1;
      if (adjMonth > 12) {
        adjMonth = 1;
        adjYear += 1;
      }
    }
  }

  // 处理子时跨日：23:00-23:59 属于次日的子时
  let dayForDayPillar = adjDay;
  if (trueSolar.hour === 23) {
    // 晚子时：日柱用次日
    const nextDate = new Date(adjYear, adjMonth - 1, adjDay + 1);
    dayForDayPillar = nextDate.getDate();
    // 注意这里简化处理，实际有"早子时/晚子时"之争
    // 采用主流观点：23:00后算次日
  }

  // 2. 根据节气确定月柱信息
  const monthInfo = getMonthByJieQi(adjYear, adjMonth, adjDay, trueSolar.hour, trueSolar.minute);

  // 3. 计算年柱
  const yearPillar = getYearPillar(adjYear, monthInfo.isBeforeLiChun);

  // 4. 计算月柱
  const monthPillar = getMonthPillar(yearPillar.stem, monthInfo.monthIndex);

  // 5. 计算日柱
  const dayPillar = getDayPillar(adjYear, adjMonth, dayForDayPillar);

  // 6. 计算时柱
  const hourPillar = getHourPillar(dayPillar.stem, trueSolar.hour);

  return {
    fourPillars: {
      year: yearPillar,
      month: monthPillar,
      day: dayPillar,
      hour: hourPillar,
    },
    trueSolarTime: { hour: trueSolar.hour, minute: trueSolar.minute },
    lunarInfo: monthInfo,
  };
}
