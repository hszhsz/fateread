// ============================================================
// FateRead - LLM 四柱验证模块 (Pillar Verification via LLM)
// 排盘后调用大模型独立验证四柱计算结果，确保准确性
// ============================================================

import OpenAI from 'openai';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BaziChart, FourPillars, Pillar } from '../core/types.js';

// ============================================================
// Types
// ============================================================

export interface VerificationResult {
  verified: boolean;           // 验证是否通过
  skipped?: boolean;           // 是否跳过验证（解析失败等）
  skipReason?: string;         // 跳过原因
  corrections?: {              // 如果有修正
    pillar: 'year' | 'month' | 'day' | 'hour';
    original: string;          // 原始计算结果
    corrected: string;         // LLM 修正结果
    reason: string;            // 修正原因
  }[];
  llmAnswer?: string;          // LLM 原始回答（调试用）
}

export interface VerifyOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// ============================================================
// 日志
// ============================================================

function getLogDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, '..', '..', 'logs');
}

function logVerification(
  input: { year: number; month: number; day: number; hour: number; minute: number; city?: string },
  original: { year: string; month: string; day: string; hour: string },
  result: VerificationResult,
): void {
  const logDir = getLogDir();
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logFile = join(logDir, 'pillar-verification.log');
  const timestamp = new Date().toISOString();
  const status = result.verified ? 'PASS' : 'CORRECTED';

  let entry = `[${timestamp}] ${status} | 出生: ${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')} ${String(input.hour).padStart(2, '0')}:${String(input.minute).padStart(2, '0')}`;
  if (input.city) entry += ` (${input.city})`;
  entry += ` | 算法: ${original.year} ${original.month} ${original.day} ${original.hour}`;

  if (!result.verified && result.corrections) {
    for (const c of result.corrections) {
      entry += `\n  ↳ ${c.pillar}柱修正: ${c.original} → ${c.corrected} (${c.reason})`;
    }
  }
  entry += '\n';

  try {
    appendFileSync(logFile, entry, 'utf-8');
  } catch {
    // 日志写入失败不影响主流程
    console.error('⚠️  验证日志写入失败');
  }
}

// ============================================================
// LLM 验证核心逻辑
// ============================================================

const VERIFY_PROMPT = `你是一位精通中国传统历法和子平八字的专家。你的唯一任务是验证给定出生时间的四柱（八字）计算是否正确。

规则：
1. 年柱：以立春为界（不是正月初一）。立春前出生算上一年。
2. 月柱：以节气为界。每月以"节"为起点（立春、惊蛰、清明、立夏、芒种、小暑、立秋、白露、寒露、立冬、大雪、小寒）。
3. 日柱：以子时（23:00）换日。注意真太阳时校正后可能影响日期。
4. 时柱：按真太阳时确定时辰。

请按以下 JSON 格式严格回答，不要有任何其他文字：
{
  "year_pillar": "X干X支",
  "month_pillar": "X干X支",
  "day_pillar": "X干X支",
  "hour_pillar": "X干X支",
  "notes": "如有特殊情况说明"
}

其中 X干X支 格式如："庚午"、"壬子" 等（两个字，天干+地支）。`;

/**
 * 调用 LLM 验证四柱计算结果
 */
