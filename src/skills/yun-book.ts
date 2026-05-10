// ============================================================
// FateRead Skill - 运之书 (Book of Fortune)
// 基于八字命盘生成详尽的大运流年运势 Markdown 文档
// ============================================================

import OpenAI from 'openai';
import type { BaziChart, Pillar } from '../core/types.js';
import {
  STEM_ELEMENT, BRANCH_ELEMENT, HIDDEN_STEMS,
  STEM_YIN_YANG, WUXING_SHENG, WUXING_KE,
  getShiShen, getNaYin, TIAN_GAN, DI_ZHI,
} from '../core/constants.js';
import { calculateLiuNian, calculateLiuNianRange } from '../core/dayun.js';

// ============================================================
// 运之书专业 Prompt
// ============================================================

const YUN_BOOK_SYSTEM_PROMPT = `你是一位贯通古今的命理学大师，精研《子平真诠》《滴天髓》《三命通会》《穷通宝鉴》等经典。
你的任务是根据提供的八字命盘和大运流年数据，撰写一份详尽的【运之书】—— 全面分析此人的运势走向。

## 写作要求

### 风格
- 以"命理大师推演运程"的风格书写，既有高屋建瓴的宏观视角，也有细致入微的流年点评
- 每步大运先总括运势基调，再逐年点评关键流年
- 语言兼具专业深度与通俗表达
- 适当引用经典命理典籍原文辅助论述

### 结构（严格按以下章节输出 Markdown）

# 运之书

## 卷首 · 运程总论
> 此人一生运势的宏观脉络，概述运势的起伏节奏和关键转折点。像一幅长卷的序言。

## 第一章 · 行运法则
- 此命行运的基本规则（顺行/逆行）
- 起运岁数与大运交接规律
- 用神在大运中的得失规律
- 判断运势吉凶的核心逻辑（用神得力为吉，忌神当道为凶）

## 第二章起 · 逐步大运详解

对每步大运单独开一章，格式如下：

## 第N章 · [大运干支]运（N-M岁）

### 运势基调
- 大运天干地支与命局的作用关系
- 大运干支对用神/忌神的影响
- 此步大运对事业、财运、感情、健康各方面的总体影响

### 逐年流年点评
对该大运内的每个流年（10年），以表格或列表形式逐年分析：
- 流年干支
- 流年与大运的组合效应
- 流年与命局的刑冲合害
- 该年重点注意事项（吉则言吉，凶则言避）

### 关键年份特别提醒
- 标注该大运中最需要注意的1-3个年份
- 给出具体的趋吉避凶建议

## 终章 · 运程箴言
> 一段总结性的人生运程忠告，融合命理智慧与现代生活建议。

### 内容要求
- 每步大运分析不少于 500 字
- 必须用命理逻辑推导（如：大运XX与命局XX形成XX，对用神XX产生XX影响）
- 流年分析要具体到每年的干支五行作用
- 涉及不利年份以"提醒注意"方式表达，附带化解方案
- 注明哪些年份适合做什么（投资、跳槽、结婚等），哪些年份宜守不宜攻
- 明确声明：命理分析仅供参考，不替代专业咨询`;

// ============================================================
// 构建运势数据上下文
// ============================================================

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

  // 基础命盘信息（精简版）
  ctx += `## 命盘摘要\n`;
  ctx += `- 四柱：${fp.year.stem}${fp.year.branch} ${fp.month.stem}${fp.month.branch} ${fp.day.stem}${fp.day.branch} ${fp.hour.stem}${fp.hour.branch}\n`;
  ctx += `- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}\n`;
  ctx += `- 日主：${a.dayMaster}（${a.dayMasterElement}）· ${strengthMap[a.dayMasterStrength]}\n`;
  ctx += `- 格局：${a.pattern}\n`;
  ctx += `- 用神：${a.usefulGod}  忌神：${a.harmfulGod}\n`;
  ctx += `- 调候：${a.seasonalAdjust}\n\n`;

  // 十神
  const tg = chart.tenGods;
  ctx += `## 十神配置\n`;
  ctx += `- 年干${fp.year.stem}（${tg.year.stem}）月干${fp.month.stem}（${tg.month.stem}）日干${fp.day.stem}（日主）时干${fp.hour.stem}（${tg.hour.stem}）\n\n`;

  // 五行
  ctx += `## 五行力量\n`;
  const wx = chart.wuXingCount;
  for (const [element, count] of Object.entries(wx)) {
    ctx += `- ${element}：${count}\n`;
  }
  ctx += '\n';

  // 神煞
  if (chart.shenSha.length > 0) {
    ctx += `## 神煞\n`;
    for (const ss of chart.shenSha) {
      ctx += `- ${ss.name}（${ss.position}）\n`;
    }
    ctx += '\n';
  }

  // 大运详细数据
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

    // 计算该大运内的流年
    // 推算出对应的公历年份范围
    const birthYear = parseInt(chart.birthInfo.solarDate.split('年')[0]);
    const liuNianStart = birthYear + dy.startAge;
    const liuNianEnd = birthYear + dy.endAge;

    // 如果指定了范围，只输出范围内的
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

// ============================================================
// 生成运之书
// ============================================================

export interface YunBookOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** 起始年份（默认从当前年份开始） */
  startYear?: number;
  /** 结束年份（默认到最后一步大运结束） */
  endYear?: number;
}

/**
 * 调用 LLM 生成运之书 Markdown
 */
export async function generateYunBook(
  chart: BaziChart,
  options: YunBookOptions = {}
): Promise<string> {
  const client = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  });
  const model = options.model || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';

  const context = buildYunBookContext(chart, options.startYear, options.endYear);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: YUN_BOOK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请根据以下命盘与大运流年数据，撰写完整的【运之书】。\n\n${context}`,
      },
    ],
  });

  const message = response.choices[0].message as unknown as Record<string, unknown>;
  return (message.content as string) || '';
}
