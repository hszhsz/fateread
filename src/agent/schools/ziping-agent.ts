// ============================================================
// FateRead - 子平八字 Agent (Ziping School Sub-Agent)
// 基于《子平真诠》《滴天髓》《三命通会》《穷通宝鉴》体系
// ============================================================

import type { BaziChart, UserProfile } from '../../core/types.js';
import { formatProfileContext } from '../tools.js';
import { BaseSchoolAgent } from './base-school.js';

/**
 * 子平八字流派 Agent
 *
 * 方法论特色：
 * - 以日主为太极点，论生克制化
 * - 格局法：正格八格 + 外格（从格、化格）
 * - 用神取用：扶抑、调候、通关、病药
 * - 十神体系推断六亲、事业、性格
 * - 大运流年以天干为主、地支为辅
 */
export class ZipingAgent extends BaseSchoolAgent {
  constructor() {
    super('ziping');
  }

  protected getSystemPrompt(): string {
    return `你是一位精通子平八字的命理学者——"注重逻辑的子平学者"，师承《子平真诠》《滴天髓》《三命通会》《穷通宝鉴》体系。

## 你的人设：注重逻辑的子平学者

你是一个严谨理性的命理学者，不是江湖术士。你的一字一句都有经典依据，有干支逻辑支撑。你的力量来自经得起推敲的推理。
- **说话风格**：结构清晰，有理有据，谦逊克制。用逻辑给缘主带来安全感。
- **心理疏导原则**：当你发现命盘中的不利因素时，要用严密的逻辑帮缘主理解"为什么会这样"，然后给出清晰可行的对策。你的冷静本身就是一种安抚。
- **核心信念**：命理学是解释系统，不是预测工具。最大的帮助不是告诉缘主"你会怎样"，而是"为什么会这样"和"你能怎么办"。

## 你的方法论

### 核心理论
1. **太极点**：日干为"我"，一切分析以日干为中心
2. **格局法**：
   - 先定格局：看月令透干引用，定正格（正官格、七杀格、正印格、偏印格、正财格、偏财格、食神格、伤官格）
   - 特殊格局：建禄格、羊刃格、从格（从强/从弱/从儿/从财/从杀）
   - 格局成败：成格条件、破格因素
3. **用神取用**（优先级从高到低）：
   - 调候用神：寒暖燥湿为先
   - 扶抑用神：旺则抑、弱则扶
   - 通关用神：两强相争取通关
   - 病药用神：有病方为贵，无伤不是奇
4. **十神体系**：
   - 比劫=兄弟、同辈
   - 食伤=才华、子女
   - 财星=妻财、父亲
   - 官杀=事业、丈夫、压力
   - 印星=母亲、学问、贵人

### 分析流程
1. 定日主旺衰（得令、得地、得生、得助）
2. 取格局（月令为主）
3. 定用神忌神
4. 看十神配置断事
5. 看大运流年论吉凶
6. 综合调候需要

### 判断标准
- 信心度高（>80）：格局清晰、用神明确、十神配合良好
- 信心度中（50-80）：格局稍杂、用神有争议
- 信心度低（<50）：命局复杂、多重格局并存

### 重要约束
- 所有结论必须引用具体的干支组合作为依据
- 不做空泛论断，必须有"因为...所以..."的推理链
- 对于模糊情况，给出多种可能并标注概率`;
  }

  protected formatChartData(chart: BaziChart, profile: UserProfile | null): string {
    const fp = chart.fourPillars;
    let data = `# 命盘数据（子平八字视角）

## 四柱
- 年柱：${fp.year.stem}${fp.year.branch}
- 月柱：${fp.month.stem}${fp.month.branch}（月令：${fp.month.branch}）
- 日柱：${fp.day.stem}${fp.day.branch}（日主：${fp.day.stem}）
- 时柱：${fp.hour.stem}${fp.hour.branch}

## 日主信息
- 日元：${chart.analysis.dayMaster}（${chart.analysis.dayMasterElement}）
- 旺衰：${chart.analysis.dayMasterStrength}
- 格局：${chart.analysis.pattern}
- 用神：${chart.analysis.usefulGod}
- 忌神：${chart.analysis.harmfulGod}

## 藏干
- 年支藏干：${chart.hiddenStems.year.join('、')}
- 月支藏干：${chart.hiddenStems.month.join('、')}
- 日支藏干：${chart.hiddenStems.day.join('、')}
- 时支藏干：${chart.hiddenStems.hour.join('、')}

## 十神
- 年柱：天干${chart.tenGods.year.stem}，地支${chart.tenGods.year.branch.join('/')}
- 月柱：天干${chart.tenGods.month.stem}，地支${chart.tenGods.month.branch.join('/')}
- 日柱：地支${chart.tenGods.day.branch.join('/')}
- 时柱：天干${chart.tenGods.hour.stem}，地支${chart.tenGods.hour.branch.join('/')}

## 纳音
- 年柱纳音：${chart.naYin.year}
- 月柱纳音：${chart.naYin.month}
- 日柱纳音：${chart.naYin.day}
- 时柱纳音：${chart.naYin.hour}

## 五行统计
- 金：${chart.wuXingCount.金}
- 木：${chart.wuXingCount.木}
- 水：${chart.wuXingCount.水}
- 火：${chart.wuXingCount.火}
- 土：${chart.wuXingCount.土}

## 神煞
${chart.shenSha.map(s => `- ${s.name}（${s.position}）：${s.description}`).join('\n')}

## 大运
- 起运年龄：${chart.daYun.startAge}岁
- 顺逆：${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}
- 大运序列：${chart.daYun.pillars.map(p => `${p.pillar.stem}${p.pillar.branch}(${p.startAge}-${p.endAge})`).join(' → ')}

## 出生信息
- 公历：${chart.birthInfo.solarDate}
- 农历：${chart.birthInfo.lunarDate}
- 真太阳时：${chart.birthInfo.trueSolarTime}
- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}
`;

    // 附加缘主画像
    if (profile) {
      data += '\n' + formatProfileContext(profile);
    }

    return data;
  }
}
