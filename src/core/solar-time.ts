// ============================================================
// FateRead - Solar Time Calculator (真太阳时计算)
// ============================================================

/**
 * 计算真太阳时
 * 真太阳时 = 地方平太阳时 + 时差方程
 * 地方平太阳时 = UTC + 经度/15 小时
 *
 * @param year 年
 * @param month 月
 * @param day 日
 * @param hour 时
 * @param minute 分
 * @param longitude 经度（东经为正）
 * @returns 校正后的 { hour, minute }
 */
export function getTrueSolarTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  longitude: number = 120 // 默认东八区中心经度
): { hour: number; minute: number; dayOffset: number } {
  // 1. 计算当年的第几天 (Day of Year)
  const doy = getDayOfYear(year, month, day);

  // 2. 时差方程 (Equation of Time)，单位：分钟
  const eot = equationOfTime(doy);

  // 3. 经度时差：当地经度与标准时区经度(120°E for UTC+8)之差
  // 每度 = 4 分钟
  const longitudeCorrection = (longitude - 120) * 4;

  // 4. 总校正量（分钟）
  const totalCorrection = longitudeCorrection + eot;

  // 5. 应用校正
  let totalMinutes = hour * 60 + minute + totalCorrection;
  let dayOffset = 0;

  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    dayOffset = -1;
  } else if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    dayOffset = 1;
  }

  return {
    hour: Math.floor(totalMinutes / 60),
    minute: Math.round(totalMinutes % 60),
    dayOffset,
  };
}

/**
 * 时差方程（Equation of Time）
 * 使用Spencer近似公式，精度约为±30秒
 * @param dayOfYear 一年中的第几天
 * @returns 分钟数
 */
function equationOfTime(dayOfYear: number): number {
  const B = (2 * Math.PI * (dayOfYear - 81)) / 365;
  // Spencer公式
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  return eot;
}

/**
 * 计算某日是该年的第几天
 */
function getDayOfYear(year: number, month: number, day: number): number {
  const date = new Date(year, month - 1, day);
  const start = new Date(year, 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * 根据城市名获取大致经度（常用中国城市）
 */
export const CITY_LONGITUDE: Record<string, number> = {
  '北京': 116.4,
  '上海': 121.5,
  '广州': 113.3,
  '深圳': 114.1,
  '成都': 104.1,
  '重庆': 106.5,
  '武汉': 114.3,
  '杭州': 120.2,
  '南京': 118.8,
  '西安': 108.9,
  '长沙': 113.0,
  '沈阳': 123.4,
  '哈尔滨': 126.6,
  '大连': 121.6,
  '济南': 117.0,
  '青岛': 120.4,
  '郑州': 113.7,
  '昆明': 102.7,
  '兰州': 103.8,
  '乌鲁木齐': 87.6,
  '拉萨': 91.1,
  '太原': 112.5,
  '合肥': 117.3,
  '福州': 119.3,
  '厦门': 118.1,
  '南昌': 115.9,
  '贵阳': 106.7,
  '海口': 110.4,
  '石家庄': 114.5,
  '呼和浩特': 111.7,
  '南宁': 108.3,
  '银川': 106.3,
  '西宁': 101.8,
  '天津': 117.2,
  '长春': 125.3,
  '台北': 121.5,
  '香港': 114.2,
  '澳门': 113.5,
};
