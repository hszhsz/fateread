// ============================================================
// FateRead Skill - 命之书 (Book of Destiny)
// Context builder for ming-book skill — provides structured chart
// data to the LLM for composing the Book of Destiny.
// ============================================================

import type { BaziChart } from '../core/types.js';

/**
 * Build structured chart context for the LLM to write the Book of Destiny.
 * This data is supplied via the get_chart_context tool.
 */
export function buildMingBookContext(chart: BaziChart): string {
  const { fourPillars: fp, analysis: a } = chart;

  const strengthMap: Record<string, string> = {
    'very_strong': '极旺',
    'strong': '偏旺',
    'neutral': '中和',
    'weak': '偏弱',
    'very_weak': '极弱',
  };

  let ctx = '# 命盘原始数据\n\n';

  ctx += `## 出生信息\n`;
  ctx += `- 公历：${chart.birthInfo.solarDate}\n`;
  ctx += `- 农历：${chart.birthInfo.lunarDate}\n`;
  ctx += `- 真太阳时：${chart.birthInfo.trueSolarTime}\n`;
  ctx += `- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}\n\n`;

  ctx += `## 四柱\n`;
  ctx += `| | 年柱 | 月柱 | 日柱 | 时柱 |\n`;
  ctx += `|---|---|---|---|---|\n`;
  ctx += `| 天干 | ${fp.year.stem} | ${fp.month.stem} | ${fp.day.stem} | ${fp.hour.stem} |\n`;
  ctx += `| 地支 | ${fp.year.branch} | ${fp.month.branch} | ${fp.day.branch} | ${fp.hour.branch} |\n`;
  ctx += `| 纳音 | ${chart.naYin.year} | ${chart.naYin.month} | ${chart.naYin.day} | ${chart.naYin.hour} |\n\n`;

  const tg = chart.tenGods;
  ctx += `## 十神分布\n`;
  ctx += `| | 年柱 | 月柱 | 日柱 | 时柱 |\n`;
  ctx += `|---|---|---|---|---|\n`;
  ctx += `| 天干十神 | ${tg.year.stem} | ${tg.month.stem} | 日主 | ${tg.hour.stem} |\n`;
  ctx += `| 地支藏干十神 | ${tg.year.branch.join('/')} | ${tg.month.branch.join('/')} | ${tg.day.branch.join('/')} | ${tg.hour.branch.join('/')} |\n\n`;

  const hs = chart.hiddenStems;
  ctx += `## 藏干\n`;
  ctx += `- 年支${fp.year.branch}藏：${hs.year.join('、')}\n`;
  ctx += `- 月支${fp.month.branch}藏：${hs.month.join('、')}\n`;
  ctx += `- 日支${fp.day.branch}藏：${hs.day.join('、')}\n`;
  ctx += `- 时支${fp.hour.branch}藏：${hs.hour.join('、')}\n\n`;

  ctx += `## 五行力量\n`;
  const wx = chart.wuXingCount;
  const total = Object.values(wx).reduce((a, b) => a + b, 0);
  for (const [element, count] of Object.entries(wx)) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    ctx += `- ${element}：${count}（${pct}%）\n`;
  }
  ctx += '\n';

  ctx += `## 命局分析\n`;
  ctx += `- 日主：${a.dayMaster}（${a.dayMasterElement}）\n`;
  ctx += `- 日主旺衰：${strengthMap[a.dayMasterStrength] || a.dayMasterStrength}\n`;
  ctx += `- 格局：${a.pattern}\n`;
  ctx += `- 用神：${a.usefulGod}\n`;
  ctx += `- 忌神：${a.harmfulGod}\n`;
  ctx += `- 调候：${a.seasonalAdjust}\n\n`;

  if (chart.shenSha.length > 0) {
    ctx += `## 神煞\n`;
    for (const ss of chart.shenSha) {
      ctx += `- ${ss.name}（${ss.position}）：${ss.description}\n`;
    }
    ctx += '\n';
  }

  ctx += `## 大运（${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}，${chart.daYun.startAge}岁起运）\n`;
  for (const dy of chart.daYun.pillars) {
    ctx += `- ${dy.pillar.stem}${dy.pillar.branch}（${dy.startAge}-${dy.endAge}岁）\n`;
  }

  return ctx;
}