export async function verifyPillars(
  chart: BaziChart,
  birthInput: { year: number; month: number; day: number; hour: number; minute: number; city?: string; longitude?: number },
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  const client = new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
    baseURL: options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  });
  const model = options.model || process.env.FATEREAD_VERIFY_MODEL || process.env.FATEREAD_MODEL || 'deepseek-v4-pro';

  const fp = chart.fourPillars;
  const original = {
    year: `${fp.year.stem}${fp.year.branch}`,
    month: `${fp.month.stem}${fp.month.branch}`,
    day: `${fp.day.stem}${fp.day.branch}`,
    hour: `${fp.hour.stem}${fp.hour.branch}`,
  };

  // 构建用户消息
  let userMsg = `请验证以下出生信息的四柱八字是否正确：\n\n`;
  userMsg += `出生时间（公历）：${birthInput.year}年${birthInput.month}月${birthInput.day}日 ${birthInput.hour}时${birthInput.minute}分\n`;
  if (birthInput.city) {
    userMsg += `出生地点：${birthInput.city}\n`;
  }
  if (birthInput.longitude) {
    userMsg += `经度：${birthInput.longitude}°（用于真太阳时计算）\n`;
  }
  userMsg += `真太阳时：${chart.birthInfo.trueSolarTime}\n\n`;
  userMsg += `算法计算结果：\n`;
  userMsg += `- 年柱：${original.year}\n`;
  userMsg += `- 月柱：${original.month}\n`;
  userMsg += `- 日柱：${original.day}\n`;
  userMsg += `- 时柱：${original.hour}\n\n`;
  userMsg += `请独立推算该出生时间的正确四柱，然后对比上述算法结果，按要求的 JSON 格式回答。`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: VERIFY_PROMPT },
        { role: 'user', content: userMsg },
      ],
      temperature: 0,  // 确定性输出
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '';
    const llmPillars = parseLLMResponse(content);

    if (!llmPillars) {
      // LLM 响应解析失败，信任算法结果
      console.log('⚠️  LLM 验证响应解析失败，信任算法结果');
      const skipResult: VerificationResult = { verified: true, skipped: true, skipReason: 'LLM 响应解析失败', llmAnswer: content };
      logVerification(birthInput, original, skipResult);
      return skipResult;
    }

    // 比较四柱
    const corrections: VerificationResult['corrections'] = [];
    const pillarNames: ('year' | 'month' | 'day' | 'hour')[] = ['year', 'month', 'day', 'hour'];
    const pillarKeys = ['year_pillar', 'month_pillar', 'day_pillar', 'hour_pillar'] as const;
    const originalArr = [original.year, original.month, original.day, original.hour];

    for (let i = 0; i < 4; i++) {
      const llmValue = llmPillars[pillarKeys[i]];
      if (llmValue && llmValue !== originalArr[i]) {
        // 验证 LLM 返回的是合法干支组合
        if (isValidGanZhi(llmValue)) {
          corrections.push({
            pillar: pillarNames[i],
            original: originalArr[i],
            corrected: llmValue,
            reason: llmPillars.notes || 'LLM 独立计算结果不一致',
          });
        }
      }
    }

    const result: VerificationResult = {
      verified: corrections.length === 0,
      corrections: corrections.length > 0 ? corrections : undefined,
      llmAnswer: content,
    };

    logVerification(birthInput, original, result);
    return result;

  } catch (error: unknown) {
    // API 调用失败，信任算法结果，不阻塞主流程
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  LLM 验证调用失败: ${msg}，信任算法结果`);
    return { verified: true, skipped: true, skipReason: `API 调用失败: ${msg}` };
  }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 清洗 LLM 返回的不规范 JSON
 */
function sanitizeJson(raw: string): string {
  let s = raw;
  // 去除 markdown 代码块
  s = s.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
  // 提取 JSON 对象
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  // 字符串值内的 raw newline
  s = s.replace(/"([^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
  // trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');
  // 中文标点
  s = s.replace(/"\s*：\s*/g, '": ');
  s = s.replace(/\u201c/g, '"').replace(/\u201d/g, '"');
  return s;
}

/**
 * 解析 LLM 的 JSON 响应
 */
function parseLLMResponse(content: string): {
  year_pillar: string;
  month_pillar: string;
  day_pillar: string;
  hour_pillar: string;
  notes?: string;
} | null {
  // 尝试多种策略解析
  const attempts = [
    // 1. 直接解析
    () => JSON.parse(content),
    // 2. 提取 JSON 块后解析
    () => {
      const m = content.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    },
    // 3. 清洗后解析
    () => JSON.parse(sanitizeJson(content)),
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (parsed && parsed.year_pillar && parsed.month_pillar && parsed.day_pillar && parsed.hour_pillar) {
        return parsed;
      }
    } catch { /* try next */ }
  }
  return null;
}

/**
 * 验证是否为合法的天干地支组合（2个字符）
 */
function isValidGanZhi(gz: string): boolean {
  if (gz.length !== 2) return false;
  const GAN = '甲乙丙丁戊己庚辛壬癸';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  return GAN.includes(gz[0]) && ZHI.includes(gz[1]);
}

/**
 * 应用修正到命盘
 * 注意：修正四柱后，十神、藏干等衍生数据也需要重新计算
 * 但由于日柱/时柱修正非常罕见，这里仅更新四柱原始数据
 * 后续完整重排由调用方（重新调用 paipan）处理
 */
export function applyCorrectionsToPillars(
  fourPillars: FourPillars,
  corrections: NonNullable<VerificationResult['corrections']>,
): FourPillars {
  const result = { ...fourPillars };

  for (const c of corrections) {
    const pillar: Pillar = {
      stem: c.corrected[0] as Pillar['stem'],
      branch: c.corrected[1] as Pillar['branch'],
    };
    result[c.pillar] = pillar;
  }

  return result;
}
