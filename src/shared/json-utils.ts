// ============================================================
// FateRead - Shared JSON Utilities
// Centralized JSON sanitization, safe parsing, and extraction
// ============================================================

/**
 * Sanitize LLM-returned JSON text.
 * Handles: markdown code fences, raw newlines in strings,
 * trailing commas, Chinese punctuation in JSON keys.
 */
export function sanitizeJson(raw: string): string {
  let s = raw;

  // 1. Strip markdown code fences
  s = s.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');

  // 2. Extract the outermost JSON object
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];

  // 3. Escape raw newlines/tabs inside quoted strings
  s = s.replace(/"([^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));

  // 4. Remove trailing commas before ] or }
  s = s.replace(/,\s*([}\]])/g, '$1');

  // 5. Chinese colon → English colon (only outside quotes — best-effort)
  s = s.replace(/"\s*：\s*/g, '": ');

  // 6. Smart quotes → straight quotes
  s = s.replace(/“/g, '"').replace(/”/g, '"');
  s = s.replace(/‘/g, "'").replace(/’/g, "'");

  return s;
}

/**
 * Safe JSON parse with fallback sanitization.
 * Returns the parsed object, or null if completely unparseable.
 */
export function safeJsonParse<T = unknown>(content: string): T | null {
  // Attempt 1: extract JSON block and parse directly
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : content;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Attempt 2: sanitize then parse
    try {
      const sanitized = sanitizeJson(content);
      return JSON.parse(sanitized) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Extract a field from a parsed JSON object with type safety.
 */
export function getField<T>(obj: unknown, field: string, fallback: T): T {
  if (obj && typeof obj === 'object' && field in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[field] as T;
  }
  return fallback;
}
