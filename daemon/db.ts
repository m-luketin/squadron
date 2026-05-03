// SQLite persistence for Squadron M1.
// One file: ~/.hexagent/squadron.db. WAL mode + foreign keys on.
// Module-level: just opens the DB, runs migrations, exposes prepared statements
// and helper functions. Higher-level CRUD lives in world.ts.

import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AgentStatus = "Draft" | "Live";
export type AgentState =
  | "idle"
  | "thinking"
  | "tool-running"
  | "moving"
  | "awaiting-input"
  | "errored";

/** Row shape mirrors the SQL table. snake_case as stored. */
export interface AgentRow {
  id: string;
  name: string;
  glyph: string;
  color: string;
  status: AgentStatus;
  state: AgentState;
  model: string | null;
  system_prompt: string;
  session_id: string | null;
  position_q: number;
  position_r: number;
  vault: string;
  /** M6: per-agent movement permission. 0/1 stored as int. Default 0 (off). */
  movement_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  agent_id: string;
  side: "you" | "them" | "sys";
  who: string | null;
  text: string;
  created_at: string;
}

export type FeatureKind = "wall" | "router";

export interface FeatureRow {
  q: number;
  r: number;
  kind: FeatureKind;
  created_at: string;
}

export interface InterAgentMessageRow {
  id: number;
  from_agent_id: string;
  to_agent_id: string;
  text: string;
  created_at: string;
  delivered_at: string | null;
}

export interface Statements {
  insertAgent: Statement<
    unknown,
    [
      string, string, string, string, string, string, string | null, string,
      string | null, number, number, string, number, string, string,
    ]
  >;
  deleteAgent:        Statement<unknown, [string]>;
  getAgents:          Statement<AgentRow, []>;
  getAgentById:       Statement<AgentRow, [string]>;
  getLiveAgents:      Statement<AgentRow, []>;
  setStatus:          Statement<unknown, [AgentStatus, string, string]>;     // status, updated_at, id
  setState:           Statement<unknown, [AgentState, string, string]>;
  setSessionId:       Statement<unknown, [string | null, string, string]>;   // session_id, updated_at, id
  insertMessage:      Statement<unknown, [string, string, string | null, string, string]>;
  getMessagesByAgent: Statement<MessageRow, [string]>;
  getAllMessages:     Statement<MessageRow, []>;
  getAgentTelemetry:  Statement<{ msgs: number; lastAt: string | null }, [string]>;

  // M3 — world features (walls + routers)
  upsertFeature:    Statement<unknown, [number, number, FeatureKind, string]>;
  deleteFeature:    Statement<unknown, [number, number]>;
  getFeatures:      Statement<FeatureRow, []>;

  // M3 — inter-agent messages
  insertInterAgentMessage: Statement<unknown, [string, string, string, string]>;
  getAllInterAgentMessages: Statement<InterAgentMessageRow, []>;
  getPendingInterAgentMessagesFor: Statement<InterAgentMessageRow, [string]>;
  markInterAgentMessageDelivered: Statement<unknown, [string, number]>;       // delivered_at, id
}

let _db: Database | null = null;
let _stmts: Statements | null = null;

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  glyph            TEXT NOT NULL DEFAULT '◇',
  color            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('Draft','Live')),
  state            TEXT NOT NULL DEFAULT 'idle',
  model            TEXT,
  system_prompt    TEXT NOT NULL DEFAULT '',
  session_id       TEXT,
  position_q       INTEGER NOT NULL DEFAULT 0,
  position_r       INTEGER NOT NULL DEFAULT 0,
  vault            TEXT NOT NULL,
  movement_enabled INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  side        TEXT NOT NULL,
  who         TEXT,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_agent_created
  ON messages(agent_id, created_at);

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- M3: walls + routers persisted server-side (was client-only in M1).
CREATE TABLE IF NOT EXISTS world_features (
  q          INTEGER NOT NULL,
  r          INTEGER NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('wall','router')),
  created_at TEXT    NOT NULL,
  PRIMARY KEY (q, r)
);

-- M3: agent ↔ agent messages routed through MCP send_to.
CREATE TABLE IF NOT EXISTS inter_agent_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_iam_to_pending
  ON inter_agent_messages(to_agent_id, delivered_at);
