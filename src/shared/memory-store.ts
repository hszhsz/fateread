// ============================================================
// FateRead - Memory Store (跨会话记忆系统)
// User identity, returning-user detection, cross-session memory,
// and memory injection into prompts.
// ============================================================

import type { UserProfile, LifeEvent } from '../core/types.js';
import {
  dbCreateUser,
  dbGetUser,
  dbFindUserByBirthChart,
  dbUpdateUser,
  dbGetUserSessions,
  dbListUsers,
  dbAddMemory,
  dbGetMemories,
  dbUpdateMemoryImportance,
  dbDeleteMemory,
  dbDeleteOldMemories,
} from './database.js';
import type { UserRow, MemoryRow } from './database.js';

// ============================================================
// Types
// ============================================================

export type MemoryType = 'fact' | 'preference' | 'insight' | 'summary';

export interface UserMemory {
  user: UserRow;
  isReturning: boolean;
  memories: MemoryRow[];
  sessionCount: number;
}

// ============================================================
// User Identity
// ============================================================

export function generateUserId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-');
  const rand = Math.random().toString(36).slice(2, 6);
  return `user_${date}_${time}_${rand}`;
}

/**
 * Build a fingerprint key from birth info for matching returning users.
 * Birth year+month+day+hour+gender is a highly unique combination.
 */
function buildBirthFingerprint(profile: UserProfile): {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  gender: string;
} | null {
  if (!profile.birthYear || !profile.birthMonth || !profile.birthDay ||
      profile.birthHour === undefined || !profile.gender) {
    return null;
  }
  return {
    birthYear: profile.birthYear,
    birthMonth: profile.birthMonth,
    birthDay: profile.birthDay,
    birthHour: profile.birthHour,
    gender: profile.gender,
  };
}

/**
 * Try to find a returning user by birth chart fingerprint.
 * Returns null if no match, or the matching user row.
 */
export function identifyReturningUser(profile: UserProfile): UserRow | null {
  const key = buildBirthFingerprint(profile);
  if (!key) return null;
  return dbFindUserByBirthChart(key);
}

/**
 * Find or create a user based on profile.
 * Returns the user row and whether they are a returning visitor.
 */
export function findOrCreateUser(profile: UserProfile): {
  user: UserRow;
  isReturning: boolean;
} {
  // Try to identify returning user by birth chart
  const existing = identifyReturningUser(profile);
  if (existing) {
    // Update visit count and last seen
    const updatedCount = (existing.visit_count || 1) + 1;
    dbUpdateUser(existing.id, {
      visitCount: updatedCount,
      birthCity: profile.birthCity || existing.birth_city || undefined,
      fatherBirthYear: profile.parents?.fatherBirthYear || existing.father_birth_year || undefined,
      motherBirthYear: profile.parents?.motherBirthYear || existing.mother_birth_year || undefined,
      siblingRank: profile.siblings?.rank || existing.sibling_rank || undefined,
      totalSiblings: profile.siblings?.totalSiblings || existing.total_siblings || undefined,
      lifeEventsJson: profile.lifeEvents?.length
        ? JSON.stringify(profile.lifeEvents)
        : existing.life_events_json || undefined,
      concernsJson: profile.concerns?.length
        ? JSON.stringify(profile.concerns)
        : existing.concerns_json || undefined,
    });
    // Re-read to get the fully updated row
    const updated = dbGetUser(existing.id) || existing;
    return { user: updated, isReturning: true };
  }

  // New user
  const id = generateUserId();
  dbCreateUser(id, {
    nickname: null,
    birthYear: profile.birthYear || null,
    birthMonth: profile.birthMonth || null,
    birthDay: profile.birthDay || null,
    birthHour: profile.birthHour || null,
    birthMinute: profile.birthMinute || null,
    gender: profile.gender || null,
    birthCity: profile.birthCity || null,
    fatherBirthYear: profile.parents?.fatherBirthYear || null,
    motherBirthYear: profile.parents?.motherBirthYear || null,
    siblingRank: profile.siblings?.rank || null,
    totalSiblings: profile.siblings?.totalSiblings || null,
    lifeEventsJson: profile.lifeEvents?.length ? JSON.stringify(profile.lifeEvents) : null,
    concernsJson: profile.concerns?.length ? JSON.stringify(profile.concerns) : null,
  });

  const user = dbGetUser(id);
  if (!user) throw new Error(`创建用户失败: ${id}`);
  return { user, isReturning: false };
}

