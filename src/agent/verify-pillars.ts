// ============================================================
// FateRead - LLM 四柱验证模块
// Uses shared json-utils and llm-client
// ============================================================

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BaziChart, FourPillars, Pillar } from '../core/types.js';
import { safeJsonParse } from '../shared/json-utils.js';
import { createLlmClient, resolveModel, resolveMaxTokens, extractContent } from '../shared/llm-client.js';

// ============================================================
// Types
// ============================================================

export interface VerificationResult {
  verified: boolean;
  skipped?: boolean;
  skipReason?: string;
  corrections?: {
    pillar: 'year' | 'month' | 'day' | 'hour';
    original: string;
    corrected: string;
    reason: string;
  }[];
  llmAnswer?: string;
}

export interface VerifyOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

// ============================================================
// Logging
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
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

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
    console.error('⚠️  验证日志写入失败');
  }
}

// ============================================================
// System Prompt
// ============================================================

const VERIFY_PROMPT = `你是一位精通中国传统历法和子平八字的专家。验证给定出生时间的四柱（八字）是否正确。

规则：
1. 年柱：以立春为界（不是正月初一）。立春前出生算上一年。
2. 月柱：以节气为界。
3. 日柱：以子时（23:00）换日。
4. 时柱：按真太阳时确定时辰。

请按以下 JSON 格式回答：
{
  "year_pillar": "X干X支",
  "month_pillar": "X干X支",
  "day_pillar": "X干X支",
  "hour_pillar": "X干X支",
  "notes": "如有特殊情况说明"
}`;

// ============================================================
// Core Logic
// ============================================================

export async function verifyPillars(
  chart: BaziChart,
  birthInput: { year: number; month: number; day: number; hour: number; minute: number; city?: string; longitude?: number },
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  const client = createLlmClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  const model = resolveModel({ model: options.model || process.env.FATEREAD_VERIFY_MODEL });
  const maxTokens = resolveMaxTokens({ maxTokens: options.maxTokens });

  const fp = chart.fourPillars;
  const original = {
    year: `${fp.year.stem}${fp.year.branch}`,
    month: `${fp.month.stem}${fp.month.branch}`,
    day: `${fp.day.stem}${fp.day.branch}`,
    hour: `${fp.hour.stem}${fp.hour.branch}`,
  };

  let userMsg = `请验证以下出生信息的四柱八字是否正确：\n\n`;
  userMsg += `出生时间（公历）：${birthInput.year}年${birthInput.month}月${birthInput.day}日 ${birthInput.hour}时${birthInput.minute}分\n`;
  if (birthInput.city) userMsg += `出生地点：${birthInput.city}\n`;
  if (birthInput.longitude) userMsg += `经度：${birthInput.longitude}°\n`;
  userMsg += `真太阳时：${chart.birthInfo.trueSolarTime}\n\n`;
  userMsg += `算法计算结果：\n- 年柱：${original.year}\n- 月柱：${original.month}\n- 日柱：${original.day}\n- 时柱：${original.hour}\n\n`;
  userMsg += `请独立推算正确四柱，对比算法结果，按 JSON 格式回答。`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: VERIFY_PROMPT },
        { role: 'user', content: userMsg },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    });

    const message = response.choices[0]?.message as unknown as Record<string, unknown> | undefined;
    const content = extractContent(message);
    const llmPillars = parseLLMResponse(content);

    if (!llmPillars) {
      console.log('⚠️  LLM 验证响应解析失败，信任算法结果');
      const skipResult: VerificationResult = { verified: true, skipped: true, skipReason: 'LLM 响应解析失败', llmAnswer: content };
      logVerification(birthInput, original, skipResult);
      return skipResult;
    }

    const corrections: VerificationResult['corrections'] = [];
    const pillarNames: ('year' | 'month' | 'day' | 'hour')[] = ['year', 'month', 'day', 'hour'];
    const pillarKeys = ['year_pillar', 'month_pillar', 'day_pillar', 'hour_pillar'] as const;
    const originalArr = [original.year, original.month, original.day, original.hour];

    for (let i = 0; i < 4; i++) {
      const llmValue = llmPillars[pillarKeys[i]];
      if (llmValue && llmValue !== originalArr[i] && isValidGanZhi(llmValue)) {
        corrections.push({
          pillar: pillarNames[i],
          original: originalArr[i],
          corrected: llmValue,
          reason: llmPillars.notes || 'LLM 独立计算结果不一致',
        });
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  LLM 验证调用失败: ${msg}，信任算法结果`);
    return { verified: true, skipped: true, skipReason: `API 调用失败: ${msg}` };
  }
}

// ============================================================
// Helpers
// ============================================================

function parseLLMResponse(content: string): {
  year_pillar: string;
  month_pillar: string;
  day_pillar: string;
  hour_pillar: string;
  notes?: string;
} | null {
  const parsed = safeJsonParse<Record<string, unknown>>(content);
  if (parsed && parsed.year_pillar && parsed.month_pillar && parsed.day_pillar && parsed.hour_pillar) {
    return {
      year_pillar: parsed.year_pillar as string,
      month_pillar: parsed.month_pillar as string,
      day_pillar: parsed.day_pillar as string,
      hour_pillar: parsed.hour_pillar as string,
      notes: parsed.notes as string | undefined,
    };
  }
  return null;
}

function isValidGanZhi(gz: string): boolean {
  if (gz.length !== 2) return false;
  const GAN = '甲乙丙丁戊己庚辛壬癸';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  return GAN.includes(gz[0]) && ZHI.includes(gz[1]);
}

export function applyCorrectionsToPillars(
  fourPillars: FourPillars,
  corrections: NonNullable<VerificationResult['corrections']>,
): FourPillars {
  const result = { ...fourPillars };
  for (const c of corrections) {
    result[c.pillar] = {
      stem: c.corrected[0] as Pillar['stem'],
      branch: c.corrected[1] as Pillar['branch'],
    };
  }
  return result;
}
