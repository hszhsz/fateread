// ============================================================
// FateRead - Debate Protocol (辩论协调机制)
// 当三个流派出现分歧时，主持辩论并达成共识
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

/**
 * 辩论协调器配置
 */
export interface DebateConfig {
  /** 触发辩论的信心度差异阈值（默认30） */
  confidenceThreshold: number;
  /** 触发辩论的结论相似度阈值（0-1，低于此值触发辩论） */
  similarityThreshold: number;
  /** 最大辩论轮次 */
  maxRounds: number;
  /** 是否记录辩论过程 */
  verbose: boolean;
}

const DEFAULT_CONFIG: DebateConfig = {
  confidenceThreshold: 30,
  similarityThreshold: 0.5,
  maxRounds: 2,
  verbose: true,
};

/**
 * 辩论协调器
 *
 * 工作流程：
 * 1. 收集三个流派的独立分析报告
 * 2. 对比各维度的结论，识别分歧点
 * 3. 对有分歧的维度启动辩论
 * 4. 由"裁判 LLM"综合各方观点达成共识
 */
export class DebateProtocol {
  private config: DebateConfig;

  constructor(config: Partial<DebateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 识别需要辩论的维度
   */
  identifyDisagreements(reports: SchoolReport[]): AnalysisDimension[] {
    const disagreedDimensions: AnalysisDimension[] = [];

    // 收集所有维度
    const allDimensions = new Set<AnalysisDimension>();
    for (const report of reports) {
      for (const analysis of report.analyses) {
        allDimensions.add(analysis.dimension);
      }
    }

    // 逐维度检查分歧
    for (const dim of allDimensions) {
      const analyses = reports
        .map(r => r.analyses.find(a => a.dimension === dim))
        .filter((a): a is DimensionAnalysis => a !== undefined && a.confidence > 0);

      if (analyses.length < 2) continue;

      // 检查信心度差异
      const confidences = analyses.map(a => a.confidence);
      const maxConf = Math.max(...confidences);
      const minConf = Math.min(...confidences);
      if (maxConf - minConf > this.config.confidenceThreshold) {
        disagreedDimensions.push(dim);
        continue;
      }

      // 检查结论相似度（简单的关键词重叠法）
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
   * 主持一个维度的辩论
   */
  async conductDebate(
    dimension: AnalysisDimension,
    reports: SchoolReport[],
    agents: SchoolAgent[],
    chart: BaziChart,
    options: SchoolAgentOptions = {},
  ): Promise<DebateConsensus> {
    if (this.config.verbose) {
      console.log(`\n🏛️  开始辩论: ${dimension} 维度`);
    }

    // 第一轮：各流派陈述立场
    const initialStatements: DebateStatement[] = [];
    for (const report of reports) {
      const analysis = report.analyses.find(a => a.dimension === dimension);
      if (analysis && analysis.confidence > 0) {
        initialStatements.push({
          schoolId: report.schoolId,
          dimension,
          position: analysis.conclusion,
          evidence: analysis.reasoning,
        });
      }
    }

    if (this.config.verbose) {
      for (const stmt of initialStatements) {
        console.log(`  📣 ${SCHOOL_NAMES[stmt.schoolId]}：${stmt.position.slice(0, 50)}...`);
      }
    }

    // 第二轮：各流派看到对方观点后辩论
    const debateStatements: DebateStatement[] = [];
    for (let round = 0; round < this.config.maxRounds; round++) {
      if (this.config.verbose) {
        console.log(`  🔄 辩论第 ${round + 1} 轮...`);
      }

      for (const agent of agents) {
        const ownAnalysis = reports
          .find(r => r.schoolId === agent.id)
          ?.analyses.find(a => a.dimension === dimension);

        if (!ownAnalysis || ownAnalysis.confidence === 0) continue;

        const otherPositions = (round === 0 ? initialStatements : debateStatements)
          .filter(s => s.schoolId !== agent.id);

        if (otherPositions.length === 0) continue;

        const statement = await agent.debate(
          dimension, ownAnalysis, otherPositions, chart, options,
        );
        debateStatements.push(statement);
      }
    }

    // 裁判综合各方观点
    const consensus = await this.synthesize(
      dimension, initialStatements, debateStatements, options,
    );

    if (this.config.verbose) {
      console.log(`  ✅ 共识达成: ${consensus.consensus.slice(0, 60)}...`);
      console.log(`  📊 信心度: ${consensus.confidence}%`);
    }

    return consensus;
  }

  /**
   * 裁判 LLM：综合各方观点达成共识
   */
  private async synthesize(
    dimension: AnalysisDimension,
    initial: DebateStatement[],
    debate: DebateStatement[],
    options: SchoolAgentOptions = {},
  ): Promise<DebateConsensus> {
    const client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    });
    const model = options.model || process.env.FATEREAD_JUDGE_MODEL || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';
    const maxTokens = options.maxTokens || Number(process.env.FATEREAD_MAX_TOKENS) || 262144;

    const systemPrompt = `你是一位学贯中西、兼通三派的命理学裁判。你的任务是综合子平八字、紫微斗数、盲派命理三个流派的观点，达成一个公正、全面的共识结论。

你的原则：
1. **尊重每个流派的独特视角**：子平重格局用神、紫微重星曜宫位、盲派重做功取象
2. **多数一致优先**：如果两个以上流派结论类似，倾向于采纳多数意见
3. **少数派保留权**：如果少数派有强有力的命理依据，应予以保留说明
4. **综合创新**：在多派观点基础上，可以提出更全面的综合见解
5. **实事求是**：如果确实无法达成一致，如实说明分歧

请以 JSON 格式回答。`;

    const initialText = initial.map(s =>
      `【${SCHOOL_NAMES[s.schoolId]}初始立场】${s.position}\n依据：${s.evidence}`
    ).join('\n\n');

    const debateText = debate.length > 0 ? debate.map(s => {
      let text = `【${SCHOOL_NAMES[s.schoolId]}辩论发言】立场：${s.position}\n依据：${s.evidence}`;
      if (s.rebuttal) text += `\n反驳：${s.rebuttal}`;
      if (s.concession) text += `\n让步：${s.concession}`;
      return text;
    }).join('\n\n') : '（无辩论发言）';

    const userPrompt = `当前辩论维度：${dimension}

## 各流派初始立场
${initialText}

## 辩论过程
${debateText}

请综合以上观点，以 JSON 格式给出共识：
{
  "consensus": "最终共识结论",
  "majority_view": "多数派观点",
  "dissent": "少数派保留意见（如无则null）",
  "synthesis_reasoning": "综合推理过程（说明为何选择此结论）",
  "confidence": 80,
  "contributing_schools": ["ziping", "ziwei", "mangpai"]
}`;

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

      // DeepSeek 推理模型：content 可能为空，fallback 到 reasoning_content
      const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;
      let content = (message?.content as string) || '';
      if (!content && message?.reasoning_content) {
        content = message.reasoning_content as string;
      }
      return this.parseConsensusResponse(content, dimension, initial);
    } catch (error: unknown) {
      // 裁判失败，使用多数派结论
      return this.fallbackConsensus(dimension, initial);
    }
  }