/**
 * Get a user by ID.
 */
export function getUser(userId: string): UserRow | null {
  return dbGetUser(userId);
}

/**
 * List all known users.
 */
export function listUsers(): UserRow[] {
  return dbListUsers();
}

// ============================================================
// Memory Management
// ============================================================

/**
 * Add a memory record.
 */
export function addMemory(
  userId: string,
  type: MemoryType,
  content: string,
  opts?: {
    key?: string;
    importance?: number;
    sourceSessionId?: string;
  },
): number {
  return dbAddMemory(userId, {
    type,
    key: opts?.key || null,
    content,
    importance: opts?.importance || 1,
    sourceSessionId: opts?.sourceSessionId || null,
  });
}

/**
 * Add a structured fact about the user.
 */
export function addFactMemory(
  userId: string,
  key: string,
  content: string,
  importance = 3,
  sessionId?: string,
): number {
  return addMemory(userId, 'fact', content, { key, importance, sourceSessionId: sessionId });
}

/**
 * Add a user preference.
 */
export function addPreferenceMemory(
  userId: string,
  key: string,
  content: string,
  sessionId?: string,
): number {
  return addMemory(userId, 'preference', content, { key, importance: 4, sourceSessionId: sessionId });
}

/**
 * Add an insight (AI-generated observation about the user).
 */
export function addInsightMemory(
  userId: string,
  key: string,
  content: string,
  importance = 2,
  sessionId?: string,
): number {
  return addMemory(userId, 'insight', content, { key, importance, sourceSessionId: sessionId });
}

/**
 * Add a session summary.
 */
export function addSessionSummary(
  userId: string,
  content: string,
  sessionId?: string,
): number {
  return addMemory(userId, 'summary', content, { importance: 3, sourceSessionId: sessionId });
}

/**
 * Get memories for a user, filtered by type/importance.
 */
export function getMemories(
  userId: string,
  options?: { type?: MemoryType; minImportance?: number; limit?: number },
): MemoryRow[] {
  return dbGetMemories(userId, options);
}

/**
 * Remove low-importance old memories to keep the store manageable.
 */
export function pruneMemories(userId: string, keepCount = 50): void {
  dbDeleteOldMemories(userId, keepCount);
}

/**
 * Delete a specific memory.
 */
export { dbDeleteMemory as deleteMemory };
export { dbUpdateMemoryImportance as updateMemoryImportance };

// ============================================================
// Memory Extraction from Profile
// ============================================================

/**
 * Extract structured memory facts from a user profile.
 * Called after intake is complete to persist key facts.
 */
export function extractMemoriesFromProfile(
  userId: string,
  profile: UserProfile,
  sessionId?: string,
): void {
  // Fact: family background
  if (profile.parents) {
    const p = profile.parents;
    if (p.fatherBirthYear) {
      addFactMemory(userId, 'family', `父亲出生于${p.fatherBirthYear}年`, 2, sessionId);
    }
    if (p.motherBirthYear) {
      addFactMemory(userId, 'family', `母亲出生于${p.motherBirthYear}年`, 2, sessionId);
    }
    if (p.notes) {
      addFactMemory(userId, 'family', `父母情况补充: ${p.notes}`, 2, sessionId);
    }
  }

  // Fact: siblings
  if (profile.siblings) {
    const s = profile.siblings;
    addFactMemory(userId, 'family',
      `排行第${s.rank}，共${s.totalSiblings}个兄弟姐妹`, 2, sessionId);
    if (s.isTwin) {
      addFactMemory(userId, 'family', '是双胞胎', 3, sessionId);
    }
  }

  // Fact: life events
  if (profile.lifeEvents && profile.lifeEvents.length > 0) {
    const categoryMap: Record<string, string> = {
      career: '事业', education: '学业', marriage: '婚恋',
      health: '健康', wealth: '财运', family: '家庭', other: '其他',
    };
    for (const ev of profile.lifeEvents) {
      const cat = categoryMap[ev.category] || ev.category;
      const label = ev.isPositive === true ? '吉' : ev.isPositive === false ? '凶' : '';
      addFactMemory(userId, 'event',
        `${ev.year}年【${cat}${label ? ' ' + label : ''}】：${ev.description}`, 3, sessionId);
    }
  }

  // Preference: concerns
  if (profile.concerns && profile.concerns.length > 0) {
    for (const concern of profile.concerns) {
      addPreferenceMemory(userId, 'concern', `关注领域: ${concern}`, sessionId);
    }
  }

  // Preference: specific question
  if (profile.specificQuestion) {
    addPreferenceMemory(userId, 'question', `具体问题: ${profile.specificQuestion}`, sessionId);
  }
}

