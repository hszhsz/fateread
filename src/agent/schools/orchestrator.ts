// ============================================================
// FateRead - Orchestrator (主 Agent 协调器)
// 一主三辅架构的核心：协调子平、紫微、盲派三个子 Agent
// ============================================================

import type { BaziChart, UserProfile } from '../../core/types.js';
import type {
  SchoolAgent,
  SchoolReport,
  AnalysisDimension,
  SynthesizedReport,
  DebateConsensus,
  SchoolAgentOptions,
} from './types.js';
import { SCHOOL_NAMES } from './types.js';
import { ZipingAgent } from './ziping-agent.js';
import { ZiweiAgent } from './ziwei-agent.js';
import { MangpaiAgent } from './mangpai-agent.js';
import { DebateProtocol, type DebateConfig } from './debate.js';

/**
 * 协调器配置
 */
export interface OrchestratorConfig {
  /** 并行调用子 Agent（默认 true） */
  parallel: boolean;
  /** 辩论配置 */
  debate: Partial<DebateConfig>;
  /** 子 Agent LLM 选项 */
  agentOptions: SchoolAgentOptions;
  /** 是否输出详细日志 */
  verbose: boolean;
}

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  parallel: true,
  debate: {},
  agentOptions: {},
  verbose: true,
};

/**
 * FateRead 多流派协调器
 *
 * 架构：一主三辅
 * - 主 Agent（本类）：协调、分派、辩论仲裁、综合输出
 * - 子平八字 Agent：传统格局法分析
 * - 紫微斗数 Agent：星曜宫位分析
 * - 盲派命理 Agent：做功象法分析
 *
 * 工作流程：
 * 1. 排盘完成后，主 Agent 将命盘数据分发给三个子 Agent
 * 2. 三个子 Agent 独立分析（可并行）
 * 3. 主 Agent 对比三份报告，识别分歧维度
 * 4. 对有分歧的维度启动辩论协调
 * 5. 最终综合输出"三派共识"的分析结果
 */
export class Orchestrator {
  private agents: SchoolAgent[];
  private debate: DebateProtocol;
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    // 初始化三个子 Agent
    this.agents = [
      new ZipingAgent(),
      new ZiweiAgent(),
      new MangpaiAgent(),
    ];

