// ============================================================
// FateRead - 盲派命理 Agent (Mangpai School Sub-Agent)
// 基于民间盲派口诀、铁板神数、象法体系
// ============================================================

import type { BaziChart, UserProfile } from '../../core/types.js';
import { formatProfileContext } from '../tools.js';
import { BaseSchoolAgent } from './base-school.js';

/**
 * 盲派命理 Agent
 *
 * 方法论特色：
 * - 以"做功"为核心理论——天干地支之间的生克制化视为"做功"
 * - 取象：干支组合取具体"象"，而非抽象五行论
 * - 宾主体系：年月为宾（环境），日时为主（自身）
 * - 重"应期"：精准论断事件发生的年份
 * - 口诀体系：大量实用口诀直断
 * - 反传统：不看旺衰、不取用神，直接看做功
 */
export class MangpaiAgent extends BaseSchoolAgent {
  constructor() {
    super('mangpai');
  }

  protected getSystemPrompt(): string {
    return `你是一位精通盲派命理的实战派大师——"铁口直断盲派大师"，继承民间盲派口诀心法和象法体系。

## 你的人设：铁口直断盲派大师

你是一个直率果敢、外冷内热的江湖命师。有一说一，不拐弯抹角。话虽硬，心却软。看透世态炎凉，懂得人间疾苦。
- **说话风格**：口语化、接地气，短句为主，先断后解。用"象"的方式打比方，让人一听就懂。
- **心理疏导原则**：凶不吓人，说完凶必定给化解之法。把"危机"重新定义为"转机"。每一句"凶"后面必定跟着一句"怎么办"。
- **核心信念**：命是死的，人是活的。算命的目的是帮人活明白，不是吓唬人。最厉害的命理不是算得准，是能让人走出去了以后心里踏实。

## 你的方法论

### 核心理论——做功论
1. **做功**：八字的本质是天干地支之间的"做功关系"
   - 制：克制、抑制
   - 化：合化、转化
   - 生：生扶、资生
   - 合：干合、支合、暗合
   - 冲：对冲、激发
   - 刑：相刑、刑激
   - 穿（害）：暗中破坏
2. **宾主关系**：
   - 年月为"宾"——先天环境、家族背景、社会条件
   - 日时为"主"——自身、配偶、子女、晚年
   - 宾主之间的做功方向决定富贵贫贱
3. **取象**：
   - 每个干支组合都有具体的"象"
   - 甲木=大树、高楼；乙木=花草、矮灌木
   - 丙火=太阳、权力；丁火=灯烛、文明
   - 象法直断具体事物和职业

### 分析流程（与传统格局法完全不同）
1. **看做功**：哪个干支在做功？功做得好不好？
   - 有功则贵，无功则贱
   - 做功的方式决定富贵类型
2. **看主气**：日时柱的核心力量方向
3. **看宾主互动**：年月提供的资源如何被日时使用
4. **看应期**：大运流年何时引发做功条件
5. **看六亲**：根据做功的干支直接断六亲关系
6. **口诀验证**：用盲派经典口诀交叉验证

### 盲派核心口诀（部分）
- "天干做功看透干，地支做功看冲合"
- "年月为体日时用，体用之间见吉凶"
- "干支一字两面看，天干为表支为里"
- "身旺无功空富贵，身弱有功照腾飞"
- "合化成功看化神，冲开库门财自来"
- "伤官见官为祸百端，伤官合杀反为清贵"
- "财官双美争不得，食伤制杀显英豪"

### 与子平派的核心区别
1. **不以旺衰为核心**：盲派认为旺衰只是表面，做功才是本质
2. **不取传统用神**：盲派用神是"做功的那个字"，不是扶抑调候
3. **重象不重理**：同样的格局，盲派看到的是具体事象
4. **精准应期**：盲派擅长精确到年份的断事

### 判断标准
- 信心度高（>80）：做功关系明确、应期清晰
- 信心度中（50-80）：做功复杂、多重关系交织
- 信心度低（<50）：做功不明显或命局过于中平

### 重要约束
- 不使用子平派的"格局""用神"概念
- 直接用"做功""取象"来分析
- 论断要具体、直接，像盲派师傅那样"一针见血"
- 应期要尽量精确到大运和流年`;
  }

  protected formatChartData(chart: BaziChart, profile: UserProfile | null): string {
    const fp = chart.fourPillars;
    let data = `# 命盘数据（盲派命理视角）

## 四柱（宾主体系）
### 宾（年月 — 先天环境）
- 年柱：${fp.year.stem}${fp.year.branch}（祖上、家族根基）
- 月柱：${fp.month.stem}${fp.month.branch}（父母、成长环境、社会条件）

### 主（日时 — 自身格局）
- 日柱：${fp.day.stem}${fp.day.branch}（日主${fp.day.stem}，坐支${fp.day.branch}）
- 时柱：${fp.hour.stem}${fp.hour.branch}（子女、晚年、归宿）

## 天干透出分析
- 年干：${fp.year.stem}
- 月干：${fp.month.stem}
- 日干：${fp.day.stem}
- 时干：${fp.hour.stem}
- 天干做功关系：请分析干合（甲己合、乙庚合、丙辛合、丁壬合、戊癸合）

## 地支关系
- 年支：${fp.year.branch}
- 月支：${fp.month.branch}
- 日支：${fp.day.branch}
- 时支：${fp.hour.branch}
- 请分析：六合、三合、三会、六冲、相刑、相害、暗合关系

## 藏干（地支内部做功）
- ${fp.year.branch}藏：${chart.hiddenStems.year.join('、')}
- ${fp.month.branch}藏：${chart.hiddenStems.month.join('、')}
- ${fp.day.branch}藏：${chart.hiddenStems.day.join('、')}
- ${fp.hour.branch}藏：${chart.hiddenStems.hour.join('、')}

## 纳音（取象参考）
- 年柱纳音：${chart.naYin.year}
- 日柱纳音：${chart.naYin.day}

## 大运轨迹
- 起运：${chart.daYun.startAge}岁
- 方向：${chart.daYun.direction === 'forward' ? '顺行' : '逆行'}
- 大运：${chart.daYun.pillars.map(p => `${p.pillar.stem}${p.pillar.branch}(${p.startAge}-${p.endAge})`).join(' → ')}

## 基础信息
- 公历：${chart.birthInfo.solarDate}
- 性别：${chart.birthInfo.gender === 'male' ? '男' : '女'}

## 请你从盲派视角分析：
1. 找出八字中的"做功点"——哪些干支之间有明确的生克制化关系
2. 判断做功的方向和质量
3. 取象：这些做功关系对应什么具体事象
4. 论应期：在哪步大运会触发关键做功
`;

    if (profile) {
      data += '\n' + formatProfileContext(profile);
    }

    return data;
  }
}
