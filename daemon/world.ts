// World-level CRUD over the SQLite layer. Server.ts subscribes to events
// emitted from here and broadcasts them to all WS clients.

import { EventEmitter } from "node:events";
import {
  openDb,
  rowToAgentDto,
  rowToMessageDto,
  type AgentDto,
  type AgentRow,
  type AgentState,
  type AgentStatus,
  type FeatureKind,
  type FeatureRow,
  type InterAgentMessageRow,
  type MessageDto,
  type Statements,
} from "./db.ts";
import { ensureVaultDir, listVaultFiles, parseVaultEdges, writeIdentityFile } from "./vault.ts";

// Pointy-top axial neighbor offsets — same as frontend hex math.
const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [+1, 0], [+1, -1], [0, -1], [-1, 0], [-1, +1], [0, +1],
];
const hexKey = (q: number, r: number) => `${q},${r}`;
const hexAdjacent = (a: { q: number; r: number }, b: { q: number; r: number }) =>
  HEX_DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);

/** Result of a path query. `path` excludes the start hex; the last element is
 *  the chosen goal hex (which is adjacent to the target agent). */
export interface PathResult {
  ok: boolean;
  path?: Array<{ q: number; r: number }>;
  reason?: string;
}

const PALETTE = [
  "#e6c068", // amber
  "#7fb6d9", // sky
  "#a89be0", // violet
  "#9bd1a4", // sage
  "#e89c7f", // peach
  "#d9a3c9", // mauve
  "#c8c8b8", // bone
  "#7fa8a8", // teal
];

const NAMES = [
  "Atlas", "Mercury", "Onyx", "Vesper", "Lyra", "Halcyon", "Rune", "Solace",
  "Perseus", "Jasper", "Sable", "Rigel", "Cinder", "Athena", "Loki", "Pyrite",
  "Nimbus", "Quartz", "Thorne", "Echo", "Auric", "Tundra", "Brass", "Ember",
  "Cipher", "Wren", "Junip", "Vela", "Quill", "Stellan",
];

export interface CreateAgentInput {
  name?: string;
  glyph?: string;
  color?: string;
  q?: number;
  r?: number;
  systemPrompt?: string;
  model?: string;
}

export type AgentPatch = Partial<{
  name: string;
  glyph: string;
  color: string;
  systemPrompt: string;
  model: string | null;
  q: number;
  r: number;
  status: AgentStatus;
  state: AgentState;
  sessionId: string | null;
  movementEnabled: boolean;
}>;

export interface AppendMessageInput {
  side: "you" | "them" | "sys";
  who?: string | null;
  text: string;
}

export interface FeatureDto {
  q: number;
  r: number;
  kind: FeatureKind;
}

export interface InterAgentMessageDto {
  id: number;
  fromAgentId: string;
  toAgentId: string;
  text: string;
  createdAt: string;
}

function rowToFeatureDto(r: FeatureRow): FeatureDto {
  return { q: r.q, r: r.r, kind: r.kind };
}
function rowToInterAgentMessageDto(r: InterAgentMessageRow): InterAgentMessageDto {
  return {
    id: r.id,
    fromAgentId: r.from_agent_id,
    toAgentId:   r.to_agent_id,
    text:        r.text,
    createdAt:   r.created_at,
  };
}

export interface WorldEvents {
  "agent-created":   (a: AgentDto) => void;
  "agent-updated":   (a: AgentDto) => void;
  "agent-deleted":   (id: string) => void;
  "message-appended": (m: MessageDto) => void;
  "feature-placed":  (f: FeatureDto) => void;
  "feature-removed": (q: number, r: number) => void;
  "inter-agent-message-appended": (m: InterAgentMessageDto) => void;
}

/**
 * Single source of truth for agents and messages.
 * server.ts holds one instance; UI reflects whatever this emits.
 */
export class World extends EventEmitter {
  private readonly stmts: Statements;

  constructor() {
    super();
    const { stmts } = openDb();
    this.stmts = stmts;
  }

  // ---------- queries ----------

  agents(): AgentDto[] {
    return this.stmts.getAgents.all().map((r) => this.attachVaultFiles(rowToAgentDto(r)));
  }

  agent(id: string): AgentDto | null {
    const row = this.stmts.getAgentById.get(id);
    return row ? this.attachVaultFiles(rowToAgentDto(row)) : null;
  }

  liveAgents(): AgentDto[] {
    return this.stmts.getLiveAgents.all().map((r) => this.attachVaultFiles(rowToAgentDto(r)));
  }

  features(): FeatureDto[] {
    return this.stmts.getFeatures.all().map(rowToFeatureDto);
  }

  interAgentMessages(): InterAgentMessageDto[] {
    return this.stmts.getAllInterAgentMessages.all().map(rowToInterAgentMessageDto);
  }

