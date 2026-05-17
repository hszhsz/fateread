// ============================================================
// FateRead - Orchestrator (主 Agent 协调器)
// Optimized: shared client, batch debate, token tracking
// ============================================================

import OpenAI from 'openai';
import type { BaziChart, UserProfile } from '../../core/types.js';
import type {
  SchoolId,
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
import { DebateProtocol } from './debate.js';
import type { DebateConfig } from './debate.js';
import { createLlmClient } from '../../shared/llm-client.js';
import type { TokenTracker } from '../../shared/llm-client.js';

export interface OrchestratorConfig {
  parallel: boolean;
  debate: Partial<DebateConfig>;
  agentOptions: SchoolAgentOptions;
  verbose: boolean;
  /** 进度回调，用于 TUI 实时显示分析过程 */
  onProgress?: (message: string) => void;
}

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  parallel: true,
  debate: {},
  agentOptions: {},
  verbose: true,
};

export class Orchestrator {
  private agents: SchoolAgent[];
  private debate: DebateProtocol;
  private config: OrchestratorConfig;
  private sharedClient: OpenAI;
  tokenTracker?: TokenTracker;

  constructor(config: Partial<OrchestratorConfig> = {}, tokenTracker?: TokenTracker) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.tokenTracker = tokenTracker;

    // Create a single shared OpenAI client
    this.sharedClient = createLlmClient({
      apiKey: this.config.agentOptions.apiKey,
      baseUrl: this.config.agentOptions.baseUrl,
    });

    // Initialize sub-agents with shared client
    const ziping = new ZipingAgent();
    const ziwei = new ZiweiAgent();
    const mangpai = new MangpaiAgent();

    // Inject shared client, token tracker and progress callback into sub-agents
    for (const agent of [ziping, ziwei, mangpai]) {
      agent.sharedClient = this.sharedClient;
      agent.tokenTracker = this.tokenTracker;
      agent.onProgress = this.config.onProgress;
    }

    this.agents = [ziping, ziwei, mangpai];

