// ============================================================
// FateRead - Core Index (排盘引擎入口)
// ============================================================

import type { BaziChart, PaipanInput } from './types.js';
import { calculateFourPillars } from './pillars.js';
import { calculateHiddenStems } from './hidden-stems.js';
import { calculateTenGods } from './ten-gods.js';
import { calculateDaYun, calculateLiuNian } from './dayun.js';
import { calculateShenSha } from './shensha.js';
import { calculateWuXingCount, judgeDayMasterStrength, determineUsefulGod, determinePattern, getSeasonalAdvice } from './analysis.js';
import { solarToLunar } from './calendar.js';
import { getNaYin, STEM_ELEMENT } from './constants.js';

/**
 * 完整排盘：输入出生信息，输出完整命盘
 */
export function paipan(input: PaipanInput): BaziChart {
  // 1. 四柱排盘
  const { fourPillars, trueSolarTime, lunarInfo } = calculateFourPillars(input);

  // 2. 藏干
  const hiddenStems = calculateHiddenStems(fourPillars);

  // 3. 十神
  const tenGods = calculateTenGods(fourPillars);

  // 4. 纳音
  const naYin = {
    year: getNaYin(fourPillars.year.stem, fourPillars.year.branch),
    month: getNaYin(fourPillars.month.stem, fourPillars.month.branch),
    day: getNaYin(fourPillars.day.stem, fourPillars.day.branch),
    hour: getNaYin(fourPillars.hour.stem, fourPillars.hour.branch),
  };

  // 5. 大运
  const daYun = calculateDaYun(fourPillars, input.gender, input.year, input.month, input.day);

  // 6. 当前流年
  const currentYear = new Date().getFullYear();
  const currentLiuNanPillar = calculateLiuNian(currentYear);

  // 7. 神煞
  const shenSha = calculateShenSha(fourPillars);

  // 8. 五行统计
  const wuXingCount = calculateWuXingCount(fourPillars);

  // 9. 日主旺衰
  const dayMasterStrength = judgeDayMasterStrength(fourPillars, wuXingCount);

  // 10. 用神/忌神
  const { usefulGod, harmfulGod } = determineUsefulGod(
    fourPillars.day.stem, dayMasterStrength, fourPillars
  );

  // 11. 格局
  const pattern = determinePattern(fourPillars, tenGods, dayMasterStrength);

  // 12. 调候
  const seasonalAdjust = getSeasonalAdvice(fourPillars.day.stem, fourPillars.month.branch);

  // 13. 农历信息
  const lunar = solarToLunar(input.year, input.month, input.day);

  const chart: BaziChart = {
    birthInfo: {
      solarDate: `${input.year}年${input.month}月${input.day}日 ${input.hour}:${String(input.minute).padStart(2, '0')}`,
      lunarDate: `${lunar.lunarYear}年${lunar.lunarMonthName}${lunar.lunarDayName}`,
      trueSolarTime: `${trueSolarTime.hour}:${String(trueSolarTime.minute).padStart(2, '0')}`,
      gender: input.gender,
      longitude: input.longitude,
    },
    fourPillars,
    hiddenStems,
    tenGods,
    naYin,
    daYun,
    currentLiuNian: {
      year: currentYear,
      pillar: currentLiuNanPillar,
    },
    shenSha,
    wuXingCount,
    analysis: {
      dayMaster: fourPillars.day.stem,
      dayMasterElement: STEM_ELEMENT[fourPillars.day.stem],
      dayMasterStrength,
      usefulGod,
      harmfulGod,
      pattern,
      seasonalAdjust,
    },
  };

  return chart;
}

/**
 * 将命盘格式化为可读的文本
 */