  pendingInterAgentMessagesFor(agentId: string): InterAgentMessageDto[] {
    return this.stmts.getPendingInterAgentMessagesFor.all(agentId).map(rowToInterAgentMessageDto);
  }

  /**
   * Compute the set of agentIds the given agent can talk to / read vaults from.
   * Direct hex-adjacency OR same router cluster (BFS over router-router adjacency,
   * walls don't block — they just keep agents apart). Mirrors the frontend logic.
   */
  connectedAgents(agentId: string): Set<string> {
    const me = this.agent(agentId);
    if (!me) return new Set();

    const allAgents = this.agents();
    const routerSet = new Set(
      this.features().filter((f) => f.kind === "router").map((f) => hexKey(f.q, f.r))
    );
    const out = new Set<string>();

    for (const o of allAgents) {
      if (o.id === me.id) continue;
      if (hexAdjacent(me, o)) out.add(o.id);
    }

    // Router clusters
    if (routerSet.size > 0) {
      const clusterOf = new Map<string, number>();
      let cid = 0;
      for (const f of this.features()) {
        if (f.kind !== "router") continue;
        const startKey = hexKey(f.q, f.r);
        if (clusterOf.has(startKey)) continue;
        const queue: Array<{ q: number; r: number }> = [f];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          const ck = hexKey(cur.q, cur.r);
          if (clusterOf.has(ck)) continue;
          clusterOf.set(ck, cid);
          for (const [dq, dr] of HEX_DIRS) {
            const nk = hexKey(cur.q + dq, cur.r + dr);
            if (routerSet.has(nk) && !clusterOf.has(nk)) {
              queue.push({ q: cur.q + dq, r: cur.r + dr });
            }
          }
        }
        cid += 1;
      }
      // Which clusters does `me` touch?
      const myClusters = new Set<number>();
      for (const f of this.features()) {
        if (f.kind !== "router") continue;
        if (hexAdjacent(me, { q: f.q, r: f.r })) {
          const c = clusterOf.get(hexKey(f.q, f.r));
          if (c !== undefined) myClusters.add(c);
        }
      }
      // Other agents touching any of my clusters → connected.
      if (myClusters.size > 0) {
        for (const o of allAgents) {
          if (o.id === me.id || out.has(o.id)) continue;
          for (const f of this.features()) {
            if (f.kind !== "router") continue;
            if (hexAdjacent(o, { q: f.q, r: f.r })) {
              const c = clusterOf.get(hexKey(f.q, f.r));
              if (c !== undefined && myClusters.has(c)) {
                out.add(o.id);
                break;
              }
            }
          }
        }
      }
    }

