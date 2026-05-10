// ============================================================
// FateRead Skill - 命之书 (Book of Destiny)
// 基于八字命盘生成详尽的先天特质分析 Markdown 文档
// ============================================================

import OpenAI from 'openai';
import type { BaziChart } from '../core/types.js';
import {
  STEM_ELEMENT, BRANCH_ELEMENT, HIDDEN_STEMS,
  STEM_YIN_YANG, WUXING_SHENG, WUXING_KE,
  getShiShen, getNaYin,
} from '../core/constants.js';

// ============================================================
// 命之书专业 Prompt
// ============================================================

const MING_BOOK_SYSTEM_PROMPT = `你是一位贯通古今的命理学大师，精研《子平真诠》《滴天髓》《三命通会》《穷通宝鉴》等经典。
你的任务是根据提供的八字命盘数据，撰写一份详尽的【命之书】—— 全面分析此人的先天特质。

## 写作要求

### 风格
- 以"命理大师执笔的古典命书"风格书写，兼具文学性与专业性
- 每个章节先以简洁的命理术语概括，再用通俗的白话深入阐释
- 语言典雅而不晦涩，富有画面感和温度
- 适当引用经典命理典籍原文作为论据

### 结构（严格按以下章节输出 Markdown）

# 命之书

## 卷首 · 命盘总览
> 四柱排列、纳音、日主、格局概述。像一幅山水画的"题跋"，总领全篇。

## 第一章 · 日主论命
- 日干五行属性、阴阳、象意
- 日干坐支的组合含义（日柱纳音）
- 日主旺衰与气质底色

## 第二章 · 格局与层次
- 格局判定（正格/特殊格局）的推导过程
- 格局高低评估
- 成格条件是否满足、有无破格之忧

## 第三章 · 十神星曜
- 逐一分析八字中每个十神的分布和力量
- 重点阐释核心十神组合（如官印相生、食神制杀、伤官配印等）
- 十神缺失或过旺的影响

## 第四章 · 五行禀赋
- 五行力量分布与平衡状态
- 用神与忌神的取用逻辑
- 调候需求
- 五行对应的身体脏腑、方位、颜色、数字等开运指引

## 第五章 · 性格画像
- 基于日干、十神、五行分布综合描绘性格
- 思维方式、情感模式、行为风格
- 优势与需要注意的性格盲区

## 第六章 · 事业天赋
- 适合的行业五行方向
- 事业风格（领导型/技术型/创意型/辅佐型等）
- 官星、印星、食伤与事业的关系
- 贵人方位与助力

## 第七章 · 财富格局
- 正财与偏财的配置
- 求财方式（稳健型/投机型/技术型等）
- 财库、财星与日主的关系
- 理财建议

## 第八章 · 情感婚姻
- 男命看财星，女命看官星
- 配偶星的状态与婚姻品质
- 桃花、红鸾等感情相关神煞
- 最佳配偶五行方向

## 第九章 · 健康体质
- 五行偏枯对应的健康隐患
- 先天体质强弱
- 养生方向建议

## 第十章 · 神煞点评
- 逐一解读命中所带的神煞
- 吉神的加持与凶神的化解

## 卷末 · 命主箴言
> 一段凝练的总结性评语，融合激励与提醒，作为命之书的收笔。

### 内容要求
- 每章不少于 300 字
- 必须引用命盘中的具体干支、十神数据作为论据，不可空泛
- 所有论断必须有命理逻辑支撑
- 涉及不利信息时以"提醒注意"方式表达，附带化解建议
- 明确声明：命理分析仅供参考，不替代专业咨询`;