export function formatChart(chart: BaziChart): string {
  const { fourPillars: fp, analysis: a } = chart;

  const strengthMap: Record<string, string> = {
    'very_strong': '极旺',
    'strong': '偏旺',
    'neutral': '中和',
    'weak': '偏弱',
    'very_weak': '极弱',
  };

  let output = '';

  output += '╔══════════════════════════════════════════╗\n';
  output += '║           FateRead · 八字命盘             ║\n';
  output += '╠══════════════════════════════════════════╣\n';

  output += `║ 公历：${chart.birthInfo.solarDate.padEnd(30)}║\n`;
  output += `║ 农历：${chart.birthInfo.lunarDate.padEnd(30)}║\n`;
  output += `║ 真太阳时：${chart.birthInfo.trueSolarTime.padEnd(26)}║\n`;
  output += `║ 性别：${(chart.birthInfo.gender === 'male' ? '男' : '女').padEnd(30)}║\n`;

  output += '╠══════════════════════════════════════════╣\n';
  output += '║              四 柱 排 盘                  ║\n';
  output += '╠══════════════════════════════════════════╣\n';

  output += `║       年柱      月柱      日柱      时柱  ║\n`;
  output += `║ 天干   ${fp.year.stem}        ${fp.month.stem}        ${fp.day.stem}        ${fp.hour.stem}    ║\n`;
  output += `║ 地支   ${fp.year.branch}        ${fp.month.branch}        ${fp.day.branch}        ${fp.hour.branch}    ║\n`;

  // 十神
  const tg = chart.tenGods;
  output += `║ 十神  ${String(tg.year.stem).padEnd(8)}${String(tg.month.stem).padEnd(8)}${'日主'.padEnd(8)}${String(tg.hour.stem).padEnd(6)}║\n`;

  // 藏干
  const hs = chart.hiddenStems;
  const maxLen = Math.max(hs.year.length, hs.month.length, hs.day.length, hs.hour.length);
  for (let i = 0; i < maxLen; i++) {
    const y = hs.year[i] || '  ';
    const m = hs.month[i] || '  ';
    const d = hs.day[i] || '  ';
    const h = hs.hour[i] || '  ';
    const label = i === 0 ? '藏干' : '    ';
    output += `║ ${label}   ${y}        ${m}        ${d}        ${h}    ║\n`;
  }

  // 纳音
  output += `║ 纳音  ${chart.naYin.year.padEnd(6)}  ${chart.naYin.month.padEnd(6)}  ${chart.naYin.day.padEnd(6)}  ${chart.naYin.hour.padEnd(4)}║\n`;

  output += '╠══════════════════════════════════════════╣\n';
  output += '║              命 局 分 析                  ║\n';
  output += '╠══════════════════════════════════════════╣\n';

  output += `║ 日主：${a.dayMaster}${a.dayMasterElement} · ${strengthMap[a.dayMasterStrength] || a.dayMasterStrength}\n`;
  output += `║ 格局：${a.pattern}\n`;
  output += `║ 用神：${a.usefulGod}    忌神：${a.harmfulGod}\n`;
  output += `║ 调候：${a.seasonalAdjust}\n`;

  // 五行
  output += '╠══════════════════════════════════════════╣\n';
  output += '║              五 行 统 计                  ║\n';
  output += '╠══════════════════════════════════════════╣\n';
  const wx = chart.wuXingCount;
  const total = Object.values(wx).reduce((a, b) => a + b, 0);
  for (const [element, count] of Object.entries(wx)) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5));
    output += `║ ${element} ${String(count).padStart(4)}  ${bar.padEnd(20)} ${String(pct).padStart(3)}%  ║\n`;
  }

  // 大运
  output += '╠══════════════════════════════════════════╣\n';
  output += `║ 大运（${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}，${chart.daYun.startAge}岁起运）\n`;
  output += '╠══════════════════════════════════════════╣\n';
  output += '║ ';
  for (const dy of chart.daYun.pillars) {
    output += `${dy.pillar.stem}${dy.pillar.branch}(${dy.startAge}-${dy.endAge}) `;
  }
  output += '\n';

  // 流年
  if (chart.currentLiuNian) {
    output += '╠══════════════════════════════════════════╣\n';
    output += `║ ${chart.currentLiuNian.year}年流年：${chart.currentLiuNian.pillar.stem}${chart.currentLiuNian.pillar.branch}\n`;
  }

  // 神煞
  if (chart.shenSha.length > 0) {
    output += '╠══════════════════════════════════════════╣\n';
    output += '║              神 煞                       ║\n';
    output += '╠══════════════════════════════════════════╣\n';
    for (const ss of chart.shenSha) {
      output += `║ ${ss.name}（${ss.position}）：${ss.description}\n`;
    }
  }

  output += '╚══════════════════════════════════════════╝\n';

  return output;
}

// 导出所有子模块
export * from './types.js';
export { calculateFourPillars } from './pillars.js';
export { calculateHiddenStems } from './hidden-stems.js';
export { calculateTenGods } from './ten-gods.js';
export { calculateDaYun, calculateLiuNian, calculateLiuNianRange } from './dayun.js';
export { calculateShenSha } from './shensha.js';
export { calculateWuXingCount, judgeDayMasterStrength, determineUsefulGod, determinePattern } from './analysis.js';
export { solarToLunar, getSolarTermDate } from './calendar.js';
export { getTrueSolarTime, CITY_LONGITUDE } from './solar-time.js';
