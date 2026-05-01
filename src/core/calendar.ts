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
// ============================================================

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

/**
 * 节气精确计算 (使用寿星万年历算法)
 * 返回指定年份某个节气的精确 UTC 时间戳（毫秒）
 *
 * @param year 公历年份
 * @param termIndex 节气序号 0-23 (0=小寒, 2=立春, ...)
 * @returns Date 对象
 */
export function getSolarTermDate(year: number, termIndex: number): Date {
  // 使用 VSOP87 简化算法计算节气
  // 节气的太阳黄经角度: 小寒=285°, 每个节气差15°
  const targetAngle = (termIndex * 15 + 285) % 360;

  // 初始估算：基于平均节气日期
  const jde = estimateTermJDE(year, termIndex);

  // 牛顿迭代法精确求解
  let jd = jde;
  for (let i = 0; i < 50; i++) {
    const lon = solarLongitude(jd);
    let diff = targetAngle - lon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.0001) break;
    jd += diff / 360 * 365.25;
  }

  // 儒略日转 Date
  return julianDayToDate(jd);
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
    result.push({
      name: JIE_QI_MONTHS[i].name,
      date: getSolarTermDate(termYear, termIdx),
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

  // 也需要检查前一年的节气（处理年初在立春前的情况）
  const prevYearJieqi = getYearJieQiDates(year - 1);

  // 检查是否在今年立春之前
  const lichun = jieqiDates[0].date; // 立春
  const isBeforeLiChun = targetDate < lichun;

  if (isBeforeLiChun) {
    // 在立春前，使用上一年的丑月（小寒后为丑月）
    // 需要从上一年的节气中找到对应月份
    const prevJieqi = getYearJieQiDates(year - 1);
    // 找到最后一个不超过 targetDate 的节
    for (let i = prevJieqi.length - 1; i >= 0; i--) {
      if (targetDate >= prevJieqi[i].date) {
        return {
          monthIndex: i,
          branch: prevJieqi[i].branch,
          isBeforeLiChun: true,
        };
      }
    }
    // fallback: 丑月
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
 * 获取离 targetDate 最近的上一个和下一个节气（用于计算大运起始岁数）
 */
export function getNearestJieQi(year: number, month: number, day: number, direction: 'forward' | 'backward'): {
  name: string;
  date: Date;
  daysDistance: number;
} {
  const targetDate = new Date(year, month - 1, day);

  // 获取 year-1, year, year+1 的所有节气
  const allJieQi: { name: string; date: Date }[] = [];
  for (const y of [year - 1, year, year + 1]) {
    const jieqi = getYearJieQiDates(y);
    allJieQi.push(...jieqi);
  }

  // 按时间排序
  allJieQi.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (direction === 'forward') {
    // 找最近的下一个节
    for (const jq of allJieQi) {
      if (jq.date > targetDate) {
        const days = (jq.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24);
        return { name: jq.name, date: jq.date, daysDistance: Math.abs(days) };
      }
    }
  } else {
    // 找最近的上一个节
    for (let i = allJieQi.length - 1; i >= 0; i--) {
      if (allJieQi[i].date <= targetDate) {
        const days = (targetDate.getTime() - allJieQi[i].date.getTime()) / (1000 * 60 * 60 * 24);
        return { name: allJieQi[i].name, date: allJieQi[i].date, daysDistance: Math.abs(days) };
      }
    }
  }

  return { name: '', date: new Date(), daysDistance: 0 };
}

// ============================================================
// 天文计算辅助函数
// ============================================================

/** 估算节气的儒略日 */
function estimateTermJDE(year: number, termIndex: number): number {
  // 以春分(index=5)为参考点
  const y = year + (termIndex * 15 + 285 - 360 * (termIndex >= 5 ? 0 : -1)) / 360;
  // 粗略估算
  const jd0 = 2451545.0; // J2000.0 = 2000-01-01 12:00 UTC
  const T = (year - 2000) + ((termIndex - 5) * 15.2) / 365.25;
  return jd0 + T * 365.25;
}

/**
 * 计算太阳黄经（简化 VSOP87）
 * @param jd 儒略日
 * @returns 太阳黄经（度）
 */
function solarLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525; // 儒略世纪

  // 太阳平黄经
  let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  // 太阳平近点角
  let M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;

  L0 = L0 % 360;
  M = M % 360;
  const Mrad = M * Math.PI / 180;

  // 太阳中心方程
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
    + 0.000289 * Math.sin(3 * Mrad);

  // 太阳真黄经
  let sunLon = L0 + C;

  // 章动修正（简化）
  const omega = 125.04 - 1934.136 * T;
  const omegaRad = omega * Math.PI / 180;
  sunLon = sunLon - 0.00569 - 0.00478 * Math.sin(omegaRad);

  sunLon = ((sunLon % 360) + 360) % 360;
  return sunLon;
}

/** 儒略日转 Date */
function julianDayToDate(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A: number;
  if (z < 2299161) {
    A = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const dayInt = Math.floor(day);
  const dayFrac = day - dayInt;
  const hours = dayFrac * 24;
  const hourInt = Math.floor(hours);
  const minuteInt = Math.floor((hours - hourInt) * 60);

  return new Date(Date.UTC(year, month - 1, dayInt, hourInt, minuteInt));
}

// ============================================================
// 农历转换 (使用预计算的农历数据表)
// ============================================================

/**
 * 农历数据表 (1900-2100)
 * 每个元素编码了一年的农历信息：
 * - bit[0-3]: 闰月月份 (0=无闰月)
 * - bit[4-15]: 每月大小 (1=大月30天, 0=小月29天)
 * - bit[16-19]: 闰月大小
 */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520,
];

/**
 * 获取农历年的总天数
 */
function lunarYearDays(year: number): number {
  let sum = 348; // 12个月 × 29天
  const info = LUNAR_INFO[year - 1900];
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (info & i) ? 1 : 0;
  }
  return sum + leapMonthDays(year);
}

/**
 * 获取闰月天数 (0 或 29 或 30)
 */
function leapMonthDays(year: number): number {
  if (leapMonth(year) === 0) return 0;
  return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
}

/**
 * 获取闰月月份 (0=无闰月)
 */
function leapMonth(year: number): number {
  return LUNAR_INFO[year - 1900] & 0xf;
}

/**
 * 获取农历某月天数
 */
function lunarMonthDays(year: number, month: number): number {
  return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29;
}

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
  // 1900年1月31日是农历1900年正月初一
  const baseDate = new Date(1900, 0, 31);
  const targetDate = new Date(year, month - 1, day);
  let offset = Math.floor((targetDate.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000));

  // 推算农历年
  let lunarYear = 1900;
  let temp = 0;
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    temp = lunarYearDays(lunarYear);
    offset -= temp;
  }
  if (offset < 0) {
    offset += temp;
    lunarYear--;
  }

  // 推算农历月
  const leap = leapMonth(lunarYear);
  let isLeapMonth = false;
  let lunarMonth = 1;

  for (let i = 1; i < 13 && offset > 0; i++) {
    // 闰月
    if (leap > 0 && i === leap + 1 && !isLeapMonth) {
      --i;
      isLeapMonth = true;
      temp = leapMonthDays(lunarYear);
    } else {
      temp = lunarMonthDays(lunarYear, i);
    }

    if (isLeapMonth && i === leap + 1) {
      isLeapMonth = false;
    }

    offset -= temp;
    if (!isLeapMonth) lunarMonth++;
  }

  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeapMonth) {
      isLeapMonth = false;
    } else {
      isLeapMonth = true;
      --lunarMonth;
    }
  }

  if (offset < 0) {
    offset += temp;
    --lunarMonth;
  }

  const lunarDay = offset + 1;

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeapMonth,
    lunarMonthName: getLunarMonthName(lunarMonth, isLeapMonth),
    lunarDayName: getLunarDayName(lunarDay),
  };
}

// ============================================================
// 农历名称辅助
// ============================================================

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];

function getLunarMonthName(month: number, isLeap: boolean): string {
  return (isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[month - 1] + '月';
}

const LUNAR_DAY_NAMES = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

function getLunarDayName(day: number): string {
  return LUNAR_DAY_NAMES[day] || `${day}`;
}

/** 获取农历年份的天干地支 */
export function getLunarYearGanZhi(year: number): string {
  const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const ganIdx = (year - 4) % 10;
  const zhiIdx = (year - 4) % 12;
  return TIAN_GAN[ganIdx] + DI_ZHI[zhiIdx];
}
