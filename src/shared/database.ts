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
  user_id: string | null;
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

export interface UserRow {
  id: string;
  nickname: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_hour: number | null;
  birth_minute: number | null;
  gender: string | null;
  birth_city: string | null;
  father_birth_year: number | null;
  mother_birth_year: number | null;
  sibling_rank: number | null;
  total_siblings: number | null;
  life_events_json: string | null;
  concerns_json: string | null;
  visit_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface MemoryRow {
  id: number;
  user_id: string;
  type: string;
  key: string | null;
  content: string;
  importance: number;
  source_session_id: string | null;
  created_at: string;
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT,
      birth_year INTEGER,
      birth_month INTEGER,
      birth_day INTEGER,
      birth_hour INTEGER,
      birth_minute INTEGER,
      gender TEXT,
      birth_city TEXT,
      father_birth_year INTEGER,
      mother_birth_year INTEGER,
      sibling_rank INTEGER,
      total_siblings INTEGER,
      life_events_json TEXT,
      concerns_json TEXT,
      visit_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      key TEXT,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 1,
      source_session_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(user_id, type);
  `);

  // Migration: add user_id column to sessions if it doesn't exist
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id)`);
  } catch {
    // Column already exists, ignore
  }
}

// ============================================================
// Session CRUD
// ============================================================

export function dbCreateSession(
  id: string,
  profile?: UserProfile | null,
  chart?: BaziChart | null,
  userId?: string | null,
): void {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT OR REPLACE INTO sessions (id, created_at, updated_at, profile, chart, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, now, now,
      profile ? JSON.stringify(profile) : null,
      chart ? JSON.stringify(chart) : null,
      userId || null,
    );
}

