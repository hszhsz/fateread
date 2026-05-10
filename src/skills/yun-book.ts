// ============================================================
// FateRead Skill - 运之书 (Book of Fortune)
// Context builder for yun-book skill — provides structured chart
// and dayun data to the LLM for composing the Book of Fortune.
// ============================================================

import type { BaziChart } from '../core/types.js';
import {
  STEM_ELEMENT, BRANCH_ELEMENT, HIDDEN_STEMS,
  getShiShen, getNaYin,
} from '../core/constants.js';
import { calculateLiuNian } from '../core/dayun.js';

/**
 * Build structured chart + dayun context for the LLM to write the Book of Fortune.
 * This data is supplied via the get_chart_context tool.
 */
export function buildYunBookContext(chart: BaziChart, startYear?: number, endYear?: number): string {
  const { fourPillars: fp, analysis: a } = chart;

  const strengthMap: Record<string, string> = {
    'very_strong': '极旺',
    'strong': '偏旺',
    'neutral': '中和',
    'weak': '偏弱',
    'very_weak': '极弱',
  };

  let ctx = '# 命盘与运势数据\n\n';

  ctx += `## 命盘摘要\n`;
  ctx += `- 四柱：${fp.year.stem}${fp.year.branch} ${fp.month.stem}${fp.month.branch} ${fp.day.stem}${fp.day.branch} ${fp.hour.stem}${fp.hour.branch}\n`;
  ctx += `- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}\n`;
  ctx += `- 日主：${a.dayMaster}（${a.dayMasterElement}）· ${strengthMap[a.dayMasterStrength]}\n`;
  ctx += `- 格局：${a.pattern}\n`;
  ctx += `- 用神：${a.usefulGod}  忌神：${a.harmfulGod}\n`;
  ctx += `- 调候：${a.seasonalAdjust}\n\n`;

  const tg = chart.tenGods;
  ctx += `## 十神配置\n`;
  ctx += `- 年干${fp.year.stem}（${tg.year.stem}）月干${fp.month.stem}（${tg.month.stem}）日干${fp.day.stem}（日主）时干${fp.hour.stem}（${tg.hour.stem}）\n\n`;

  ctx += `## 五行力量\n`;
  const wx = chart.wuXingCount;
  for (const [element, count] of Object.entries(wx)) {
    ctx += `- ${element}：${count}\n`;
  }
  ctx += '\n';

  if (chart.shenSha.length > 0) {
    ctx += `## 神煞\n`;
    for (const ss of chart.shenSha) {
      ctx += `- ${ss.name}（${ss.position}）\n`;
    }
    ctx += '\n';
  }

  ctx += `## 大运排列（${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}，${chart.daYun.startAge}岁起运）\n\n`;

  for (const dy of chart.daYun.pillars) {
    const dyStem = dy.pillar.stem;
    const dyBranch = dy.pillar.branch;
    const dyElement = STEM_ELEMENT[dyStem];
    const dyBranchElement = BRANCH_ELEMENT[dyBranch];
    const dyHidden = HIDDEN_STEMS[dyBranch];
    const dyNaYin = getNaYin(dyStem, dyBranch);
    const dyRelation = getShiShen(fp.day.stem, dyStem);

    ctx += `### ${dyStem}${dyBranch}运（${dy.startAge}-${dy.endAge}岁）\n`;
    ctx += `- 天干：${dyStem}（${dyElement}）— 十神：${dyRelation}\n`;
    ctx += `- 地支：${dyBranch}（${dyBranchElement}）— 藏干：${dyHidden.join('、')}\n`;
    ctx += `- 纳音：${dyNaYin}\n`;

    const birthYear = parseInt(chart.birthInfo.solarDate.split('年')[0]);
    const liuNianStart = birthYear + dy.startAge;
    const liuNianEnd = birthYear + dy.endAge;

    const actualStart = startYear ? Math.max(liuNianStart, startYear) : liuNianStart;
    const actualEnd = endYear ? Math.min(liuNianEnd, endYear) : liuNianEnd;

    if (actualStart <= actualEnd) {
      ctx += `- 流年：\n`;
      for (let y = actualStart; y <= actualEnd; y++) {
        const lnPillar = calculateLiuNian(y);
        const lnRelation = getShiShen(fp.day.stem, lnPillar.stem);
        const lnNaYin = getNaYin(lnPillar.stem, lnPillar.branch);
        ctx += `  - ${y}年 ${lnPillar.stem}${lnPillar.branch}（${STEM_ELEMENT[lnPillar.stem]}）— ${lnRelation} — 纳音${lnNaYin}\n`;
      }
    }
    ctx += '\n';
  }

  return ctx;
}
