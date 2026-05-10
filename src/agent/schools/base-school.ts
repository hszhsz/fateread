// ============================================================
// FateRead - Base School Agent (流派子 Agent 基类)
// Uses shared json-utils, llm-client; optional shared client injection
// ============================================================

import OpenAI from 'openai';
import type { BaziChart, UserProfile } from '../../core/types.js';
import { formatProfileContext } from '../tools.js';
import type {
  SchoolId,
  SchoolAgent,
  SchoolReport,
  DimensionAnalysis,
  AnalysisDimension,
  DebateStatement,
  SchoolAgentOptions,
} from './types.js';
import { SCHOOL_NAMES } from './types.js';
import { safeJsonParse } from '../../shared/json-utils.js';
import { createLlmClient, resolveModel, resolveMaxTokens, extractContent } from '../../shared/llm-client.js';
import type { TokenTracker } from '../../shared/llm-client.js';
import { recordUsage } from '../../shared/llm-client.js';

/**
 * Sub-agent base class.
 * Each school inherits and implements:
 *   - getSystemPrompt()    → school methodology prompt
 *   - formatChartData()    → chart data in school-specific format
 *   - getDebatePrompt()    → debate system prompt (optional override)
 */
export abstract class BaseSchoolAgent implements SchoolAgent {
  readonly id: SchoolId;
  readonly name: string;
  /** Shared client (injected by orchestrator for reuse) */
  sharedClient?: OpenAI;
  tokenTracker?: TokenTracker;

  constructor(id: SchoolId) {
    this.id = id;
    this.name = SCHOOL_NAMES[id];
  }

  protected abstract getSystemPrompt(): string;
  protected abstract formatChartData(chart: BaziChart, profile: UserProfile | null): string;

  protected getDebateSystemPrompt(): string {
    return `你是${this.name}流派的命理专家，正在与其他流派进行学术辩论。
基于${this.name}的理论体系，对争议维度给出立场、依据和论证。
坚持${this.name}的核心理论，也承认其他流派的合理之处。
用具体的命理依据支撑论点。如认同对方观点，可适当让步。
请以 JSON 格式回答。`;
  }

  /** Get or create an OpenAI client */
  private getClient(options: SchoolAgentOptions = {}): OpenAI {
    return this.sharedClient || createLlmClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  }

  private getModel(options: SchoolAgentOptions = {}): string {
    return options.model || process.env.FATEREAD_SCHOOL_MODEL || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';
  }

  private getMaxTokens(options: SchoolAgentOptions = {}): number {
    return options.maxTokens || Number(process.env.FATEREAD_MAX_TOKENS) || 262144;
  }

