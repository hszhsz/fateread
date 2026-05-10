// ============================================================
// FateRead - Multi-School Types (多流派类型定义)
// 定义子 Agent（流派）的接口规范
// ============================================================

import type { BaziChart, UserProfile } from '../../core/types.js';

/**
 * 流派标识
 */
export type SchoolId = 'ziping' | 'ziwei' | 'mangpai';

/**
 * 流派显示名
 */
export const SCHOOL_NAMES: Record<SchoolId, string> = {
  ziping: '子平八字',
  ziwei: '紫微斗数',
  mangpai: '盲派命理',
};

/**
 * 分析维度
 */
export type AnalysisDimension =
  | 'personality'   // 性格特质
  | 'career'        // 事业运
  | 'wealth'        // 财运
  | 'marriage'      // 婚姻感情
  | 'health'        // 健康
  | 'education'     // 学业
  | 'interpersonal' // 人际关系
  | 'timing'        // 流年大运
  | 'overall';      // 综合格局

/**
 * 单维度分析结论
 */
export interface DimensionAnalysis {
  dimension: AnalysisDimension;
  conclusion: string;          // 核心结论（一句话）
  confidence: number;          // 信心度 0-100
  reasoning: string;           // 推理过程（引用命理依据）
  advice?: string;             // 建议
  keywords: string[];          // 关键词标签
}

/**
 * 子 Agent 的完整分析报告
 */
export interface SchoolReport {
  schoolId: SchoolId;
  schoolName: string;
  timestamp: string;

  // 格局判断
  patternSummary: string;      // 格局总结（一句话）

  // 各维度分析
  analyses: DimensionAnalysis[];

  // 用神/忌神判断（子平/盲派适用）
  usefulElements?: string;     // 用神
  harmfulElements?: string;    // 忌神

  // 特殊星曜/格局（紫微适用）
  specialPatterns?: string[];

  // 综合评分
  overallScore?: number;       // 0-100 命局层次

  // 原始推理过程（供辩论用）
  rawReasoning?: string;
}

/**
 * 辩论轮次中的发言
 */
export interface DebateStatement {
  schoolId: SchoolId;
  dimension: AnalysisDimension;
  position: string;            // 立场/论点
  evidence: string;            // 命理依据
  rebuttal?: string;           // 对其他流派的反驳
  concession?: string;         // 让步/认同的部分
}

/**
 * 辩论结果（最终共识）
 */
export interface DebateConsensus {
  dimension: AnalysisDimension;
  consensus: string;           // 达成的共识结论
  majorityView: string;        // 多数派观点
  dissent?: string;            // 少数派保留意见
  synthesisReasoning: string;  // 综合推理过程
  confidence: number;          // 共识信心度
  contributingSchools: SchoolId[];  // 贡献学派
}

/**
 * 综合分析结果（主 Agent 输出）
 */
export interface SynthesizedReport {
  // 各流派原始报告
  schoolReports: SchoolReport[];

  // 辩论过程（仅在有分歧时）
  debates?: DebateConsensus[];

  // 最终综合结论
  finalAnalysis: {
    patternSummary: string;
    dimensions: DimensionAnalysis[];
    timing?: string;
    overallAdvice: string;
  };

  // 元信息
  meta: {
    agreementRate: number;     // 流派间一致率 0-100
    debatedDimensions: AnalysisDimension[];
    timestamp: string;
  };
}

/**
 * 子 Agent 接口
 */
export interface SchoolAgent {
  id: SchoolId;
  name: string;

  /**
   * 对命盘进行分析
   */
  analyze(
    chart: BaziChart,
    profile: UserProfile | null,
    dimensions: AnalysisDimension[],
    options?: SchoolAgentOptions,
  ): Promise<SchoolReport>;

  /**
   * 参与辩论：针对特定维度给出立场
   */
  debate(
    dimension: AnalysisDimension,
    ownAnalysis: DimensionAnalysis,
    otherPositions: DebateStatement[],
    chart: BaziChart,
    options?: SchoolAgentOptions,
  ): Promise<DebateStatement>;
}

/**
 * 子 Agent 配置选项
 */
export interface SchoolAgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  verbose?: boolean;
}