`;

export interface OpenDbResult {
  db: Database;
  stmts: Statements;
  path: string;
}

/** Open (or create) the squadron DB. Creates ~/.hexagent/ if missing. */
export function openDb(): OpenDbResult {
  if (_db && _stmts) return { db: _db, stmts: _stmts, path: getDbPath() };

  const dir = join(homedir(), ".hexagent");
  mkdirSync(dir, { recursive: true });

  const path = join(dir, "squadron.db");
  const db = new Database(path);
  db.exec(SCHEMA_SQL);

  // M6 migration: add movement_enabled column to existing DBs that predate it.
  const hasMoveCol = db
    .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('agents') WHERE name = 'movement_enabled'")
    .get() as { n: number };
  if (hasMoveCol.n === 0) {
    db.exec("ALTER TABLE agents ADD COLUMN movement_enabled INTEGER NOT NULL DEFAULT 0");
  }

  // Record schema versions (cheap insurance for future migrations).
  const nowIso = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, ?)`).run(nowIso);
  db.prepare(`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, ?)`).run(nowIso);
  db.prepare(`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (3, ?)`).run(nowIso);

  const stmts: Statements = {
    insertAgent: db.prepare(
      `INSERT INTO agents
        (id, name, glyph, color, status, state, model, system_prompt, session_id,
         position_q, position_r, vault, movement_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    deleteAgent:        db.prepare(`DELETE FROM agents WHERE id = ?`),
    getAgents:          db.prepare(`SELECT * FROM agents ORDER BY created_at ASC`),
    getAgentById:       db.prepare(`SELECT * FROM agents WHERE id = ?`),
    getLiveAgents:      db.prepare(`SELECT * FROM agents WHERE status = 'Live' ORDER BY created_at ASC`),
    setStatus:          db.prepare(`UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`),
    setState:           db.prepare(`UPDATE agents SET state = ?, updated_at = ? WHERE id = ?`),
    setSessionId:       db.prepare(`UPDATE agents SET session_id = ?, updated_at = ? WHERE id = ?`),
    insertMessage:      db.prepare(
      `INSERT INTO messages (agent_id, side, who, text, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ),
    getMessagesByAgent: db.prepare(
      `SELECT * FROM messages WHERE agent_id = ? ORDER BY id ASC`
    ),
    getAllMessages:     db.prepare(`SELECT * FROM messages ORDER BY agent_id, id ASC`),
    getAgentTelemetry:  db.prepare(`SELECT COUNT(*) AS msgs, MAX(created_at) AS lastAt FROM messages WHERE agent_id = ?`),

    // M3 — features
    upsertFeature: db.prepare(
      `INSERT INTO world_features (q, r, kind, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(q, r) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`
    ),
    deleteFeature: db.prepare(`DELETE FROM world_features WHERE q = ? AND r = ?`),
    getFeatures:   db.prepare(`SELECT * FROM world_features ORDER BY created_at ASC`),

    // M3 — inter-agent messages
    insertInterAgentMessage: db.prepare(
      `INSERT INTO inter_agent_messages (from_agent_id, to_agent_id, text, created_at)
       VALUES (?, ?, ?, ?)`
    ),
    getAllInterAgentMessages: db.prepare(
      `SELECT * FROM inter_agent_messages ORDER BY id ASC`
    ),
    getPendingInterAgentMessagesFor: db.prepare(
      `SELECT * FROM inter_agent_messages WHERE to_agent_id = ? AND delivered_at IS NULL ORDER BY id ASC`
    ),
    markInterAgentMessageDelivered: db.prepare(
      `UPDATE inter_agent_messages SET delivered_at = ? WHERE id = ?`
    ),
  };

  _db = db;
  _stmts = stmts;
  return { db, stmts, path };
}

export function getDbPath(): string {
  return join(homedir(), ".hexagent", "squadron.db");
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _stmts = null;
  }
}

/**
 * Row → camelCase object for the WS protocol layer.
 * Keeps the protocol clean while the DB stays SQL-idiomatic.
 */
export interface AgentDto {
  id: string;
  name: string;
  glyph: string;
  color: string;
  status: AgentStatus;
  state: AgentState;
  model: string | null;
  systemPrompt: string;
  sessionId: string | null;
  q: number;
  r: number;
  vault: string;
  /** M6: per-agent movement permission. Default false. */
  movementEnabled: boolean;
  /** M3: list of `.md` files in the agent's vault. Populated by world.ts. */
  vaultFiles?: string[];
  /** M3+: wikilink edges parsed from vault contents. `[fromFile, toFile]`,
   *  filename-relative (`.md` suffix included). Populated by world.ts. */
  vaultEdges?: [string, string][];
  /** Cheap telemetry computed on every DTO build. */
  msgs?: number;
  lastAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDto {
  id: number;
  agentId: string;
  side: "you" | "them" | "sys";
  who: string | null;
  text: string;
  createdAt: string;
}

export function rowToAgentDto(r: AgentRow): AgentDto {
  return {
    id: r.id,
    name: r.name,
    glyph: r.glyph,
    color: r.color,
    status: r.status,
    state: r.state,
    model: r.model,
    systemPrompt: r.system_prompt,
    sessionId: r.session_id,
    q: r.position_q,
    r: r.position_r,
    vault: r.vault,
    movementEnabled: !!r.movement_enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToMessageDto(r: MessageRow): MessageDto {
  return {
    id: r.id,
    agentId: r.agent_id,
    side: r.side,
    who: r.who,
    text: r.text,
    createdAt: r.created_at,
  };
}
