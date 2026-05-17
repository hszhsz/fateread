// ============================================================
// FateRead - Debate Protocol (辩论协调机制)
// Optimized: single-round debate, shared JSON parsing, client reuse
// ============================================================

import OpenAI from 'openai';
import type { BaziChart } from '../../core/types.js';
import type {
  SchoolId,
  SchoolReport,
  SchoolAgent,
  AnalysisDimension,
  DimensionAnalysis,
  DebateStatement,
  DebateConsensus,
  SchoolAgentOptions,
} from './types.js';
import { SCHOOL_NAMES } from './types.js';
import { safeJsonParse } from '../../shared/json-utils.js';
import { createLlmClient, extractContent } from '../../shared/llm-client.js';
import type { TokenTracker } from '../../shared/llm-client.js';
import { recordUsage } from '../../shared/llm-client.js';

export interface DebateConfig {
  confidenceThreshold: number;
  similarityThreshold: number;
  maxRounds: number;
  verbose: boolean;
  /** 进度回调，用于 TUI 实时显示辩论过程 */
  onProgress?: (message: string) => void;
}

const DEFAULT_CONFIG: DebateConfig = {
  confidenceThreshold: 30,
  similarityThreshold: 0.5,
  maxRounds: 1, // Optimized: single round is usually sufficient
  verbose: true,
};

export class DebateProtocol {
  private config: DebateConfig;
  private sharedClient?: OpenAI;
  tokenTracker?: TokenTracker;