    // Initialize debate with shared client and progress callback
    this.debate = new DebateProtocol(
      { ...this.config.debate, onProgress: this.config.onProgress },
      this.sharedClient,
    );
    this.debate.tokenTracker = this.tokenTracker;
  }

  async analyze(
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[] = ['personality', 'career', 'wealth', 'marriage', 'health', 'timing', 'overall'],
  ): Promise<SynthesizedReport> {
    const startTime = Date.now();
    const progress = (msg: string) => {
      if (this.config.onProgress) this.config.onProgress(msg);
      if (this.config.verbose) console.log(msg);
    };

    progress('\n' + '═'.repeat(60));
    progress('🎭 FateRead 多流派分析启动');
    progress('═'.repeat(60));
    progress(`📊 分析维度: ${dimensions.join(', ')}`);
    progress(`🏫 参与流派: ${this.agents.map(a => a.name).join('、')}`);
    progress('─'.repeat(60));

    // Phase 1: Parallel dispatch to sub-agents
    progress('\n📡 Phase 1: 分发命盘给各流派子 Agent...');

    let reports: SchoolReport[];
    if (this.config.parallel) {
      reports = await Promise.all(
        this.agents.map(async (agent) => {
          progress(`  🔄 ${agent.name} 正在分析...`);
          const report = await agent.analyze(chart, profile, dimensions, this.config.agentOptions);
          progress(`  ✅ ${agent.name} 分析完成（格局: ${report.patternSummary.slice(0, 30)}...）`);
          return report;
        }),
      );
    } else {
      reports = [];
      for (const agent of this.agents) {
        progress(`  🔄 ${agent.name} 正在分析...`);
        const report = await agent.analyze(chart, profile, dimensions, this.config.agentOptions);
        progress(`  ✅ ${agent.name} 分析完成（格局: ${report.patternSummary.slice(0, 30)}...）`);
        reports.push(report);
      }
    }

    // Phase 2: Identify disagreements
    progress('\n🔍 Phase 2: 对比各流派结论，识别分歧...');

    const disagreedDimensions = this.debate.identifyDisagreements(reports);

    if (disagreedDimensions.length === 0) {
      progress('  🤝 三派观点高度一致，无需辩论');
    } else {
      progress(`  ⚡ 发现 ${disagreedDimensions.length} 个维度存在分歧: ${disagreedDimensions.join(', ')}`);
    }

    // Phase 3: Batch debate for all disputed dimensions (single judge call)
    let debates: DebateConsensus[] | undefined;
    if (disagreedDimensions.length > 0) {
      progress('\n🏛️  Phase 3: 启动辩论协调 (批量裁判)...');

      debates = await this.debate.conductAllDebates(
        disagreedDimensions, reports, this.agents, chart, this.config.agentOptions,
      );
    }

    // Phase 4: Synthesize
    progress('\n📝 Phase 4: 综合各流派结论...');

    const synthesized = this.synthesizeReports(reports, debates, dimensions);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    progress('\n' + '═'.repeat(60));
    progress(`🎭 多流派分析完成 (${elapsed}s)`);
    progress(`📊 一致率: ${synthesized.meta.agreementRate}%`);
    if (synthesized.meta.debatedDimensions.length > 0) {
      progress(`⚡ 辩论维度: ${synthesized.meta.debatedDimensions.join(', ')}`);
    } else {
      progress('⚡ 辩论维度: 无');
    }
    progress('═'.repeat(60));

    return synthesized;
  }

  private synthesizeReports(
    reports: SchoolReport[],
    debates: DebateConsensus[] | undefined,
    dimensions: AnalysisDimension[],
  ): SynthesizedReport {
    const debatedDims = debates?.map(d => d.dimension) || [];

    const finalDimensions = dimensions.map(dim => {
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

      const allAnalyses = reports
        .map(r => r.analyses.find(a => a.dimension === dim))
        .filter((a): a is NonNullable<typeof a> => a !== undefined && a.confidence > 0);

      if (allAnalyses.length === 0) {
        return { dimension: dim, conclusion: '暂无足够数据分析', confidence: 0, reasoning: '', keywords: [] as string[] };
      }

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

    const totalDims = dimensions.length;
    const agreedDims = totalDims - debatedDims.length;
    const agreementRate = totalDims > 0 ? Math.round((agreedDims / totalDims) * 100) : 100;

    const patternSummaries = reports.map(r => `【${r.schoolName}】${r.patternSummary}`).join('\n');

    const allAdvices = finalDimensions.map(d => d.advice).filter((a): a is string => !!a);
    const overallAdvice = allAdvices.length > 0 ? allAdvices.join('；') : '命局中平，顺其自然为上。';

    return {
      schoolReports: reports,
      debates,
      finalAnalysis: { patternSummary: patternSummaries, dimensions: finalDimensions, overallAdvice },
      meta: { agreementRate, debatedDimensions: debatedDims, timestamp: new Date().toISOString() },
    };
  }

  formatReport(report: SynthesizedReport): string {
    let md = '# 🎭 多流派综合分析报告\n\n';
    md += `> 分析时间: ${report.meta.timestamp}\n`;
    md += `> 流派一致率: ${report.meta.agreementRate}%\n`;
    if (report.meta.debatedDimensions.length > 0) {
      md += `> 辩论维度: ${report.meta.debatedDimensions.join(', ')}\n`;
    }
    md += '\n---\n\n';

    md += '## 格局总览\n\n' + report.finalAnalysis.patternSummary + '\n\n';

    md += '## 各维度分析\n\n';
    for (const dim of report.finalAnalysis.dimensions) {
      if (dim.confidence === 0) continue;
      const isDebated = report.meta.debatedDimensions.includes(dim.dimension);
      const marker = isDebated ? ' ⚡辩论' : ' ✅共识';
      md += `### ${dim.dimension}${marker}\n\n`;
      md += `**结论**: ${dim.conclusion}\n\n`;
      if (dim.reasoning) md += `**推理**: ${dim.reasoning}\n\n`;
      if (dim.advice) md += `**建议**: ${dim.advice}\n\n`;
      md += `信心度: ${dim.confidence}% | 关键词: ${dim.keywords.join(', ')}\n\n`;
    }

    if (report.debates && report.debates.length > 0) {
      md += '## 辩论记录\n\n';
      for (const debate of report.debates) {
        md += `### ${debate.dimension}\n\n`;
        md += `**共识**: ${debate.consensus}\n\n`;
        md += `**多数派观点**: ${debate.majorityView}\n\n`;
        if (debate.dissent) md += `**少数派保留**: ${debate.dissent}\n\n`;
        md += `**综合推理**: ${debate.synthesisReasoning}\n\n`;
      }
    }

    md += '## 各流派独立分析摘要\n\n';
    for (const schoolReport of report.schoolReports) {
      md += `### ${schoolReport.schoolName}\n\n`;
      md += `**格局**: ${schoolReport.patternSummary}\n\n`;
      if (schoolReport.usefulElements) md += `- 用神: ${schoolReport.usefulElements}\n`;
      if (schoolReport.harmfulElements) md += `- 忌神: ${schoolReport.harmfulElements}\n`;
      if (schoolReport.specialPatterns?.length) {
        md += `- 特殊格局: ${schoolReport.specialPatterns.join('、')}\n`;
      }
      if (schoolReport.overallScore) md += `- 命局评分: ${schoolReport.overallScore}/100\n`;
      md += '\n';
    }

    md += '## 综合建议\n\n' + report.finalAnalysis.overallAdvice + '\n';
    return md;
  }

  getAgents(): SchoolAgent[] {
    return this.agents;
  }

  getAgent(schoolId: SchoolId): SchoolAgent | undefined {
    return this.agents.find(a => a.id === schoolId);
  }

  /**
   * Single-school analysis — only runs one selected school, no debate.
   */
  async analyzeSingle(
    schoolId: SchoolId,
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[] = ['personality', 'career', 'wealth', 'marriage', 'health', 'timing', 'overall'],
  ): Promise<SynthesizedReport> {
    const agent = this.getAgent(schoolId);
    if (!agent) throw new Error(`未知流派: ${schoolId}`);

    const startTime = Date.now();
    const progress = (msg: string) => {
      if (this.config.onProgress) this.config.onProgress(msg);
      if (this.config.verbose) console.log(msg);
    };

    progress('\n' + '═'.repeat(60));
    progress(`🔮 FateRead 单流派分析 — ${agent.name}`);
    progress('═'.repeat(60));
    progress(`📊 分析维度: ${dimensions.join(', ')}`);

    const report = await agent.analyze(chart, profile, dimensions, this.config.agentOptions);

    progress(`  ✅ ${agent.name} 分析完成（格局: ${report.patternSummary.slice(0, 30)}...）`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const synthesized: SynthesizedReport = {
      schoolReports: [report],
      finalAnalysis: {
        patternSummary: `【${report.schoolName}】${report.patternSummary}`,
        dimensions: report.analyses.map(a => ({
          dimension: a.dimension,
          conclusion: a.conclusion,
          confidence: a.confidence,
          reasoning: a.reasoning,
          advice: a.advice,
          keywords: a.keywords,
        })),
        overallAdvice: report.analyses
          .map(a => a.advice)
          .filter((a): a is string => !!a)
          .join('；') || '命局中平，顺其自然为上。',
      },
      meta: {
        agreementRate: 100,
        debatedDimensions: [],
        timestamp: new Date().toISOString(),
      },
    };

    progress('\n' + '═'.repeat(60));
    progress(`🔮 单流派分析完成 (${elapsed}s) — ${agent.name}`);
    progress('═'.repeat(60));

    return synthesized;
  }

  formatSingleSchoolReport(report: SynthesizedReport): string {
    const schoolReport = report.schoolReports[0];
    let md = `# 🔮 ${schoolReport.schoolName} 命盘分析报告\n\n`;
    md += `> 分析时间: ${report.meta.timestamp}\n\n`;
    md += '---\n\n';

    md += '## 格局总览\n\n' + report.finalAnalysis.patternSummary + '\n\n';

    if (schoolReport.usefulElements) {
      md += `- 用神: ${schoolReport.usefulElements}\n`;
    }
    if (schoolReport.harmfulElements) {
      md += `- 忌神: ${schoolReport.harmfulElements}\n`;
    }
    if (schoolReport.specialPatterns?.length) {
      md += `- 特殊格局: ${schoolReport.specialPatterns.join('、')}\n`;
    }
    if (schoolReport.overallScore) {
      md += `- 命局评分: ${schoolReport.overallScore}/100\n`;
    }
    md += '\n';

    md += '## 各维度分析\n\n';
    for (const dim of report.finalAnalysis.dimensions) {
      if (dim.confidence === 0) continue;
      md += `### ${dim.dimension}\n\n`;
      md += `**结论**: ${dim.conclusion}\n\n`;
      if (dim.reasoning) md += `**推理**: ${dim.reasoning}\n\n`;
      if (dim.advice) md += `**建议**: ${dim.advice}\n\n`;
      md += `信心度: ${dim.confidence}% | 关键词: ${dim.keywords.join(', ')}\n\n`;
    }

    md += '## 综合建议\n\n' + report.finalAnalysis.overallAdvice + '\n';
    return md;
  }
}