export function dbUpdateSession(
  id: string,
  profile?: UserProfile | null,
  chart?: BaziChart | null,
  userId?: string | null,
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
  if (userId !== undefined) {
    updates.push('user_id = ?');
    params.push(userId || null);
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

// ============================================================
// User CRUD
// ============================================================

export function dbCreateUser(
  id: string,
  data: {
    nickname?: string | null;
    birthYear?: number | null;
    birthMonth?: number | null;
    birthDay?: number | null;
    birthHour?: number | null;
    birthMinute?: number | null;
    gender?: string | null;
    birthCity?: string | null;
    fatherBirthYear?: number | null;
    motherBirthYear?: number | null;
    siblingRank?: number | null;
    totalSiblings?: number | null;
    lifeEventsJson?: string | null;
    concernsJson?: string | null;
  },
): void {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO users (id, nickname, birth_year, birth_month, birth_day, birth_hour,
        birth_minute, gender, birth_city, father_birth_year, mother_birth_year,
        sibling_rank, total_siblings, life_events_json, concerns_json,
        visit_count, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      data.nickname || null,
      data.birthYear || null,
      data.birthMonth || null,
      data.birthDay || null,
      data.birthHour || null,
      data.birthMinute || null,
      data.gender || null,
      data.birthCity || null,
      data.fatherBirthYear || null,
      data.motherBirthYear || null,
      data.siblingRank || null,
      data.totalSiblings || null,
      data.lifeEventsJson || null,
      data.concernsJson || null,
      now,
      now,
    );
}

export function dbGetUser(id: string): UserRow | null {
  const database = getDb();
  const row = database
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
  return row || null;
}

export function dbFindUserByBirthChart(birthKey: {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  gender: string;
}): UserRow | null {
  const database = getDb();
  const row = database
    .prepare(
      `SELECT * FROM users
       WHERE birth_year = ? AND birth_month = ? AND birth_day = ?
       AND birth_hour = ? AND gender = ?
       ORDER BY last_seen_at DESC
       LIMIT 1`,
    )
    .get(
      birthKey.birthYear,
      birthKey.birthMonth,
      birthKey.birthDay,
      birthKey.birthHour,
      birthKey.gender,
    ) as UserRow | undefined;
  return row || null;
}

export function dbUpdateUser(
  id: string,
  data: {
    nickname?: string | null;
    birthCity?: string | null;
    fatherBirthYear?: number | null;
    motherBirthYear?: number | null;
    siblingRank?: number | null;
    totalSiblings?: number | null;
    lifeEventsJson?: string | null;
    concernsJson?: string | null;
    visitCount?: number;
  },
): void {
  const database = getDb();
  const now = new Date().toISOString();
  const updates: string[] = ['last_seen_at = ?'];
  const params: unknown[] = [now];

  if (data.nickname !== undefined) { updates.push('nickname = ?'); params.push(data.nickname); }
  if (data.birthCity !== undefined) { updates.push('birth_city = ?'); params.push(data.birthCity); }
  if (data.fatherBirthYear !== undefined) { updates.push('father_birth_year = ?'); params.push(data.fatherBirthYear); }
  if (data.motherBirthYear !== undefined) { updates.push('mother_birth_year = ?'); params.push(data.motherBirthYear); }
  if (data.siblingRank !== undefined) { updates.push('sibling_rank = ?'); params.push(data.siblingRank); }
  if (data.totalSiblings !== undefined) { updates.push('total_siblings = ?'); params.push(data.totalSiblings); }
  if (data.lifeEventsJson !== undefined) { updates.push('life_events_json = ?'); params.push(data.lifeEventsJson); }
  if (data.concernsJson !== undefined) { updates.push('concerns_json = ?'); params.push(data.concernsJson); }
  if (data.visitCount !== undefined) { updates.push('visit_count = ?'); params.push(data.visitCount); }

  params.push(id);
  database
    .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .run(...params);
}

export function dbGetUserSessions(userId: string): SessionSummary[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT s.id, s.updated_at, COUNT(m.id) as message_count
       FROM sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       WHERE s.user_id = ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
    )
    .all(userId) as Array<{ id: string; updated_at: string; message_count: number }>;

  return rows.map((r) => ({
    id: r.id,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

export function dbListUsers(): UserRow[] {
  const database = getDb();
  return database
    .prepare('SELECT * FROM users ORDER BY last_seen_at DESC')
    .all() as UserRow[];
}

// ============================================================
// Memory CRUD
// ============================================================

export function dbAddMemory(
  userId: string,
  memory: {
    type: string;
    key?: string | null;
    content: string;
    importance?: number;
    sourceSessionId?: string | null;
  },
): number {
  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `INSERT INTO memories (user_id, type, key, content, importance, source_session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      memory.type,
      memory.key || null,
      memory.content,
      memory.importance || 1,
      memory.sourceSessionId || null,
      now,
    );
  return Number(result.lastInsertRowid);
}

export function dbGetMemories(
  userId: string,
  options?: { type?: string; minImportance?: number; limit?: number },
): MemoryRow[] {
  const database = getDb();
  let sql = 'SELECT * FROM memories WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (options?.type) {
    sql += ' AND type = ?';
    params.push(options.type);
  }
  if (options?.minImportance !== undefined) {
    sql += ' AND importance >= ?';
    params.push(options.minImportance);
  }

  sql += ' ORDER BY importance DESC, created_at DESC';

  if (options?.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return database.prepare(sql).all(...params) as MemoryRow[];
}

export function dbUpdateMemoryImportance(id: number, importance: number): void {
  const database = getDb();
  database.prepare('UPDATE memories SET importance = ? WHERE id = ?').run(importance, id);
}

export function dbDeleteMemory(id: number): void {
  const database = getDb();
  database.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

export function dbDeleteOldMemories(userId: string, keepCount: number): void {
  const database = getDb();
  database
    .prepare(
      `DELETE FROM memories WHERE id IN (
        SELECT id FROM memories WHERE user_id = ?
        ORDER BY importance DESC, created_at DESC
        LIMIT -1 OFFSET ?
      )`,
    )
    .run(userId, keepCount);
}

export function dbCountMemories(userId: string): number {
  const database = getDb();
  const row = database
    .prepare('SELECT COUNT(*) as count FROM memories WHERE user_id = ?')
    .get(userId) as { count: number } | undefined;
  return row?.count || 0;
}
