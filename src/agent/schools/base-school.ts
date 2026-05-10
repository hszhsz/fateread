// ============================================================
// FateRead - Base School Agent (流派子 Agent 基类)
// 封装 LLM 调用和通用逻辑，各流派只需提供 Prompt 和方法论
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

/**
 * 子 Agent 基类
 * 各流派继承此类，只需实现:
 *   - getSystemPrompt()     → 流派方法论 prompt
 *   - formatChartData()     → 将通用命盘转为流派视角数据
 *   - getDebatePrompt()     → 辩论时的系统 prompt
 */
export abstract class BaseSchoolAgent implements SchoolAgent {
  readonly id: SchoolId;
  readonly name: string;

  constructor(id: SchoolId) {
    this.id = id;
    this.name = SCHOOL_NAMES[id];
  }

  /**
   * 子类实现：返回该流派的系统 Prompt（方法论）
   */
  protected abstract getSystemPrompt(): string;

  /**
   * 子类实现：将通用 BaziChart 转为该流派视角的文本数据
   */
  protected abstract formatChartData(chart: BaziChart, profile: UserProfile | null): string;

  /**
   * 子类实现（可选）：辩论时的系统 Prompt
   */
  protected getDebateSystemPrompt(): string {
    return `你是${this.name}流派的命理专家，正在与其他流派进行学术辩论。
请基于${this.name}的理论体系，对争议维度给出你的立场、依据和论证。
你应该：
1. 坚持${this.name}的核心理论，但也承认其他流派的合理之处
2. 用具体的命理依据（干支、星曜、格局）支撑论点
3. 如果确实认同对方观点，可以做出适当让步
请以 JSON 格式回答。`;
  }

  /**
   * 创建 LLM 客户端
   */
  private createClient(options: SchoolAgentOptions = {}): { client: OpenAI; model: string } {
    const client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
    });
    const model = options.model || process.env.FATEREAD_SCHOOL_MODEL || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';
    return { client, model };
  }

  /**
   * 分析命盘
   */
  async analyze(
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[],
    options: SchoolAgentOptions = {},
  ): Promise<SchoolReport> {
    const { client, model } = this.createClient(options);
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
        max_tokens: 262144, // 推理模型需要更多 token（reasoning + output），最小 256k
      });

      // DeepSeek 推理模型：content 可能为空，fallback 到 reasoning_content
      const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;
      let content = (message?.content as string) || '';
      if (!content && message?.reasoning_content) {
        content = message.reasoning_content as string;
      }
      return this.parseAnalysisResponse(content, dimensions);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`⚠️  ${this.name}分析失败: ${msg}`);
      return this.createFallbackReport(dimensions, msg);
    }
  }

  /**
   * 参与辩论
   */
  async debate(
    dimension: AnalysisDimension,
    ownAnalysis: DimensionAnalysis,
    otherPositions: DebateStatement[],
    chart: BaziChart,
    options: SchoolAgentOptions = {},
  ): Promise<DebateStatement> {
    const { client, model } = this.createClient(options);

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
        max_tokens: 262144,
      });

      // DeepSeek 推理模型：content 可能为空，fallback 到 reasoning_content
      const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;
      let content = (message?.content as string) || '';
      if (!content && message?.reasoning_content) {
        content = message.reasoning_content as string;
      }
      return this.parseDebateResponse(content, dimension);
    } catch (error: unknown) {
      // 辩论失败，返回原始立场
      return {
        schoolId: this.id,
        dimension,
        position: ownAnalysis.conclusion,
        evidence: ownAnalysis.reasoning,
      };
    }
  }

  /**
   * 清洗 LLM 返回的不规范 JSON 文本
   * 处理常见问题：trailing comma、raw newlines、中文标点等
   */
  private sanitizeJson(raw: string): string {
    let s = raw;

    // 1. 去除 markdown 代码块标记
    s = s.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');

    // 2. 提取 JSON 对象
    const jsonMatch = s.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      s = jsonMatch[0];
    }

    // 3. 将字符串值内的 raw newline 替换为 \\n
    //    策略：在引号内的实际换行替换为转义换行
    s = s.replace(/"([^"\\]|\\.)*"/g, (match) => {
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    // 4. 移除 trailing commas: ,] 或 ,}
    s = s.replace(/,\s*([}\]])/g, '$1');

    // 5. 中文冒号 → 英文冒号（仅在引号外）
    s = s.replace(/"\s*：\s*/g, '": ');

    // 6. 中文引号 → 英文引号
    s = s.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
    s = s.replace(/\u2018/g, "'").replace(/\u2019/g, "'");

    return s;
  }

  /**
   * 安全解析 JSON，先尝试直接解析，失败后清洗再试
   */
  private safeJsonParse(content: string): unknown {
    // 第一次：直接提取 JSON 解析
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const raw = jsonMatch ? jsonMatch[0] : content;
    try {
      return JSON.parse(raw);
    } catch {
      // 第二次：清洗后重试
      const sanitized = this.sanitizeJson(content);
      return JSON.parse(sanitized);
    }
  }

  /**
   * 解析分析响应
   */
  private parseAnalysisResponse(content: string, dimensions: AnalysisDimension[]): SchoolReport {
    try {
      const parsed = this.safeJsonParse(content) as Record<string, unknown>;

      const analyses: DimensionAnalysis[] = (parsed.analyses as Record<string, unknown>[] || []).map((a: Record<string, unknown>) => ({
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
    } catch {
      console.error(`⚠️  ${this.name}响应解析失败，使用原始文本`);
      return this.createFallbackReport(dimensions, content);
    }
  }

  /**
   * 解析辩论响应
   */
  private parseDebateResponse(content: string, dimension: AnalysisDimension): DebateStatement {
    try {
      const parsed = this.safeJsonParse(content) as Record<string, unknown>;

      return {
        schoolId: this.id,
        dimension,
        position: (parsed.position as string) || '',
        evidence: (parsed.evidence as string) || '',
        rebuttal: parsed.rebuttal as string | undefined,
        concession: parsed.concession as string | undefined,
      };
    } catch {
      return {
        schoolId: this.id,
        dimension,
        position: content.slice(0, 200),
        evidence: '（解析失败，原始文本）',
      };
    }
  }

  /**
   * 创建降级报告
   */
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
