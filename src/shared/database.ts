// ============================================================
// FateRead - SQLite Database Layer
// Persistent storage for sessions and messages
// ============================================================

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BaziChart, UserProfile } from '../core/types.js';

// ============================================================
// Types
// ============================================================

export interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  profile: string | null;
  chart: string | null;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  reasoning_content: string | null;
  created_at: string;
}

export interface SessionSummary {
  id: string;
  updatedAt: string;
  messageCount: number;
}

// ============================================================
// Database Connection
// ============================================================

let db: Database.Database | null = null;

function getDbPath(): string {
  if (process.env.FATEREAD_DB_PATH) {
    return process.env.FATEREAD_DB_PATH;
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '..', '..', 'fateread.db');
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================
// Schema
// ============================================================

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      profile TEXT,
      chart TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      name TEXT,
      reasoning_content TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(session_id, created_at);
  `);
}

// ============================================================
// Session CRUD
// ============================================================

export function dbCreateSession(
  id: string,
  profile?: UserProfile | null,
  chart?: BaziChart | null,
): void {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT OR REPLACE INTO sessions (id, created_at, updated_at, profile, chart)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, now, now, profile ? JSON.stringify(profile) : null, chart ? JSON.stringify(chart) : null);
}

export function dbUpdateSession(
  id: string,
  profile?: UserProfile | null,
  chart?: BaziChart | null,
): void {
  const database = getDb();
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (profile !== undefined) {
    updates.push('profile = ?');
    params.push(profile ? JSON.stringify(profile) : null);
  }
  if (chart !== undefined) {
    updates.push('chart = ?');
    params.push(chart ? JSON.stringify(chart) : null);
  }

  params.push(id);
  database
    .prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params);
}

export function dbGetSession(id: string): SessionRow | null {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  return row || null;
}

export function dbListSessions(): SessionSummary[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT s.id, s.updated_at, COUNT(m.id) as message_count
       FROM sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
    )
    .all() as Array<{ id: string; updated_at: string; message_count: number }>;

  return rows.map((r) => ({
    id: r.id,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

export function dbDeleteSession(id: string): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================
// Message CRUD
// ============================================================

export function dbAddMessage(
  sessionId: string,
  message: {
    role: string;
    content: string | null;
    tool_calls?: string | null;
    tool_call_id?: string | null;
    name?: string | null;
    reasoning_content?: string | null;
  },
): void {
  const database = getDb();
  const now = new Date().toISOString();

  // Ensure session exists
  const session = database.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    database
      .prepare('INSERT INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(sessionId, now, now);
  } else {
    database.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  }

  database
    .prepare(
      `INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, name, reasoning_content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      message.role,
      message.content,
      message.tool_calls || null,
      message.tool_call_id || null,
      message.name || null,
      message.reasoning_content || null,
      now,
    );
}

export function dbGetMessages(sessionId: string): MessageRow[] {
  const database = getDb();
  return database
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId) as MessageRow[];
}

export function dbReplaceMessages(sessionId: string, messages: Array<{
  role: string;
  content: string | null;
  tool_calls?: string | null;
  tool_call_id?: string | null;
  name?: string | null;
  reasoning_content?: string | null;
}>): void {
  const database = getDb();
  const now = new Date().toISOString();

  const deleteStmt = database.prepare('DELETE FROM messages WHERE session_id = ?');
  const insertStmt = database.prepare(
    `INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, name, reasoning_content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateSession = database.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');

  const transaction = database.transaction(() => {
    deleteStmt.run(sessionId);
    for (const msg of messages) {
      insertStmt.run(
        sessionId,
        msg.role,
        msg.content,
        msg.tool_calls || null,
        msg.tool_call_id || null,
        msg.name || null,
        msg.reasoning_content || null,
        now,
      );
    }
    updateSession.run(now, sessionId);
  });

  transaction();
}

export function dbGetMessageCount(sessionId: string): number {
  const database = getDb();
  const row = database
    .prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
    .get(sessionId) as { count: number } | undefined;
  return row?.count || 0;
}

export function dbDeleteMessagesForSession(sessionId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
}