  /**
   * Analyze a chart from this school's perspective.
   */
  async analyze(
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[],
    options: SchoolAgentOptions = {},
  ): Promise<SchoolReport> {
    const client = this.getClient(options);
    const model = this.getModel(options);
    const maxTokens = this.getMaxTokens(options);
    const chartData = this.formatChartData(chart, profile);
    const systemPrompt = this.getSystemPrompt();

    const dimensionList = dimensions.map(d => `"${d}"`).join(', ');
    const userPrompt = `以下是缘主的命盘数据和纬线信息，请从${this.name}的视角进行分析。

${chartData}

请分析以下维度：${dimensionList}

请以严格的 JSON 格式回答，不要有任何其他文字：
{
  "pattern_summary": "格局总结（一句话）",
  "useful_elements": "用神（如适用）",
  "harmful_elements": "忌神（如适用）",
  "special_patterns": ["特殊格局/星曜（如适用）"],
  "overall_score": 75,
  "analyses": [
    {
      "dimension": "维度名",
      "conclusion": "核心结论（一句话）",
      "confidence": 80,
      "reasoning": "推理过程（引用具体命理依据，200字以内）",
      "advice": "建议",
      "keywords": ["关键词1", "关键词2"]
    }
  ],
  "raw_reasoning": "完整推理过程（500字以内）"
}`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
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
      return this.parseAnalysisResponse(content, dimensions);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`⚠️  ${this.name}分析失败: ${msg}`);
      return this.createFallbackReport(dimensions, msg);
    }
  }

  /**
   * Participate in debate for a specific dimension.
   */
  async debate(
    dimension: AnalysisDimension,
    ownAnalysis: DimensionAnalysis,
    otherPositions: DebateStatement[],
    chart: BaziChart,
    options: SchoolAgentOptions = {},
  ): Promise<DebateStatement> {
    const client = this.getClient(options);
    const model = this.getModel(options);
    const maxTokens = this.getMaxTokens(options);

    const othersText = otherPositions.map(p =>
      `【${SCHOOL_NAMES[p.schoolId]}】立场：${p.position}\n依据：${p.evidence}`
    ).join('\n\n');

    const userPrompt = `当前辩论维度：${dimension}

你（${this.name}）的初始分析：
- 结论：${ownAnalysis.conclusion}
- 依据：${ownAnalysis.reasoning}
- 信心度：${ownAnalysis.confidence}

其他流派的立场：
${othersText}

请基于${this.name}的理论体系回应，以 JSON 格式：
{
  "position": "你的最终立场",
  "evidence": "命理依据",
  "rebuttal": "对其他流派的反驳（如有）",
  "concession": "认同其他流派的部分（如有）"
}`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getDebateSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
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
      return this.parseDebateResponse(content, dimension);
    } catch {
      return {
        schoolId: this.id,
        dimension,
        position: ownAnalysis.conclusion,
        evidence: ownAnalysis.reasoning,
      };
    }
  }

  // ============================================================
  // Response Parsers (using shared safeJsonParse)
  // ============================================================

  private parseAnalysisResponse(content: string, dimensions: AnalysisDimension[]): SchoolReport {
    const parsed = safeJsonParse<Record<string, unknown>>(content);

    if (parsed && parsed.analyses) {
      const analyses: DimensionAnalysis[] = ((parsed.analyses as Record<string, unknown>[]) || []).map((a: Record<string, unknown>) => ({
        dimension: a.dimension as AnalysisDimension,
        conclusion: (a.conclusion as string) || '',
        confidence: (a.confidence as number) || 70,
        reasoning: (a.reasoning as string) || '',
        advice: a.advice as string | undefined,
        keywords: (a.keywords as string[]) || [],
      }));

      return {
        schoolId: this.id,
        schoolName: this.name,
        timestamp: new Date().toISOString(),
        patternSummary: (parsed.pattern_summary as string) || '',
        analyses,
        usefulElements: parsed.useful_elements as string | undefined,
        harmfulElements: parsed.harmful_elements as string | undefined,
        specialPatterns: parsed.special_patterns as string[] | undefined,
        overallScore: parsed.overall_score as number | undefined,
        rawReasoning: parsed.raw_reasoning as string | undefined,
      };
    }

    console.error(`⚠️  ${this.name}响应解析失败，使用原始文本`);
    return this.createFallbackReport(dimensions, content);
  }

  private parseDebateResponse(content: string, dimension: AnalysisDimension): DebateStatement {
    const parsed = safeJsonParse<Record<string, unknown>>(content);

    if (parsed && parsed.position) {
      return {
        schoolId: this.id,
        dimension,
        position: (parsed.position as string) || '',
        evidence: (parsed.evidence as string) || '',
        rebuttal: parsed.rebuttal as string | undefined,
        concession: parsed.concession as string | undefined,
      };
    }

    return {
      schoolId: this.id,
      dimension,
      position: content.slice(0, 200),
      evidence: '（解析失败，原始文本）',
    };
  }

  private createFallbackReport(dimensions: AnalysisDimension[], reason: string): SchoolReport {
    return {
      schoolId: this.id,
      schoolName: this.name,
      timestamp: new Date().toISOString(),
      patternSummary: `${this.name}分析未能完成: ${reason}`,
      analyses: dimensions.map(d => ({
        dimension: d,
        conclusion: '分析未能完成',
        confidence: 0,
        reasoning: reason,
        keywords: [],
      })),
    };
  }
}