    // 初始化辩论协调器
    this.debate = new DebateProtocol(this.config.debate);
  }

  /**
   * 多流派综合分析（核心入口）
   *
   * @param chart - 排盘结果
   * @param profile - 缘主画像
   * @param dimensions - 要分析的维度
   * @returns 综合分析报告（含辩论过程）
   */
  async analyze(
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[] = ['personality', 'career', 'wealth', 'marriage', 'health', 'timing', 'overall'],
  ): Promise<SynthesizedReport> {
    const startTime = Date.now();

    if (this.config.verbose) {
      console.log('\n' + '═'.repeat(60));
      console.log('🎭 FateRead 多流派分析启动');
      console.log('═'.repeat(60));
      console.log(`📊 分析维度: ${dimensions.join(', ')}`);
      console.log(`🏫 参与流派: ${this.agents.map(a => a.name).join('、')}`);
      console.log('─'.repeat(60));
    }

    // === Phase 1: 并行分发给三个子 Agent ===
    if (this.config.verbose) {
      console.log('\n📡 Phase 1: 分发命盘给各流派子 Agent...');
    }

    let reports: SchoolReport[];
    if (this.config.parallel) {
      // 并行调用
      reports = await Promise.all(
        this.agents.map(async (agent) => {
          if (this.config.verbose) {
            console.log(`  🔄 ${agent.name} 正在分析...`);
          }
          const report = await agent.analyze(chart, profile, dimensions, this.config.agentOptions);
          if (this.config.verbose) {
            console.log(`  ✅ ${agent.name} 分析完成（格局: ${report.patternSummary.slice(0, 30)}...）`);
          }
          return report;
        }),
      );
    } else {
      // 串行调用
      reports = [];
      for (const agent of this.agents) {
        if (this.config.verbose) {
          console.log(`  🔄 ${agent.name} 正在分析...`);
        }
        const report = await agent.analyze(chart, profile, dimensions, this.config.agentOptions);
        if (this.config.verbose) {
          console.log(`  ✅ ${agent.name} 分析完成`);
        }
        reports.push(report);
      }
    }

    // === Phase 2: 识别分歧 ===
    if (this.config.verbose) {
      console.log('\n🔍 Phase 2: 对比各流派结论，识别分歧...');
    }

    const disagreedDimensions = this.debate.identifyDisagreements(reports);

    if (this.config.verbose) {
      if (disagreedDimensions.length === 0) {
        console.log('  🤝 三派观点高度一致，无需辩论');
      } else {
        console.log(`  ⚡ 发现 ${disagreedDimensions.length} 个维度存在分歧: ${disagreedDimensions.join(', ')}`);
      }
    }

    // === Phase 3: 辩论协调 ===
    let debates: DebateConsensus[] | undefined;
    if (disagreedDimensions.length > 0) {
      if (this.config.verbose) {
        console.log('\n🏛️  Phase 3: 启动辩论协调...');
      }

      debates = [];
      for (const dim of disagreedDimensions) {
        const consensus = await this.debate.conductDebate(
          dim, reports, this.agents, chart, this.config.agentOptions,
        );
        debates.push(consensus);
      }
    }

    // === Phase 4: 综合输出 ===
    if (this.config.verbose) {
      console.log('\n📝 Phase 4: 综合各流派结论...');
    }

    const synthesized = this.synthesizeReports(reports, debates, dimensions);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (this.config.verbose) {
      console.log('\n' + '═'.repeat(60));
      console.log(`🎭 多流派分析完成 (${elapsed}s)`);
      console.log(`📊 一致率: ${synthesized.meta.agreementRate}%`);
      console.log(`⚡ 辩论维度: ${synthesized.meta.debatedDimensions.length > 0 ? synthesized.meta.debatedDimensions.join(', ') : '无'}`);
      console.log('═'.repeat(60));
    }

    return synthesized;
  }

  /**
   * 综合三份报告为最终结果
   */
  private synthesizeReports(
    reports: SchoolReport[],
    debates: DebateConsensus[] | undefined,
    dimensions: AnalysisDimension[],
  ): SynthesizedReport {
    const debatedDims = debates?.map(d => d.dimension) || [];

    // 综合各维度的最终结论
    const finalDimensions = dimensions.map(dim => {
      // 检查是否有辩论共识
      const debateResult = debates?.find(d => d.dimension === dim);
      if (debateResult) {
        return {
          dimension: dim,
          conclusion: debateResult.consensus,
          confidence: debateResult.confidence,
          reasoning: debateResult.synthesisReasoning,
          keywords: debateResult.contributingSchools.map(s => SCHOOL_NAMES[s]),
        };
      }

      // 无辩论，取三派综合（加权平均）
      const allAnalyses = reports
        .map(r => r.analyses.find(a => a.dimension === dim))
        .filter((a): a is NonNullable<typeof a> => a !== undefined && a.confidence > 0);

      if (allAnalyses.length === 0) {
        return {
          dimension: dim,
          conclusion: '暂无足够数据分析',
          confidence: 0,
          reasoning: '',
          keywords: [] as string[],
        };
      }

      // 选择信心度最高的结论，但综合各派关键词
      const best = allAnalyses.reduce((a, b) => a.confidence > b.confidence ? a : b);
      const allKeywords = [...new Set(allAnalyses.flatMap(a => a.keywords))];

      return {
        dimension: dim,
        conclusion: best.conclusion,
        confidence: Math.round(allAnalyses.reduce((sum, a) => sum + a.confidence, 0) / allAnalyses.length),
        reasoning: best.reasoning,
        advice: best.advice,
        keywords: allKeywords,
      };
    });

    // 计算一致率
    const totalDims = dimensions.length;
    const agreedDims = totalDims - debatedDims.length;
    const agreementRate = totalDims > 0 ? Math.round((agreedDims / totalDims) * 100) : 100;

    // 综合格局总结
    const patternSummaries = reports.map(r => `【${r.schoolName}】${r.patternSummary}`).join('\n');

    // 综合建议
    const allAdvices = finalDimensions
      .map(d => d.advice)
      .filter((a): a is string => !!a);
    const overallAdvice = allAdvices.length > 0
      ? allAdvices.join('；')
      : '命局中平，顺其自然为上。';

    return {
      schoolReports: reports,
      debates,
      finalAnalysis: {
        patternSummary: patternSummaries,
        dimensions: finalDimensions,
        overallAdvice,
      },
      meta: {
        agreementRate,
        debatedDimensions: debatedDims,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * 格式化综合报告为 Markdown（供 LLM 或 CLI 展示）
   */
  formatReport(report: SynthesizedReport): string {
    let md = '# 🎭 多流派综合分析报告\n\n';

    // 元信息
    md += `> 分析时间: ${report.meta.timestamp}\n`;
    md += `> 流派一致率: ${report.meta.agreementRate}%\n`;
    if (report.meta.debatedDimensions.length > 0) {
      md += `> 辩论维度: ${report.meta.debatedDimensions.join(', ')}\n`;
    }
    md += '\n---\n\n';

    // 格局总览
    md += '## 格局总览\n\n';
    md += report.finalAnalysis.patternSummary + '\n\n';

    // 各维度分析
    md += '## 各维度分析\n\n';
    for (const dim of report.finalAnalysis.dimensions) {
      if (dim.confidence === 0) continue;
      const isDebated = report.meta.debatedDimensions.includes(dim.dimension);
      const marker = isDebated ? ' ⚡辩论' : ' ✅共识';
      md += `### ${dim.dimension}${marker}\n\n`;
      md += `**结论**: ${dim.conclusion}\n\n`;
      if (dim.reasoning) {
        md += `**推理**: ${dim.reasoning}\n\n`;
      }
      if (dim.advice) {
        md += `**建议**: ${dim.advice}\n\n`;
      }
      md += `信心度: ${dim.confidence}% | 关键词: ${dim.keywords.join(', ')}\n\n`;
    }

    // 辩论记录
    if (report.debates && report.debates.length > 0) {
      md += '## 辩论记录\n\n';
      for (const debate of report.debates) {
        md += `### ${debate.dimension}\n\n`;
        md += `**共识**: ${debate.consensus}\n\n`;
        md += `**多数派观点**: ${debate.majorityView}\n\n`;
        if (debate.dissent) {
          md += `**少数派保留**: ${debate.dissent}\n\n`;
        }
        md += `**综合推理**: ${debate.synthesisReasoning}\n\n`;
      }
    }

    // 各流派原始摘要
    md += '## 各流派独立分析摘要\n\n';
    for (const schoolReport of report.schoolReports) {
      md += `### ${schoolReport.schoolName}\n\n`;
      md += `**格局**: ${schoolReport.patternSummary}\n\n`;
      if (schoolReport.usefulElements) md += `- 用神: ${schoolReport.usefulElements}\n`;
      if (schoolReport.harmfulElements) md += `- 忌神: ${schoolReport.harmfulElements}\n`;
      if (schoolReport.specialPatterns && schoolReport.specialPatterns.length > 0) {
        md += `- 特殊格局: ${schoolReport.specialPatterns.join('、')}\n`;
      }
      if (schoolReport.overallScore) md += `- 命局评分: ${schoolReport.overallScore}/100\n`;
      md += '\n';
    }

    // 综合建议
    md += '## 综合建议\n\n';
    md += report.finalAnalysis.overallAdvice + '\n';

    return md;
  }

  /**
   * 获取子 Agent 列表
   */
  getAgents(): SchoolAgent[] {
    return this.agents;
  }
}