// ============================================================
// Memory Context Builder (for System Prompt Injection)
// ============================================================

/**
 * Build the memory context string to inject into the system prompt.
 * This gives the LLM awareness of the returning user's history.
 */
export function buildMemoryContext(
  userId: string,
  chartSummary?: string,
): string {
  const user = dbGetUser(userId);
  if (!user) return '';

  const memories = dbGetMemories(userId, { minImportance: 2, limit: 30 });
  const sessions = dbGetUserSessions(userId);

  if (user.visit_count <= 1 && memories.length === 0) return '';

  const parts: string[] = ['\n\n## 缘主记忆（仅供你内部参考，不要在对话中逐条复述）\n'];

  // Returning visitor header
  if (user.visit_count > 1) {
    parts.push(`这名缘主**不是第一次来访**。以下是他的关键信息：\n`);
  }

  // Basic info
  parts.push('### 基本信息');
  if (chartSummary) {
    parts.push(`- 命盘：${chartSummary}`);
  }
  if (user.birth_year) {
    const genderLabel = user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '';
    const birthStr = [user.birth_year, user.birth_month, user.birth_day].filter(Boolean).join('/');
    parts.push(`- 出生：${birthStr} ${user.birth_hour}时 ${genderLabel}${user.birth_city ? ' ' + user.birth_city : ''}`);
  }
  if (user.nickname) {
    parts.push(`- 昵称：${user.nickname}`);
  }
  if (user.visit_count > 1) {
    parts.push(`- 累计来访：${user.visit_count} 次 | 上次来访：${user.last_seen_at?.slice(0, 10) || '未知'}`);
  }
  parts.push('');

  // Facts
  const facts = memories.filter(m => m.type === 'fact');
  if (facts.length > 0) {
    parts.push('### 重要事实');
    for (const f of facts) {
      parts.push(`- ${f.content}`);
    }
    parts.push('');
  }

  // Preferences
  const prefs = memories.filter(m => m.type === 'preference');
  if (prefs.length > 0) {
    parts.push('### 缘主偏好');
    for (const p of prefs) {
      parts.push(`- ${p.content}`);
    }
    parts.push('');
  }

  // Insights
  const insights = memories.filter(m => m.type === 'insight');
  if (insights.length > 0) {
    parts.push('### 历史洞察');
    for (const i of insights) {
      parts.push(`- ${i.content}`);
    }
    parts.push('');
  }

  // Summaries (only the most recent)
  const summaries = memories.filter(m => m.type === 'summary').slice(0, 3);
  if (summaries.length > 0) {
    parts.push('### 历史会话摘要');
    for (const s of summaries) {
      parts.push(`- [${s.created_at?.slice(0, 10) || ''}] ${s.content}`);
    }
    parts.push('');
  }

  // Historical sessions
  if (sessions.length > 0) {
    parts.push('### 历史会话记录');
    parts.push(`共 ${sessions.length} 次会话`);
    parts.push('');
  }

  // Interaction strategy for returning users
  if (user.visit_count > 1) {
    parts.push('### 本次交互策略');
    parts.push('- 缘主是回头客，可以跳过基础信息采集，直接进入他关心的领域');
    parts.push('- 可以自然地引用历史会话内容（"上次我们聊到..."）');
    parts.push('- 对比前后变化，给出递进式的深度分析');
    parts.push('- 语气可以更亲近、更直接');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Build a minimal greeting hint for returning users.
 * Called during the initial greeting phase to customize the welcome.
 */
export function buildReturningUserGreeting(userId: string): string {
  const user = dbGetUser(userId);
  if (!user || user.visit_count <= 1) return '';

  const memories = dbGetMemories(userId, { minImportance: 3, limit: 5 });
  const concernPrefs = memories.filter(m => m.key === 'concern');

  let hint = `\n\n**重要**：这位缘主是回头客（第${user.visit_count}次来访，上次是${user.last_seen_at?.slice(0, 10) || '之前'}）。`;

  if (concernPrefs.length > 0) {
    hint += `\n他之前关心过：${concernPrefs.map(c => c.content.replace('关注领域: ', '')).join('、')}。`;
  }

  hint += `\n请在问候中自然提及他是"老缘主"，跳过基础采集，直接询问本次想了解什么。`;

  return hint;
}
