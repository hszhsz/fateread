// ============================================================
// FateRead - 紫微斗数 Agent (Ziwei Doushu School Sub-Agent)
// 基于《紫微斗数全书》《太微赋》《骨髓赋》体系
// ============================================================

import type { BaziChart, UserProfile } from '../../core/types.js';
import { formatProfileContext } from '../tools.js';
import { BaseSchoolAgent } from './base-school.js';

/**
 * 紫微斗数流派 Agent
 *
 * 方法论特色：
 * - 以命宫为太极点，论星曜组合
 * - 十二宫体系：命宫、兄弟、夫妻、子女、财帛、疾厄、迁移、交友、官禄、田宅、福德、父母
 * - 四化飞星：化禄、化权、化科、化忌
 * - 星曜分类：紫微星系14主星 + 辅星 + 煞星
 * - 大限流年以宫位飞星为主
 *
 * 注意：紫微斗数的排盘需要农历信息，这里基于八字数据进行"等价分析"
 * 即从紫微的视角解读相同的时空信息
 */
export class ZiweiAgent extends BaseSchoolAgent {
  constructor() {
    super('ziwei');
  }

  protected getSystemPrompt(): string {
    return `你是一位精通紫微斗数的命理大师，师承《紫微斗数全书》《太微赋》《骨髓赋》体系。

## 你的方法论

### 核心理论
1. **命宫体系**：以命宫主星为核心，配合三方四正（命宫、迁移、官禄、财帛）论格局
2. **星曜组合**：
   - 北斗主星：紫微、天机、太阳、武曲、天同、廉贞
   - 南斗主星：天府、太阴、贪狼、巨门、天相、天梁、七杀、破军
   - 辅星：文昌、文曲、左辅、右弼、天魁、天钺
   - 煞星：擎羊、陀罗、火星、铃星、地空、地劫
3. **四化飞星**：
   - 化禄：财源、人缘、享受
   - 化权：权力、争夺、执着
   - 化科：名声、学问、贵人
   - 化忌：困扰、执着、缺陷
4. **格局判断**：
   - 紫府同宫、日月并明、石中隐玉、七杀朝斗等
   - 格局高低取决于主星庙旺利陷 + 辅煞配置

### 分析流程
1. 根据出生时间确定命宫位置和主星
2. 判断主星庙旺利陷（落宫状态）
3. 看三方四正的星曜组合
4. 分析四化飞星的影响
5. 看大限（十年大运）和流年
6. 综合辅星煞星的加持或损害

### 从八字数据推导紫微信息
由于当前数据以八字格式提供，你需要：
- 从农历日期推算命宫位置
- 从时辰确定命宫起点
- 根据出生年干确定四化
- 结合五行纳音判断星曜状态

### 判断标准
- 信心度高（>80）：主星明确、格局清晰、四化有利
- 信心度中（50-80）：星曜杂驳、格局中平
- 信心度低（<50）：需要更多信息或格局复杂

### 重要约束
- 所有结论必须引用具体的星曜和宫位作为依据
- 区分先天盘和大限/流年盘的影响
- 紫微重"象"不重"数"——注重星曜象义的灵活运用`;
  }

  protected formatChartData(chart: BaziChart, profile: UserProfile | null): string {
    const fp = chart.fourPillars;
    // 从农历日期和时辰推导紫微相关信息
    let data = `# 命盘数据（紫微斗数视角）

## 出生信息
- 公历：${chart.birthInfo.solarDate}
- 农历：${chart.birthInfo.lunarDate}
- 真太阳时：${chart.birthInfo.trueSolarTime}
- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}

## 四柱（供推导紫微命盘参考）
- 年柱：${fp.year.stem}${fp.year.branch}（年干决定四化）
- 月柱：${fp.month.stem}${fp.month.branch}
- 日柱：${fp.day.stem}${fp.day.branch}
- 时柱：${fp.hour.stem}${fp.hour.branch}（时辰决定命宫位置）

## 关键推导要素
- 年干：${fp.year.stem}（用于确定四化飞星）
- 出生时辰：${fp.hour.branch}时
- 农历月份：来自农历日期 ${chart.birthInfo.lunarDate}
- 纳音：年-${chart.naYin.year}，日-${chart.naYin.day}

## 五行力量分布
- 金：${chart.wuXingCount.金}
- 木：${chart.wuXingCount.木}
- 水：${chart.wuXingCount.水}
- 火：${chart.wuXingCount.火}
- 土：${chart.wuXingCount.土}

## 大运信息
- 起运年龄：${chart.daYun.startAge}岁
- 方向：${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}
- 大运序列：${chart.daYun.pillars.map(p => `${p.pillar.stem}${p.pillar.branch}(${p.startAge}-${p.endAge})`).join(' → ')}

## 请你根据以上信息：
1. 推算命宫位置和主星
2. 确定年干四化
3. 分析三方四正星曜配置
4. 给出紫微视角的格局判断
`;

    if (profile) {
      data += '\n' + formatProfileContext(profile);
    }

    return data;
  }
}
