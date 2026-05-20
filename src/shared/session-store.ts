// ============================================================
// FateRead - Session Persistence (SQLite-backed)
// Save/load/resume conversation sessions via SQLite
// ============================================================

import type { BaziChart, UserProfile } from '../core/types.js';
import type { Message } from '../agent/agent.js';
import {
  dbCreateSession,
  dbUpdateSession,
  dbGetSession,
  dbListSessions,
  dbDeleteSession,
  dbReplaceMessages,
  dbGetMessages,
  dbAddMessage,
  getDb,
} from './database.js';
import type { MessageRow } from './database.js';

// ============================================================
// Types
// ============================================================

export interface SessionData {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  profile: UserProfile | null;
  chart: BaziChart | null;
  userId: string | null;
}

// ============================================================
// Serialize / Deserialize Messages
// ============================================================

function serializeMessage(msg: Message): string | null {
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    return JSON.stringify(
      msg.tool_calls.map((tc) => ({
        id: tc.id || '',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    );
  }
  return null;
}

function deserializeToolCalls(json: string | null): Message['tool_calls'] {
  if (!json) return undefined;
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return undefined;
    return arr.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      function: { name: tc.function.name, arguments: tc.function.arguments },
      type: 'function' as const,
    }));
  } catch {
    return undefined;
  }
}

function rowToMessage(row: MessageRow): Message {
  return {
    role: row.role as Message['role'],
    content: row.content,
    tool_calls: deserializeToolCalls(row.tool_calls),
    tool_call_id: row.tool_call_id || undefined,
    name: row.name || undefined,
    reasoning_content: row.reasoning_content || undefined,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Generate a human-readable session ID.
 */
export function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-');
  return `session_${date}_${time}`;
}

/**
 * Save the current session to the database.
 */
export function saveSession(
  id: string,
  messages: Message[],
  profile: UserProfile | null,
  chart: BaziChart | null,
  userId?: string | null,
): void {
  // Ensure session row exists
  const existing = dbGetSession(id);
  if (existing) {
    dbUpdateSession(id, profile, chart, userId);
  } else {
    dbCreateSession(id, profile, chart, userId);
  }

  // Replace all messages for this session
  const rows = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    tool_calls: serializeMessage(msg),
    tool_call_id: msg.tool_call_id || null,
    name: msg.name || null,
    reasoning_content: msg.reasoning_content || null,
  }));

  dbReplaceMessages(id, rows);
}

/**
 * Persist a single message. Used for incremental auto-save.
 */
export function appendMessage(
  sessionId: string,
  message: Message,
  profile?: UserProfile | null,
  chart?: BaziChart | null,
  userId?: string | null,
): void {
  dbAddMessage(sessionId, {
    role: message.role,
    content: message.content,
    tool_calls: serializeMessage(message),
    tool_call_id: message.tool_call_id || null,
    name: message.name || null,
    reasoning_content: message.reasoning_content || null,
  });

  if (profile !== undefined || chart !== undefined || userId !== undefined) {
    dbUpdateSession(sessionId, profile, chart, userId);
  }
}

/**
 * Load a session from the database.
 */
export function loadSession(id: string): SessionData | null {
  const row = dbGetSession(id);
  if (!row) return null;

  const messages = dbGetMessages(id).map(rowToMessage);

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
    profile: row.profile ? (JSON.parse(row.profile) as UserProfile) : null,
    chart: row.chart ? (JSON.parse(row.chart) as BaziChart) : null,
    userId: row.user_id || null,
  };
}

/**
 * List all saved sessions.
 */
export function listSessions(): { id: string; updatedAt: string; messageCount: number }[] {
  return dbListSessions();
}

/**
 * Delete a saved session.
 */
export function deleteSession(id: string): boolean {
  return dbDeleteSession(id);
}

/**
 * Get the underlying database instance for direct access.
 */
export { getDb };