  constructor(config: Partial<DebateConfig> = {}, sharedClient?: OpenAI) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sharedClient = sharedClient;
    if (config.onProgress) {
      this.config.onProgress = config.onProgress;
    }
  }

  identifyDisagreements(reports: SchoolReport[]): AnalysisDimension[] {
    const disagreedDimensions: AnalysisDimension[] = [];

    const allDimensions = new Set<AnalysisDimension>();
    for (const report of reports) {
      for (const analysis of report.analyses) {
        allDimensions.add(analysis.dimension);
      }
    }

    for (const dim of allDimensions) {
      const analyses = reports
        .map(r => r.analyses.find(a => a.dimension === dim))
        .filter((a): a is DimensionAnalysis => a !== undefined && a.confidence > 0);

      if (analyses.length < 2) continue;

      // Confidence gap check
      const confidences = analyses.map(a => a.confidence);
      const maxConf = Math.max(...confidences);
      const minConf = Math.min(...confidences);
      if (maxConf - minConf > this.config.confidenceThreshold) {
        disagreedDimensions.push(dim);
        continue;
      }

      // Keyword overlap check
      const keywordSets = analyses.map(a => new Set(a.keywords));
      let minSimilarity = 1;
      for (let i = 0; i < keywordSets.length; i++) {
        for (let j = i + 1; j < keywordSets.length; j++) {
          const sim = this.jaccardSimilarity(keywordSets[i], keywordSets[j]);
          minSimilarity = Math.min(minSimilarity, sim);
        }
      }
      if (minSimilarity < this.config.similarityThreshold) {
        disagreedDimensions.push(dim);
      }
    }

    return disagreedDimensions;
  }

  /**
   * Conduct debate for ALL disputed dimensions with a single batch judge call.
   * Optimized: single debate round, single judge synthesis for all dimensions.
   */
  async conductAllDebates(
    dimensions: AnalysisDimension[],
    reports: SchoolReport[],
    agents: SchoolAgent[],
    chart: BaziChart,
    options: SchoolAgentOptions = {},
  ): Promise<DebateConsensus[]> {
    if (dimensions.length === 0) return [];

    const progress = (msg: string) => {
      if (this.config.onProgress) this.config.onProgress(msg);
      if (this.config.verbose) console.log(msg);
    };

    const allInitialStatements: Map<AnalysisDimension, DebateStatement[]> = new Map();

    // Single round: collect all statements for all dimensions
    for (const dim of dimensions) {
      progress(`\n🏛️  开始辩论: ${dim} 维度`);

      const statements: DebateStatement[] = [];
      for (const report of reports) {
        const analysis = report.analyses.find(a => a.dimension === dim);
        if (analysis && analysis.confidence > 0) {
          statements.push({
            schoolId: report.schoolId,
            dimension: dim,
            position: analysis.conclusion,
            evidence: analysis.reasoning,
          });
        }
      }
      allInitialStatements.set(dim, statements);

      for (const stmt of statements) {
        progress(`  📣 ${SCHOOL_NAMES[stmt.schoolId]}：${stmt.position.slice(0, 50)}...`);
      }
    }

    // Single round of counter-arguments
    for (const dim of dimensions) {
      progress(`  🔄 辩论 (单轮)...`);

      const initialStatements = allInitialStatements.get(dim) || [];

      for (const agent of agents) {
        const ownAnalysis = reports
          .find(r => r.schoolId === agent.id)
          ?.analyses.find(a => a.dimension === dim);

        if (!ownAnalysis || ownAnalysis.confidence === 0) continue;

        const otherPositions = initialStatements.filter(s => s.schoolId !== agent.id);
        if (otherPositions.length === 0) continue;

        const statement = await agent.debate(dim, ownAnalysis, otherPositions, chart, options);
        // Append to statements
        const dimStatements = allInitialStatements.get(dim) || [];
        dimStatements.push({ ...statement, dimension: dim });
        allInitialStatements.set(dim, dimStatements);
      }
    }

    // Batch judge: one LLM call for all dimensions
    const allConsensuses = await this.batchSynthesize(dimensions, allInitialStatements, options);

    for (const c of allConsensuses) {
      progress(`  ✅ ${c.dimension}: ${c.consensus.slice(0, 60)}... (信心度: ${c.confidence}%)`);
    }

    return allConsensuses;
  }

  // Keep the single-dimension method for backward compat
  async conductDebate(
    dimension: AnalysisDimension,
    reports: SchoolReport[],
    agents: SchoolAgent[],
    chart: BaziChart,
    options: SchoolAgentOptions = {},
  ): Promise<DebateConsensus> {
    const results = await this.conductAllDebates([dimension], reports, agents, chart, options);
    return results[0];
  }

  /**
   * Batch synthesize all disputed dimensions in a single LLM call.
   */
  private async batchSynthesize(
    dimensions: AnalysisDimension[],
    allStatements: Map<AnalysisDimension, DebateStatement[]>,
    options: SchoolAgentOptions = {},
  ): Promise<DebateConsensus[]> {
    const client = this.sharedClient || createLlmClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    const model = options.model || process.env.FATEREAD_JUDGE_MODEL || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';
    const maxTokens = options.maxTokens || Number(process.env.FATEREAD_MAX_TOKENS) || 262144;

    const systemPrompt = `你是一位学贯中西、兼通三派的命理学裁判。综合子平八字、紫微斗数、盲派命理三个流派观点，达成公正全面共识。

原则：
1. 尊重每个流派的独特视角
2. 多数一致优先
3. 少数派保留权
4. 综合创新
5. 实事求是

请对每个维度以 JSON 数组格式回答。`;

    let dimensionsText = '';
    for (const dim of dimensions) {
      const statements = allStatements.get(dim) || [];
      const statementsText = statements.map(s => {
        let text = `【${SCHOOL_NAMES[s.schoolId]}】立场：${s.position}\n依据：${s.evidence}`;
        if (s.rebuttal) text += `\n反驳：${s.rebuttal}`;
        if (s.concession) text += `\n让步：${s.concession}`;
        return text;
      }).join('\n\n');

      dimensionsText += `### ${dim}\n${statementsText}\n\n`;
    }

    const userPrompt = `请对以下维度进行综合裁决：

${dimensionsText}

请以 JSON 数组格式回答（一个元素对应一个维度）：
[
  {
    "dimension": "维度名",
    "consensus": "最终共识结论",
    "majority_view": "多数派观点",
    "dissent": "少数派保留意见（如无则null）",
    "synthesis_reasoning": "综合推理过程",
    "confidence": 80,
    "contributing_schools": ["ziping", "ziwei", "mangpai"]
  }
]`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      });

      if (this.tokenTracker && response.usage) {
        recordUsage(this.tokenTracker, model, {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;
      const content = extractContent(message);
      return this.parseBatchConsensus(content, dimensions, allStatements);
    } catch {
      // Fallback: majority vote per dimension
      return dimensions.map(dim => this.fallbackConsensus(dim, allStatements.get(dim) || []));
    }
  }

  private parseBatchConsensus(
    content: string,
    dimensions: AnalysisDimension[],
    allStatements: Map<AnalysisDimension, DebateStatement[]>,
  ): DebateConsensus[] {
    // Try parsing as array first
    const parsed = safeJsonParse<unknown[]>(content);

    if (Array.isArray(parsed)) {
      return dimensions.map(dim => {
        const found = parsed.find((item: unknown) =>
          item && typeof item === 'object' && (item as Record<string, unknown>).dimension === dim
        ) as Record<string, unknown> | undefined;

        if (found) {
          return {
            dimension: dim,
            consensus: (found.consensus as string) || '',
            majorityView: (found.majority_view as string) || '',
            dissent: found.dissent as string | undefined,
            synthesisReasoning: (found.synthesis_reasoning as string) || '',
            confidence: (found.confidence as number) || 70,
            contributingSchools: (found.contributing_schools as SchoolId[]) ||
              (allStatements.get(dim) || []).map(s => s.schoolId),
          };
        }
        return this.fallbackConsensus(dim, allStatements.get(dim) || []);
      });
    }

    // If array parse failed, try as single object (fallback for old format)
    const singleParsed = safeJsonParse<Record<string, unknown>>(content);
    if (singleParsed && singleParsed.consensus && dimensions.length === 1) {
      return [{
        dimension: dimensions[0],
        consensus: (singleParsed.consensus as string) || '',
        majorityView: (singleParsed.majority_view as string) || '',
        dissent: singleParsed.dissent as string | undefined,
        synthesisReasoning: (singleParsed.synthesis_reasoning as string) || '',
        confidence: (singleParsed.confidence as number) || 70,
        contributingSchools: (singleParsed.contributing_schools as SchoolId[]) ||
          (allStatements.get(dimensions[0]) || []).map(s => s.schoolId),
      }];
    }

    return dimensions.map(dim => this.fallbackConsensus(dim, allStatements.get(dim) || []));
  }

  private fallbackConsensus(dimension: AnalysisDimension, statements: DebateStatement[]): DebateConsensus {
    const primary = statements[0];
    return {
      dimension,
      consensus: primary?.position || '各流派意见不一',
      majorityView: primary?.position || '',
      synthesisReasoning: '综合判断未能完成，取首要流派结论为主',
      confidence: 50,
      contributingSchools: statements.map(s => s.schoolId),
    };
  }

  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
}