// ============================================================
// 构建命盘摘要数据（供 LLM 参考）
// ============================================================

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

  // 基础信息
  ctx += `## 出生信息\n`;
  ctx += `- 公历：${chart.birthInfo.solarDate}\n`;
  ctx += `- 农历：${chart.birthInfo.lunarDate}\n`;
  ctx += `- 真太阳时：${chart.birthInfo.trueSolarTime}\n`;
  ctx += `- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}\n\n`;

  // 四柱
  ctx += `## 四柱\n`;
  ctx += `| | 年柱 | 月柱 | 日柱 | 时柱 |\n`;
  ctx += `|---|---|---|---|---|\n`;
  ctx += `| 天干 | ${fp.year.stem} | ${fp.month.stem} | ${fp.day.stem} | ${fp.hour.stem} |\n`;
  ctx += `| 地支 | ${fp.year.branch} | ${fp.month.branch} | ${fp.day.branch} | ${fp.hour.branch} |\n`;
  ctx += `| 纳音 | ${chart.naYin.year} | ${chart.naYin.month} | ${chart.naYin.day} | ${chart.naYin.hour} |\n\n`;

  // 十神
  const tg = chart.tenGods;
  ctx += `## 十神分布\n`;
  ctx += `| | 年柱 | 月柱 | 日柱 | 时柱 |\n`;
  ctx += `|---|---|---|---|---|\n`;
  ctx += `| 天干十神 | ${tg.year.stem} | ${tg.month.stem} | 日主 | ${tg.hour.stem} |\n`;
  ctx += `| 地支藏干十神 | ${tg.year.branch.join('/')} | ${tg.month.branch.join('/')} | ${tg.day.branch.join('/')} | ${tg.hour.branch.join('/')} |\n\n`;

  // 藏干
  const hs = chart.hiddenStems;
  ctx += `## 藏干\n`;
  ctx += `- 年支${fp.year.branch}藏：${hs.year.join('、')}\n`;
  ctx += `- 月支${fp.month.branch}藏：${hs.month.join('、')}\n`;
  ctx += `- 日支${fp.day.branch}藏：${hs.day.join('、')}\n`;
  ctx += `- 时支${fp.hour.branch}藏：${hs.hour.join('、')}\n\n`;

  // 五行统计
  ctx += `## 五行力量\n`;
  const wx = chart.wuXingCount;
  const total = Object.values(wx).reduce((a, b) => a + b, 0);
  for (const [element, count] of Object.entries(wx)) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    ctx += `- ${element}：${count}（${pct}%）\n`;
  }
  ctx += '\n';

  // 分析结论
  ctx += `## 命局分析\n`;
  ctx += `- 日主：${a.dayMaster}（${a.dayMasterElement}）\n`;
  ctx += `- 日主旺衰：${strengthMap[a.dayMasterStrength] || a.dayMasterStrength}\n`;
  ctx += `- 格局：${a.pattern}\n`;
  ctx += `- 用神：${a.usefulGod}\n`;
  ctx += `- 忌神：${a.harmfulGod}\n`;
  ctx += `- 调候：${a.seasonalAdjust}\n\n`;

  // 神煞
  if (chart.shenSha.length > 0) {
    ctx += `## 神煞\n`;
    for (const ss of chart.shenSha) {
      ctx += `- ${ss.name}（${ss.position}）：${ss.description}\n`;
    }
    ctx += '\n';
  }

  // 大运概览
  ctx += `## 大运（${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}，${chart.daYun.startAge}岁起运）\n`;
  for (const dy of chart.daYun.pillars) {
    ctx += `- ${dy.pillar.stem}${dy.pillar.branch}（${dy.startAge}-${dy.endAge}岁）\n`;
  }

  return ctx;
}

// ============================================================
// 生成命之书
// ============================================================

export interface MingBookOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * 调用 LLM 生成命之书 Markdown
 */
export async function generateMingBook(
  chart: BaziChart,
  options: MingBookOptions = {}
): Promise<string> {
  const client = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  });
  const model = options.model || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';

  const context = buildMingBookContext(chart);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: MING_BOOK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请根据以下命盘数据，撰写完整的【命之书】。\n\n${context}`,
      },
    ],
  });

  const message = response.choices[0].message as unknown as Record<string, unknown>;
  return (message.content as string) || '';
}