    return out;
  }

  /**
   * Find a hex path from `(fromQ, fromR)` to a hex adjacent to the target agent,
   * obstructed by walls and other live agents. Returns up to `maxHops` steps.
   *
   * BFS over the hex graph. The goal is any hex adjacent to the target agent
   * (the agent's own hex is not a valid goal — agents can't stack).
   *
   * Routers are passable terrain (they don't block movement; they only matter
   * for adjacency-of-conversation).
   */
  findPath(
    fromQ: number,
    fromR: number,
    targetAgentId: string,
    opts: { maxHops?: number; ignoreAgentIds?: ReadonlySet<string> } = {},
  ): PathResult {
    const target = this.agent(targetAgentId);
    if (!target) return { ok: false, reason: "target agent not found" };
    if (target.q === fromQ && target.r === fromR) {
      return { ok: false, reason: "you are at the target's hex (impossible — agents can't stack)" };
    }

    const maxHops = opts.maxHops ?? 200;
    const ignore = opts.ignoreAgentIds ?? new Set<string>();

    const wallSet = new Set(
      this.features().filter((f) => f.kind === "wall").map((f) => hexKey(f.q, f.r))
    );
    const agentSet = new Set(
      this.agents()
        .filter((a) => !ignore.has(a.id))
        .map((a) => hexKey(a.q, a.r))
    );

    const goalSet = new Set<string>();
    for (const [dq, dr] of HEX_DIRS) {
      goalSet.add(hexKey(target.q + dq, target.r + dr));
    }

    // If we're already on a goal hex (i.e. already adjacent), no movement needed.
    const startKey = hexKey(fromQ, fromR);
    if (goalSet.has(startKey)) return { ok: true, path: [] };

    const came = new Map<string, { q: number; r: number; prev: string | null; depth: number }>();
    came.set(startKey, { q: fromQ, r: fromR, prev: null, depth: 0 });
    const queue: string[] = [startKey];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = came.get(cur)!;
      if (node.depth >= maxHops) continue;
      for (const [dq, dr] of HEX_DIRS) {
        const nq = node.q + dq;
        const nr = node.r + dr;
        const nk = hexKey(nq, nr);
        if (came.has(nk)) continue;
        // Walls block, and agents (incl. target) block — agents can't stack.
        if (wallSet.has(nk)) continue;
        if (agentSet.has(nk)) continue;
        came.set(nk, { q: nq, r: nr, prev: cur, depth: node.depth + 1 });
        if (goalSet.has(nk)) {
          // Reconstruct.
          const path: Array<{ q: number; r: number }> = [];
          let walk: string | null = nk;
          while (walk !== null && walk !== startKey) {
            const w: { q: number; r: number; prev: string | null; depth: number } = came.get(walk)!;
            path.unshift({ q: w.q, r: w.r });
            walk = w.prev;
          }
          return { ok: true, path };
        }
        queue.push(nk);
      }
    }

    return { ok: false, reason: "no path (blocked by walls/agents or out of range)" };
  }

  /** Cheap occupancy check used by the walking step-loop right before it commits a hop. */
  isHexBlockedForMove(q: number, r: number, movingAgentId: string): boolean {
    if (this.features().some((f) => f.q === q && f.r === r && f.kind === "wall")) return true;
    if (this.agents().some((a) => a.id !== movingAgentId && a.q === q && a.r === r)) return true;
    return false;
  }

  private attachVaultFiles(dto: AgentDto): AgentDto {
    const tel = this.stmts.getAgentTelemetry.get(dto.id);
    return {
      ...dto,
      vaultFiles: listVaultFiles(dto.id),
      vaultEdges: parseVaultEdges(dto.id),
      msgs: tel?.msgs ?? 0,
      lastAt: tel?.lastAt ?? null,
    };
  }

  messagesByAgent(): Record<string, MessageDto[]> {
    const all = this.stmts.getAllMessages.all().map(rowToMessageDto);
    const out: Record<string, MessageDto[]> = {};
    for (const m of all) {
      if (!out[m.agentId]) out[m.agentId] = [];
      out[m.agentId]!.push(m);
    }
    return out;
  }

  // ---------- mutations ----------

  createAgent(input: CreateAgentInput): AgentDto {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const all = this.agents();
    const usedColors = new Set(all.map((a) => a.color));
    const color = input.color
      ?? PALETTE.find((c) => !usedColors.has(c))
      ?? PALETTE[Math.floor(Math.random() * PALETTE.length)]!;

    // Pick a name that isn't already in use. Try the curated pool first; if every
    // name in the pool is taken, fall back to "<random base> <n>" until we find a free one.
    const usedNames = new Set(all.map((a) => a.name.toLowerCase()));
    let name = input.name?.trim();
    if (!name) {
      const pool = NAMES.filter((n) => !usedNames.has(n.toLowerCase()));
      if (pool.length > 0) {
        name = pool[Math.floor(Math.random() * pool.length)]!;
      } else {
        let i = 2;
        let candidate: string;
        do {
          const base = NAMES[Math.floor(Math.random() * NAMES.length)]!;
          candidate = `${base} ${i++}`;
        } while (usedNames.has(candidate.toLowerCase()));
        name = candidate;
      }
    }

    const row: AgentRow = {
      id,
      name,
      glyph:            input.glyph ?? "◇",
      color,
      status:           "Draft",
      state:            "idle",
      model:            input.model ?? null,
      system_prompt:    input.systemPrompt ?? "",
      session_id:       null,
      position_q:       input.q ?? 0,
      position_r:       input.r ?? 0,
      vault:            name.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      movement_enabled: 0,
      created_at:       now,
      updated_at:       now,
    };

    this.stmts.insertAgent.run(
      row.id,
      row.name,
      row.glyph,
      row.color,
      row.status,
      row.state,
      row.model,
      row.system_prompt,
      row.session_id,
      row.position_q,
      row.position_r,
      row.vault,
      row.movement_enabled,
      row.created_at,
      row.updated_at,
    );
    // M3: create vault folder + seed index.md, then write the identity file.
    ensureVaultDir(row.id, row.name);
    writeIdentityFile({
      id: row.id, name: row.name, glyph: row.glyph, color: row.color,
      status: row.status, state: row.state, model: row.model,
      sessionId: row.session_id, q: row.position_q, r: row.position_r,
      systemPrompt: row.system_prompt,
    });

    const dto = this.attachVaultFiles(rowToAgentDto(row));
    this.emit("agent-created", dto);
    return dto;
  }

  /** Patch the agent. Builds a dynamic UPDATE; emits agent-updated with the fresh DTO. */
  updateAgent(id: string, patch: AgentPatch): AgentDto | null {
    const existing = this.stmts.getAgentById.get(id);
    if (!existing) return null;

    const sets: string[] = [];
    const params: unknown[] = [];

    const map: Record<keyof AgentPatch, string> = {
      name: "name",
      glyph: "glyph",
      color: "color",
      systemPrompt: "system_prompt",
      model: "model",
      q: "position_q",
      r: "position_r",
      status: "status",
      state: "state",
      sessionId: "session_id",
      movementEnabled: "movement_enabled",
    };

    for (const key of Object.keys(patch) as Array<keyof AgentPatch>) {
      const col = map[key];
      const value = patch[key];
      if (value === undefined) continue;
      sets.push(`${col} = ?`);
      // Booleans → 0/1 for sqlite. Other primitives pass through.
      params.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
    if (sets.length === 0) return rowToAgentDto(existing);

    const now = new Date().toISOString();
    sets.push("updated_at = ?");
    params.push(now);
    params.push(id);

    const sql = `UPDATE agents SET ${sets.join(", ")} WHERE id = ?`;
    // bun:sqlite supports prepare(sql).run(...params); a one-shot prepare is fine here
    // because we don't issue this in tight loops.
    openDb().db.prepare(sql).run(...(params as never[]));

    const fresh = this.stmts.getAgentById.get(id)!;
    // Re-emit identity.md whenever any identity-relevant field changed.
    const identityKeys = ["name", "glyph", "color", "systemPrompt", "model", "q", "r", "status", "state", "sessionId"];
    const touchedIdentity = (Object.keys(patch) as Array<keyof AgentPatch>).some(k => identityKeys.includes(k));
    if (touchedIdentity) {
      writeIdentityFile({
        id: fresh.id, name: fresh.name, glyph: fresh.glyph, color: fresh.color,
        status: fresh.status, state: fresh.state, model: fresh.model,
        sessionId: fresh.session_id, q: fresh.position_q, r: fresh.position_r,
        systemPrompt: fresh.system_prompt,
      });
    }
    const dto = this.attachVaultFiles(rowToAgentDto(fresh));
    this.emit("agent-updated", dto);
    return dto;
  }

  // ---------- features (walls + routers) ----------

  placeFeature(q: number, r: number, kind: FeatureKind): FeatureDto {
    const now = new Date().toISOString();
    this.stmts.upsertFeature.run(q, r, kind, now);
    const dto: FeatureDto = { q, r, kind };
    this.emit("feature-placed", dto);
    return dto;
  }

  removeFeature(q: number, r: number): boolean {
    const before = this.features().some((f) => f.q === q && f.r === r);
    if (!before) return false;
    this.stmts.deleteFeature.run(q, r);
    this.emit("feature-removed", q, r);
    return true;
  }

  // ---------- inter-agent messages ----------

  appendInterAgentMessage(fromId: string, toId: string, text: string): InterAgentMessageDto | null {
    if (!this.stmts.getAgentById.get(fromId) || !this.stmts.getAgentById.get(toId)) return null;
    const now = new Date().toISOString();
    const result = this.stmts.insertInterAgentMessage.run(fromId, toId, text, now);
    const dto: InterAgentMessageDto = {
      id: Number(result.lastInsertRowid),
      fromAgentId: fromId,
      toAgentId: toId,
      text,
      createdAt: now,
    };
    this.emit("inter-agent-message-appended", dto);
    return dto;
  }

  markInterAgentMessageDelivered(id: number): void {
    this.stmts.markInterAgentMessageDelivered.run(new Date().toISOString(), id);
  }

  deleteAgent(id: string): boolean {
    const existed = !!this.stmts.getAgentById.get(id);
    if (!existed) return false;
    this.stmts.deleteAgent.run(id);
    this.emit("agent-deleted", id);
    return true;
  }

  appendMessage(agentId: string, msg: AppendMessageInput): MessageDto | null {
    const exists = !!this.stmts.getAgentById.get(agentId);
    if (!exists) return null;
    const now = new Date().toISOString();
    const result = this.stmts.insertMessage.run(
      agentId, msg.side, msg.who ?? null, msg.text, now
    );
    const dto: MessageDto = {
      id: Number(result.lastInsertRowid),
      agentId,
      side: msg.side,
      who: msg.who ?? null,
      text: msg.text,
      createdAt: now,
    };
    this.emit("message-appended", dto);
    return dto;
  }

  /** Convenience for transitions handled by agent-worker callbacks. */
  setLive(id: string, sessionId: string): AgentDto | null {
    return this.updateAgent(id, { status: "Live", sessionId });
  }

  setDraft(id: string, opts: { clearSession?: boolean } = {}): AgentDto | null {
    return this.updateAgent(id, {
      status: "Draft",
      state: "idle",
      ...(opts.clearSession ? { sessionId: null } : {}),
    });
  }
}

// Re-export the DTOs so server/protocol can import from one place.
export type { AgentDto, MessageDto, AgentStatus, AgentState };
export type { FeatureKind } from "./db.ts";