  /**
   * 清洗 LLM 返回的不规范 JSON
   */
  private sanitizeJson(raw: string): string {
    let s = raw;
    s = s.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
    s = s.replace(/"([^"\\]|\\.)*"/g, (match) =>
      match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
    s = s.replace(/,\s*([}\]])/g, '$1');
    s = s.replace(/"\s*：\s*/g, '": ');
    s = s.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
    return s;
  }

  /**
   * 安全解析 JSON
   */
  private safeJsonParse(content: string): unknown {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const raw = jsonMatch ? jsonMatch[0] : content;
    try {
      return JSON.parse(raw);
    } catch {
      return JSON.parse(this.sanitizeJson(content));
    }
  }

  /**
   * 解析共识响应
   */
  private parseConsensusResponse(
    content: string,
    dimension: AnalysisDimension,
    statements: DebateStatement[],
  ): DebateConsensus {
    try {
      const parsed = this.safeJsonParse(content) as Record<string, unknown>;

      return {
        dimension,
        consensus: (parsed.consensus as string) || '',
        majorityView: (parsed.majority_view as string) || '',
        dissent: parsed.dissent as string | undefined,
        synthesisReasoning: (parsed.synthesis_reasoning as string) || '',
        confidence: (parsed.confidence as number) || 70,
        contributingSchools: (parsed.contributing_schools as SchoolId[]) || statements.map(s => s.schoolId),
      };
    } catch {
      return this.fallbackConsensus(dimension, statements);
    }
  }

  /**
   * 降级共识（裁判失败时）
   */
  private fallbackConsensus(
    dimension: AnalysisDimension,
    statements: DebateStatement[],
  ): DebateConsensus {
    // 简单多数派：取第一个作为共识
    const primary = statements[0];
    return {
      dimension,
      consensus: primary?.position || '各流派意见不一，请综合参考',
      majorityView: primary?.position || '',
      synthesisReasoning: '由于综合判断未能完成，取首要流派（子平八字）结论为主',
      confidence: 50,
      contributingSchools: statements.map(s => s.schoolId),
    };
  }

  /**
   * Jaccard 相似度计算
   */
  private jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
}
