// ============================================================
// FateRead - Calendar & Solar Terms (农历与节气计算)
// ============================================================
//
// 节气对命理排盘至关重要：
// - 年柱以立春为界（不是农历正月初一）
// - 月柱以节气为界（不是农历月份）
//
// 本模块提供：
// 1. 二十四节气精确时间计算
// 2. 公历到农历的转换
// 3. 根据节气确定月柱
//
// 底层天文计算由 lunar-typescript 库（寿星万年历算法）提供。
// ============================================================

import { Solar, Lunar } from 'lunar-typescript';
import type { DiZhi } from './types.js';

/**
 * 二十四节气名称
 * 奇数下标为"节"（用于划分月柱），偶数下标为"气"
 */
export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

/**
 * 十二"节"气名及其对应月支
 * 节气是划分月柱的关键依据
 */
export const JIE_QI_MONTHS: { name: string; branch: DiZhi }[] = [
  { name: '立春', branch: '寅' },   // 正月
  { name: '惊蛰', branch: '卯' },   // 二月
  { name: '清明', branch: '辰' },   // 三月
  { name: '立夏', branch: '巳' },   // 四月
  { name: '芒种', branch: '午' },   // 五月
  { name: '小暑', branch: '未' },   // 六月
  { name: '立秋', branch: '申' },   // 七月
  { name: '白露', branch: '酉' },   // 八月
  { name: '寒露', branch: '戌' },   // 九月
  { name: '立冬', branch: '亥' },   // 十月
  { name: '大雪', branch: '子' },   // 十一月
  { name: '小寒', branch: '丑' },   // 十二月
];

// ============================================================
// Helpers
// ============================================================

/** Solar 对象转 Date（库的时间分量为 UTC+8，需转为 UTC 时基） */
function solarToDate(solar: Solar): Date {
  return new Date(Date.UTC(
    solar.getYear(), solar.getMonth() - 1, solar.getDay(),
    solar.getHour() - 8, solar.getMinute(), solar.getSecond()
  ));
}

/** 获取某一公历年份的完整节气表 */
function getJieQiTable(year: number): Record<string, Solar> {
  return Solar.fromYmd(year, 6, 1).getLunar().getJieQiTable();
}

// ============================================================
// 节气计算
// ============================================================

/**
 * 节气精确计算
 * 返回指定年份某个节气的精确 UTC 时间戳（毫秒）
 *
 * @param year 公历年份
 * @param termIndex 节气序号 0-23 (0=小寒, 2=立春, ...)
 * @returns Date 对象
 */
export function getSolarTermDate(year: number, termIndex: number): Date {
  const name = SOLAR_TERMS[termIndex];
  const table = getJieQiTable(year);
  const solar = table[name];
  if (!solar) throw new Error(`节气 ${name} 在 ${year} 年未找到`);
  return solarToDate(solar);
}

/**
 * 获取某年所有12个"节"的精确日期
 * 用于确定月柱的起止
 */
export function getYearJieQiDates(year: number): { name: string; date: Date; branch: DiZhi }[] {
  const result: { name: string; date: Date; branch: DiZhi }[] = [];

  // 立春(index=2) 到 小寒(index=0, 次年算前一年的丑月)
  const termIndices = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0];

  for (let i = 0; i < 12; i++) {
    const termIdx = termIndices[i];
    const termYear = termIdx === 0 ? year + 1 : year; // 小寒在次年
    const name = SOLAR_TERMS[termIdx];
    const table = getJieQiTable(termYear);
    const solar = table[name];
    if (!solar) throw new Error(`节气 ${name} 在 ${termYear} 年未找到`);
    result.push({
      name: JIE_QI_MONTHS[i].name,
      date: solarToDate(solar),
      branch: JIE_QI_MONTHS[i].branch,
    });
  }

  return result;
}

/**
 * 根据公历日期确定所在的节气月份
 * @returns { monthIndex: 0-11 (0=寅月), yearStemAdjust: 是否需要调整年柱 }
 */
export function getMonthByJieQi(year: number, month: number, day: number, hour: number = 0, minute: number = 0): {
  monthIndex: number;
  branch: DiZhi;
  isBeforeLiChun: boolean;
} {
  const targetDate = new Date(year, month - 1, day, hour, minute);
  const jieqiDates = getYearJieQiDates(year);

  // 检查是否在今年立春之前
  const lichun = jieqiDates[0].date; // 立春
  const isBeforeLiChun = targetDate < lichun;

  if (isBeforeLiChun) {
    // 在立春前，使用上一年的丑月
    const prevJieqi = getYearJieQiDates(year - 1);
    for (let i = prevJieqi.length - 1; i >= 0; i--) {
      if (targetDate >= prevJieqi[i].date) {
        return {
          monthIndex: i,
          branch: prevJieqi[i].branch,
          isBeforeLiChun: true,
        };
      }
    }
    return { monthIndex: 11, branch: '丑', isBeforeLiChun: true };
  }

  // 在立春后，按正常节气排
  for (let i = jieqiDates.length - 1; i >= 0; i--) {
    if (targetDate >= jieqiDates[i].date) {
      return {
        monthIndex: i,
        branch: jieqiDates[i].branch,
        isBeforeLiChun: false,
      };
    }
  }

  return { monthIndex: 0, branch: '寅', isBeforeLiChun: false };
}

/**
 * 获取离 targetDate 最近的上一个和下一个"节"（用于计算大运起始岁数）
 */
export function getNearestJieQi(year: number, month: number, day: number, direction: 'forward' | 'backward'): {
  name: string;
  date: Date;
  daysDistance: number;
} {
  const targetDate = new Date(year, month - 1, day);
  const lunar = Solar.fromYmd(year, month, day).getLunar();

  if (direction === 'forward') {
    const nextJie = lunar.getNextJie();
    if (!nextJie || !nextJie.getSolar()) {
      return { name: '', date: new Date(), daysDistance: 0 };
    }
    const jieSolar = nextJie.getSolar()!;
    const jieDate = solarToDate(jieSolar);
    const days = (jieDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24);
    return { name: nextJie.getName(), date: jieDate, daysDistance: Math.abs(days) };
  } else {
    const prevJie = lunar.getPrevJie();
    if (!prevJie || !prevJie.getSolar()) {
      return { name: '', date: new Date(), daysDistance: 0 };
    }
    const jieSolar = prevJie.getSolar()!;
    const jieDate = solarToDate(jieSolar);
    const days = (targetDate.getTime() - jieDate.getTime()) / (1000 * 60 * 60 * 24);
    return { name: prevJie.getName(), date: jieDate, daysDistance: Math.abs(days) };
  }
}

// ============================================================
// 农历转换
// ============================================================

/**
 * 公历转农历
 */
export function solarToLunar(year: number, month: number, day: number): {
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeapMonth: boolean;
  lunarMonthName: string;
  lunarDayName: string;
} {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const rawMonth = lunar.getMonth();
  const isLeapMonth = rawMonth < 0;

  return {
    lunarYear: lunar.getYear(),
    lunarMonth: Math.abs(rawMonth),
    lunarDay: lunar.getDay(),
    isLeapMonth,
    lunarMonthName: lunar.getMonthInChinese(),
    lunarDayName: lunar.getDayInChinese(),
  };
}
