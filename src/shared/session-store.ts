// ============================================================
// FateRead - Session Persistence
// Save/load/resume conversation sessions to/from disk
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BaziChart, UserProfile } from '../core/types.js';
import type { Message } from '../agent/agent.js';

// ============================================================
// Types
// ============================================================

export interface SessionData {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: SerializableMessage[];
  profile: UserProfile | null;
  chart: BaziChart | null;
}

export interface SerializableMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

// ============================================================
// Session Directory
// ============================================================

function getSessionsDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '..', '..', 'sessions');
}

function ensureSessionsDir(): string {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================
// Serialize / Deserialize Messages
// ============================================================

function serializeMessages(messages: Message[]): SerializableMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls?.map((tc) => ({
      id: tc.id || '',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
    tool_call_id: msg.tool_call_id,
    name: msg.name,
    reasoning_content: msg.reasoning_content,
  }));
}

function deserializeMessages(serialized: SerializableMessage[]): Message[] {
  return serialized.map((msg) => ({
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls?.map((tc) => ({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
      type: 'function' as const,
    })),
    tool_call_id: msg.tool_call_id,
    name: msg.name,
    reasoning_content: msg.reasoning_content,
  }));
}

// ============================================================
// Save / Load / Delete
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
 * Save the current session to disk.
 */
export function saveSession(
  id: string,
  messages: Message[],
  profile: UserProfile | null,
  chart: BaziChart | null,
): string {
  const dir = ensureSessionsDir();

  const data: SessionData = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: serializeMessages(messages),
    profile,
    chart,
  };

  const filepath = join(dir, `${id}.json`);
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
}

/**
 * Load a session from disk.
 */
export function loadSession(id: string): SessionData | null {
  const dir = ensureSessionsDir();
  const filepath = join(dir, `${id}.json`);

  if (!existsSync(filepath)) {
    // Try partial match
    const files = readdirSync(dir);
    const match = files.find((f) => f.startsWith(id));
    if (match) {
      return loadSessionFromFile(join(dir, match));
    }
    return null;
  }

  return loadSessionFromFile(filepath);
}

function loadSessionFromFile(filepath: string): SessionData | null {
  try {
    const raw = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(raw) as SessionData;
    // Validate
    if (!data.id || !Array.isArray(data.messages)) {
      return null;
    }
    return {
      ...data,
      messages: deserializeMessages(data.messages),
    } as unknown as SessionData;
  } catch {
    return null;
  }
}

/**
 * List all saved sessions.
 */
export function listSessions(): { id: string; updatedAt: string; messageCount: number }[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  const result: { id: string; updatedAt: string; messageCount: number }[] = [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const data = JSON.parse(raw);
      result.push({
        id: data.id || file.replace('.json', ''),
        updatedAt: data.updatedAt || '',
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
      });
    } catch {
      // skip corrupted
    }
  }

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Delete a saved session.
 */
export function deleteSession(id: string): boolean {
  const dir = getSessionsDir();
  const filepath = join(dir, `${id}.json`);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
    return true;
  }
  return false;
}
