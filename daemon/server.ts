// Bun.serve with WebSocket upgrade on /ws.
// World state (agents + messages) lives in SQLite via World.
// Workers are DAEMON-SCOPED — agents survive WS disconnects, are addressable
// by every connected tab, and can be auto-resumed on daemon startup.
// All world deltas + subprocess events broadcast to every open client.

import type { Worker } from "./agent-worker.ts";
import { createWorker } from "./worker-factory.ts";
import { DEFAULT_OPENROUTER_MODEL, getOpenRouterConfig, setOpenRouterConfig } from "./providers.ts";
import {
  World,
  type AgentDto,
  type FeatureDto,
  type InterAgentMessageDto,
  type MessageDto,
} from "./world.ts";
import { handleMcpRequest } from "./mcp-server.ts";
import type { AgentMover } from "./world-tools.ts";
import { deleteVaultFile, installSkill, moveVaultFile, readVaultFile, uninstallSkill, workdir, writeVaultFile } from "./vault.ts";
import { isOpen as whitelistIsOpen, validate as validateWhitelistToken } from "./whitelist.ts";

// Pointy-top axial neighbor offsets — used for boot-time adjacency checks.
const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [+1,  0], [+1, -1], [ 0, -1],
  [-1,  0], [-1, +1], [ 0, +1],
];
function isAdjacent(a: { q: number; r: number }, b: { q: number; r: number }): boolean {
  return HEX_DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

/**
 * Build an augmented system prompt that gives the agent its identity and a
 * snapshot of the world at boot time. This is the M1 cheap version of agent
 * awareness — updated only on (re)boot. M3 will inject fresh world state per
 * turn via Claude Code hooks.
 */
function augmentSystemPrompt(self: AgentDto, others: AgentDto[]): string {
  const lines: string[] = [];
  lines.push(`You are "${self.name}", an autonomous agent in Squadron — a spatial multi-agent control plane.`);
  lines.push(`Your position is hex (q=${self.q}, r=${self.r}).`);

  const otherAgents = others.filter((o) => o.id !== self.id);
  if (otherAgents.length > 0) {
    lines.push("");
    lines.push("Other agents currently in this world:");
    for (const o of otherAgents) {
      lines.push(`- "${o.name}" at (q=${o.q}, r=${o.r}) — ${o.status.toLowerCase()}`);
    }

    const neighbors = otherAgents.filter((o) => isAdjacent(self, o));
    if (neighbors.length > 0) {
      lines.push("");
      lines.push("Your immediate hex neighbors (you share a hex edge with each):");
      for (const n of neighbors) lines.push(`- "${n.name}"`);
    }
  }

  lines.push("");
  const movementLine = self.movementEnabled
    ? "- move_toward(name): walk across the grid toward another agent, around walls and other agents. " +
      "Returns immediately with hop count; the daemon advances you one hex at a time and auto-prompts you on arrival. " +
      "Use this when you need to talk to someone you can't currently reach.\n"
    : "- move_toward: DISABLED for you. Movement is currently turned off in your config. If you need to reach someone you can't, ask the user to flip your Movement toggle in the right sidebar.\n";

  lines.push(
    "Tools available for spatial coordination:\n" +
    "- send_to(name, text): DM a directly-adjacent agent or one bridged via routers. The recipient sees your message prepended to their next user-prompt.\n" +
    "- read_neighbor_vault(name, path): read a file from a connected agent's vault (e.g. path='index.md').\n" +
    movementLine +
    "send_to and read_neighbor_vault are gated by adjacency (share a hex edge or be on the same router cluster). " +
    (self.movementEnabled
      ? "If they return 'not adjacent', use move_toward(name) first."
      : "If they return 'not adjacent', you must wait for someone to move you (movement is off for you).")
  );
  lines.push("");
  lines.push(
    "Your own working directory is your vault — files you create with normal filesystem tools persist there and become readable by your neighbors."
  );
  lines.push("");
  lines.push(
    "Vault layout (Karpathy LLM-Wiki pattern):\n" +
    "- index.md — your personal map; links out to all top-level areas\n" +
    "- log.md — append-only timeline of operations\n" +
    "- skills.md + skills/ — capabilities the user installed for you. **Read the relevant skill on demand** when its topic comes up; don't load all skills into context preemptively\n" +
    "- entities/ — pages for people, organizations, products\n" +
    "- concepts/ — ideas, frameworks, theories\n" +
    "- sources/ — one summary per ingested document; raw originals live in raw/documents/\n" +
    "- synthesis/ — cross-cutting analysis combining multiple sources/entities\n" +
    "Distil information UP the stack (raw → sources → entities/concepts → synthesis) as evidence accumulates. Don't bloat the wiki with unprocessed text."
  );

  if (self.systemPrompt && self.systemPrompt.trim().length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(self.systemPrompt);
  }

  return lines.join("\n");
}
import {
  isClientToDaemon,
  type ClientToDaemon,
  type DaemonToClient,
} from "./protocol.ts";

interface ConnState {
  /* M1: empty — workers and agents both live at daemon scope. */
}

export interface StartServerOptions {
  host: string;
  port: number;
}

export interface RunningServer {
  server: ReturnType<typeof Bun.serve>;
  killAll: () => void;
  world: World;
  /** Boot a worker for a given agent id. Used by index.ts to restore Live agents on cold start. */
  bootAgent: (agentId: string) => boolean;
}

export function startServer(opts: StartServerOptions): RunningServer {
  const world = new World();

  /** All open WS connections — used for world / subprocess event broadcasts. */
  const conns = new Set<Bun.ServerWebSocket<ConnState>>();
  /** Live workers by agentId. One worker per agent at most, daemon-scoped. */
  const workers = new Map<string, Worker>();

  // ---- M3.5: autonomous-wakeup state ----
  /** Master toggle; the top-bar kill switch flips this. */
  let autonomyEnabled = true;
  /** Consecutive auto-turns per sorted pair "<a>|<b>". Reset on any user manual prompt to either agent. */
  const pairAutoCount = new Map<string, number>();
  /** Last auto-trigger timestamp per pair (ms epoch) — for throttle. */
  const pairLastAt = new Map<string, number>();
  const PAIR_BUDGET = 4;            // hard-cap consecutive auto-turns per pair
  const PAIR_THROTTLE_MS = 1500;

  const pairKeyFor = (a: string, b: string) => [a, b].sort().join("|");

  /**
   * What the agent last "saw" of the world (identity + reachable peers).
   * Per-turn we recompute and only inject a delta block when something changed —
   * keeps prompt bloat down while ensuring the agent always learns about
   * renames / new neighbors / topology shifts before its next turn.
   *
   * This is the M3.5-era stand-in for the M4 `UserPromptSubmit` hook, which will
   * inject world state on every turn through Claude Code's hook mechanism.
   */
  const lastWorldSeenBy = new Map<string, string>();

  function worldSnapshotFor(agentId: string): {
    summary: string; humanNote: string;
  } {
    const me = world.agent(agentId);
    if (!me) return { summary: "", humanNote: "" };
    const others = world.agents().filter(o => o.id !== me.id);
    const reachableIds = world.connectedAgents(me.id);
    const reachable = others.filter(o => reachableIds.has(o.id));

    const fingerprint = JSON.stringify({
      n: me.name, g: me.glyph, c: me.color, q: me.q, r: me.r,
      sp: me.systemPrompt,
      o: others.map(o => ({ n: o.name, q: o.q, r: o.r, s: o.status })),
      rch: reachable.map(o => o.name).sort(),
    });

    const lines: string[] = [];
    lines.push("[World update — current as of this turn:");
    lines.push(`- You are "${me.name}" at hex (q=${me.q}, r=${me.r}). Status: ${me.status.toLowerCase()}.`);
    if (others.length === 0) {
      lines.push("- No other agents in this world right now.");
    } else {
      lines.push(`- Other agents in this world (${others.length}):`);
      for (const o of others) {
        lines.push(`  · "${o.name}" at (q=${o.q}, r=${o.r}) — ${o.status.toLowerCase()}`);
      }
      if (reachable.length === 0) {
        lines.push("- You can't currently reach any of them (no shared edge or router cluster). Move closer or place routers to bridge.");
      } else {
        lines.push(`- Reachable right now via send_to / read_neighbor_vault: ${reachable.map(o => `"${o.name}"`).join(", ")}.`);
      }
    }
    lines.push("- Your own canonical identity is also written to identity.md in your vault. If anything seems off, re-read it.");
    lines.push("]");

    return { summary: fingerprint, humanNote: lines.join("\n") };
  }

  /** Returns the world note ONLY if anything changed since this agent's last seen state. */
  function worldNoteIfChanged(agentId: string): string {
    const { summary, humanNote } = worldSnapshotFor(agentId);
    if (!summary) return "";
    const last = lastWorldSeenBy.get(agentId);
    if (last === summary) return "";
    lastWorldSeenBy.set(agentId, summary);
    return humanNote + "\n\n";
  }

  function broadcast(event: DaemonToClient): void {
    const data = JSON.stringify(event);
    for (const ws of conns) {
      try {
        ws.send(data);
      } catch {
        /* close handler will clean up */
      }
    }
  }

  // World events → broadcast to every connected client.
  world.on("agent-created", (a: AgentDto) => broadcast({ type: "agent-created", agent: a }));
  world.on("agent-updated", (a: AgentDto) => broadcast({ type: "agent-updated", agent: a }));
  world.on("agent-deleted", (id: string)  => broadcast({ type: "agent-deleted", agentId: id }));
  world.on("message-appended", (m: MessageDto) =>
    broadcast({ type: "message-appended", message: m })
  );
  world.on("feature-placed", (f: FeatureDto) => broadcast({ type: "feature-placed", feature: f }));
  world.on("feature-removed", (q: number, r: number) =>
    broadcast({ type: "feature-removed", q, r })
  );
  world.on("inter-agent-message-appended", (m: InterAgentMessageDto) => {
    broadcast({ type: "inter-agent-message-appended", message: m });
    // Auto-trigger the recipient if autonomy is on. Guardrails apply.
    maybeAutoTrigger(m);
  });

  /**
   * When agent A sends a message to agent B via send_to, optionally auto-prompt
   * B's subprocess so it can react without user mediation. Bounded by:
   *   - global autonomy switch
   *   - per-pair throttle (1.5s)
   *   - per-pair turn budget (4 consecutive — resets on any user manual message)
   */
  function maybeAutoTrigger(m: InterAgentMessageDto): void {
    if (!autonomyEnabled) return;

    const pairKey = pairKeyFor(m.fromAgentId, m.toAgentId);
    const now = Date.now();

    const lastAt = pairLastAt.get(pairKey) ?? 0;
    if (now - lastAt < PAIR_THROTTLE_MS) {
      log(`[auto-trigger] throttled pair=${pairKey}`);
      broadcast({ type: "auto-trigger-paused", pairKey, reason: "throttle" });
      return;
    }
    const count = pairAutoCount.get(pairKey) ?? 0;
    if (count >= PAIR_BUDGET) {
      log(`[auto-trigger] budget exhausted pair=${pairKey} (${count}/${PAIR_BUDGET})`);
      broadcast({ type: "auto-trigger-paused", pairKey, reason: "budget" });
      return;
    }

    const recipient = world.agent(m.toAgentId);
    if (!recipient) return;

    // Boot if needed (also resumes via stored sessionId).
    if (!workers.has(recipient.id)) bootAgent(recipient.id);
    const worker = workers.get(recipient.id);
    if (!worker) return;

    const fromAgent = world.agent(m.fromAgentId);
    const fromName = fromAgent?.name ?? m.fromAgentId;

    // Audit trail in the recipient's user-chat so the user can see the trigger.
    world.appendMessage(recipient.id, {
      side: "sys",
      who: "system",
      text: `auto-triggered by "${fromName}": ${m.text.slice(0, 80)}${m.text.length > 80 ? "…" : ""}`,
    });

    // Mark as delivered so the next user prompt doesn't double-deliver this message.
    world.markInterAgentMessageDelivered(m.id);

    const note = worldNoteIfChanged(recipient.id);
    const text =
      note +
      `"${fromName}" sent you a message via send_to:\n\n` +
      `> ${m.text.replace(/\n/g, "\n> ")}\n\n` +
      `Reply briefly via send_to("${fromName}", "..."). **Be terse.** One short sentence is the target — no preamble, no restating context, no filler. ` +
      `If you have nothing substantive to add, send "ack" or "noted" and stop. ` +
      `Treat this like Slack between coworkers, not an essay exchange — every auto-turn burns tokens.\n\n` +
      `(Pair budget caps the chain at ${PAIR_BUDGET} consecutive auto-turns regardless.)`;

    world.updateAgent(recipient.id, { state: "thinking" });
    worker.send(text);
    pairAutoCount.set(pairKey, count + 1);
    pairLastAt.set(pairKey, now);
    log(`[auto-trigger] pair=${pairKey} ${count + 1}/${PAIR_BUDGET}`);
  }

  /** Reset the auto-trigger budget for any pair touching this agent — user is steering again. */
  function resetPairBudgetsFor(agentId: string): void {
    const keys = Array.from(pairAutoCount.keys());
    for (const k of keys) {
      if (k.split("|").includes(agentId)) {
        pairAutoCount.delete(k);
        pairLastAt.delete(k);
      }
    }
  }

  // ---- Walking (M6 — autonomous movement) ----
  /** In-flight walks. Stepping happens server-side; LLM gets one MCP-tool result + one auto-prompt on arrival.
   *  Either targetId (walk to another agent) OR targetHex (walk to a coord) is set, never both. */
  interface Walk {
    callerId: string;
    targetId?: string;
    targetHex?: { q: number; r: number };
    timer: ReturnType<typeof setTimeout> | null;
    blockedTicks: number;
  }
  const walks = new Map<string, Walk>();
  const WALK_STEP_MS = 550;     // pace per hex; tuned with the UI animation duration below
  const WALK_BLOCKED_MAX = 3;   // ~1.6s of being blocked before we give up

  /** Halt any in-flight walk for this agent. Returns true if we cancelled one. */
  function stopWalk(agentId: string, opts: { reason?: string; arrived?: boolean } = {}): boolean {
    const w = walks.get(agentId);
    if (!w) return false;
    if (w.timer) clearTimeout(w.timer);
    walks.delete(agentId);
    // Don't override state if the agent has already moved on (e.g. user message bumped it to thinking).
    const cur = world.agent(agentId);
    if (cur && cur.state === "moving") world.updateAgent(agentId, { state: "idle" });
    if (opts.reason) {
      world.appendMessage(agentId, { side: "sys", who: "system", text: opts.reason });
    }
    return true;
  }

  /** AgentMover hook — called from world-tools.ts via the MCP tool. */
  const mover: AgentMover = {
    startWalk(callerId: string, targetId: string) {
      const caller = world.agent(callerId);
      const target = world.agent(targetId);
      if (!caller || !target) return { ok: false, reason: "agent not found" };

      // Cancel any prior walk for this caller (re-target supported).
      stopWalk(callerId);

      const result = world.findPath(caller.q, caller.r, targetId, { ignoreAgentIds: new Set([callerId]) });
      if (!result.ok) return { ok: false, reason: result.reason ?? "no path" };

      const path = result.path ?? [];
      if (path.length === 0) {
        // Already adjacent.
        return { ok: true, hops: 0, etaMs: 0 };
      }

      world.updateAgent(callerId, { state: "moving" });
      const walk: Walk = { callerId, targetId, timer: null, blockedTicks: 0 };
      walks.set(callerId, walk);
      walk.timer = setTimeout(() => stepWalk(callerId), WALK_STEP_MS);
      log(`[walk] start ${caller.name} → ${target.name} (${path.length} hops)`);
      return { ok: true, hops: path.length, etaMs: path.length * WALK_STEP_MS };
    },
    startWalkToHex(callerId: string, q: number, r: number) {
      const caller = world.agent(callerId);
      if (!caller) return { ok: false, reason: "agent not found" };

      stopWalk(callerId);

      const result = world.findPathToHex(caller.q, caller.r, q, r, { ignoreAgentIds: new Set([callerId]) });
      if (!result.ok) return { ok: false, reason: result.reason ?? "no path" };

      const path = result.path ?? [];
      if (path.length === 0) {
        // Already at the destination.
        return { ok: true, hops: 0, etaMs: 0 };
      }

      world.updateAgent(callerId, { state: "moving" });
      const walk: Walk = { callerId, targetHex: { q, r }, timer: null, blockedTicks: 0 };
      walks.set(callerId, walk);
      walk.timer = setTimeout(() => stepWalk(callerId), WALK_STEP_MS);
      log(`[walk] start ${caller.name} → hex (q=${q}, r=${r}) (${path.length} hops)`);
      return { ok: true, hops: path.length, etaMs: path.length * WALK_STEP_MS };
    },
  };

  /** Advance one hex along the path, then schedule the next step. Re-paths every tick. */
  function stepWalk(agentId: string): void {
    const walk = walks.get(agentId);
    if (!walk) return;
    const caller = world.agent(agentId);
    if (!caller) return;

    // Hex-coord walk path — separate logic since there's no target agent and
    // arrival is "we're standing on the destination hex" rather than adjacent.
    if (walk.targetHex) {
      const t = walk.targetHex;
      if (caller.q === t.q && caller.r === t.r) {
        onArrivedHex(agentId, t.q, t.r);
        return;
      }
      const result = world.findPathToHex(caller.q, caller.r, t.q, t.r, { ignoreAgentIds: new Set([agentId]) });
      if (!result.ok || !result.path || result.path.length === 0) {
        stopWalk(agentId, { reason: `[Walk halted at hex (q=${caller.q}, r=${caller.r}): ${result.reason ?? "no path"}.]` });
        return;
      }
      const next = result.path[0]!;
      if (world.isHexBlockedForMove(next.q, next.r, agentId)) {
        walk.blockedTicks += 1;
        if (walk.blockedTicks >= WALK_BLOCKED_MAX) {
          stopWalk(agentId, { reason: `[Walk halted at hex (q=${caller.q}, r=${caller.r}): next hex blocked too long.]` });
          return;
        }
        walk.timer = setTimeout(() => stepWalk(agentId), WALK_STEP_MS);
        return;
      }
      walk.blockedTicks = 0;
      world.updateAgent(agentId, { q: next.q, r: next.r, state: "moving" });
      walk.timer = setTimeout(() => stepWalk(agentId), WALK_STEP_MS);
      return;
    }

    // Default: walk-to-agent path.
    const target = walk.targetId ? world.agent(walk.targetId) : null;
    if (!target) {
      stopWalk(agentId, { reason: "[Walk halted: target agent no longer exists.]" });
      return;
    }

    // Already adjacent → arrival.
    const adjOffsets = [[+1, 0], [+1, -1], [0, -1], [-1, 0], [-1, +1], [0, +1]];
    const adjacent = adjOffsets.some(([dq, dr]) => caller.q + dq === target.q && caller.r + dr === target.r);
    if (adjacent) {
      onArrived(agentId, walk.targetId!);
      return;
    }

    // Re-path every tick (cheap; handles target moving and walls placed mid-walk).
    const result = world.findPath(caller.q, caller.r, walk.targetId!, { ignoreAgentIds: new Set([agentId]) });
    if (!result.ok || !result.path || result.path.length === 0) {
      stopWalk(agentId, { reason: `[Walk halted at hex (q=${caller.q}, r=${caller.r}): ${result.reason ?? "no path"}.]` });
      return;
    }

    const next = result.path[0]!;
    if (world.isHexBlockedForMove(next.q, next.r, agentId)) {
      walk.blockedTicks += 1;
      if (walk.blockedTicks >= WALK_BLOCKED_MAX) {
        stopWalk(agentId, { reason: `[Walk halted at hex (q=${caller.q}, r=${caller.r}): next hex blocked too long.]` });
        return;
      }
      walk.timer = setTimeout(() => stepWalk(agentId), WALK_STEP_MS);
      return;
    }

    walk.blockedTicks = 0;
    world.updateAgent(agentId, { q: next.q, r: next.r, state: "moving" });
    walk.timer = setTimeout(() => stepWalk(agentId), WALK_STEP_MS);
  }

  /** Hex-coord arrival: just stop and log. No auto-prompt — there's no other agent to interact with. */
  function onArrivedHex(agentId: string, q: number, r: number): void {
    const caller = world.agent(agentId);
    walks.delete(agentId);
    world.updateAgent(agentId, { state: "idle" });
    if (!caller) return;
    world.appendMessage(agentId, {
      side: "sys",
      who: "system",
      text: `arrived at hex (q=${q}, r=${r})`,
    });
    log(`[walk] arrived ${caller.name} → hex (q=${q}, r=${r})`);
  }

  /** Walker landed adjacent to target. Auto-prompt the agent to actually start the conversation. */
  function onArrived(agentId: string, targetId: string): void {
    const caller = world.agent(agentId);
    const target = world.agent(targetId);
    walks.delete(agentId);
    world.updateAgent(agentId, { state: "idle" });
    if (!caller || !target) return;
    world.appendMessage(agentId, {
      side: "sys",
      who: "system",
      text: `arrived at hex (q=${caller.q}, r=${caller.r}) — adjacent to "${target.name}"`,
    });
    log(`[walk] arrived ${caller.name} → ${target.name}`);

    // Auto-prompt the agent to start the conversation. Reuses the auto-trigger
    // flow without burning the per-pair budget (the conversation hasn't started
    // yet — this prompt initiates it).
    if (!autonomyEnabled) return;
    if (!workers.has(agentId)) bootAgent(agentId);
    const worker = workers.get(agentId);
    if (!worker) return;
    const note = worldNoteIfChanged(agentId);
    const text =
      note +
      `You arrived adjacent to "${target.name}". Now start the conversation: ` +
      `call send_to("${target.name}", "...") with whatever you came here to say. ` +
      `Be terse — one short sentence is the target.`;
    world.updateAgent(agentId, { state: "thinking" });
    worker.send(text);
  }

  /** Boot a worker for an existing agent. Returns true if a new worker was started. */
  function bootAgent(agentId: string): boolean {
    if (workers.has(agentId)) return false;
    const dto = world.agent(agentId);
    if (!dto) return false;

    const augmentedPrompt = augmentSystemPrompt(dto, world.agents());

    // M3: build MCP config so claude's session can call our world-tools.
    const mcpUrl = `http://${opts.host}:${opts.port}/mcp/agent/${encodeURIComponent(agentId)}`;
    const mcpConfigJson = JSON.stringify({
      mcpServers: {
        squadron: { type: "http", url: mcpUrl },
      },
    });

    // M-MultiModel phase 1: dispatch worker construction through the factory.
    // Hard-coded "claude" until per-agent provider selection lands (the agent
    // DTO will gain a `provider` field; for now everyone uses claude).
    const worker: Worker = createWorker("claude", {
      id: dto.id,
      name: dto.name,
      systemPrompt: augmentedPrompt,
      // Resume if we have a session id from a prior run; otherwise let claude pick a fresh uuid.
      resumeSessionId: dto.sessionId ?? undefined,
      mcpConfigJson,
      cwd: workdir(dto.id),
      onEvent: (e) => {
        broadcast({ type: "agent-event", agentId, event: e });
        // On system/init: capture session id, flip status to Live.
        const ev = e as Record<string, unknown> | null;
        if (ev && ev.type === "system" && (ev as { subtype?: string }).subtype === "init") {
          const sid = (ev as { session_id?: unknown }).session_id;
          if (typeof sid === "string") {
            world.setLive(agentId, sid);
          } else {
            world.updateAgent(agentId, { status: "Live", state: "thinking" });
          }
        }
      },
      onResult: (text) => {
        // Refetch DTO so renames since boot land in the persisted message.
        const fresh = world.agent(agentId);
        const who = (fresh?.name) ?? dto.name;
        // Only persist a chat row when the assistant actually wrote text for
        // the user. A turn consisting entirely of tool calls (e.g. send_to to
        // another agent) returns a result event with empty `result` — those
        // shouldn't surface as empty bubbles in the user's DM; the inter-agent
        // chat already carries the real content.
        if (text && text.trim().length > 0) {
          world.appendMessage(agentId, { side: "them", who, text });
        }
        world.updateAgent(agentId, { state: "idle" });
      },
      onStderr: (line) => broadcast({ type: "agent-stderr", agentId, line }),
      onError:  (err)  => broadcast({ type: "agent-error",  agentId, error: err }),
      onExit:   (code) => {
        broadcast({ type: "agent-exited", agentId, exitCode: code });
        workers.delete(agentId);
        // The subprocess can exit between turns (claude -p semantics). The agent
        // is still "Live" semantically — its session UUID is preserved and the
        // next send-message auto-boots a new subprocess via `--resume`. We just
        // park the runtime state as 'idle' so the breathing animation stops.
        world.updateAgent(agentId, { state: "idle" });
      },
    });

    workers.set(agentId, worker);
    worker.start();
    broadcast({ type: "agent-spawned", agentId, sessionId: dto.sessionId });
    log(`[boot] ${agentId} (${dto.name}) ${dto.sessionId ? "[resume]" : "[fresh]"}`);
    return true;
  }

  const server = Bun.serve<ConnState>({
    hostname: opts.host,
    port: opts.port,

    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        // Whitelist gate. Token is read from `?token=<value>`. If the whitelist
        // file is empty/missing, every connection is allowed (open mode).
        const presented = url.searchParams.get("token");
        const auth = validateWhitelistToken(presented);
        if (!auth.ok) {
          log(`[ws] reject — invalid token (whitelist gated)`);
          return new Response("unauthorized", { status: 401 });
        }
        const upgraded = server.upgrade(req, { data: {} satisfies ConnState });
        if (upgraded) return undefined;
        return new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/" || url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "squadron-daemon",
            agents: world.agents().length,
            workers: workers.size,
            features: world.features().length,
            whitelistOpen: whitelistIsOpen(),
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
      // M3: MCP endpoints — /mcp/agent/<id>
      // Same whitelist gate as the WS upgrade. In OPEN mode (no tokens
      // configured) `validateWhitelistToken` returns ok=true so local-only
      // setups keep working without ceremony. In GATED mode the request must
      // carry ?token=<one-of-them>. Loopback callers (the local claude
      // subprocess on this machine) are exempt — without that exemption the
      // agent's own MCP tool calls would 401 the moment whitelist gating
      // turns on. The exemption is safe because the daemon binds 127.0.0.1
      // only; the only way to reach loopback from outside is via the
      // cloudflared tunnel (which terminates with a non-loopback peer IP).
      if (url.pathname.startsWith("/mcp/")) {
        const peer = server.requestIP(req);
        const isLoopback = peer && (peer.address === "127.0.0.1" || peer.address === "::1");
        if (!isLoopback) {
          const mcpToken = url.searchParams.get("token");
          const mcpAuth = validateWhitelistToken(mcpToken);
          if (!mcpAuth.ok) {
            return new Response("unauthorized", { status: 401 });
          }
        }
      }
      const mcpResp = await handleMcpRequest(req, world, mover);
      if (mcpResp) return mcpResp;
      return new Response("not found", { status: 404 });
    },

    websocket: {
      open(ws) {
        conns.add(ws);
        log(`[ws] open  (clients=${conns.size})`);
      },

      message(ws, raw) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        } catch (err) {
          log(`[ws] dropped non-JSON: ${err}`);
          return;
        }
        if (!isClientToDaemon(parsed)) {
          log(`[ws] dropped unknown event: ${JSON.stringify(parsed).slice(0, 120)}`);
          return;
        }
        handleClientEvent(ws, parsed);
      },

      close(ws) {
        conns.delete(ws);
        log(`[ws] close (clients=${conns.size})`);
        // Workers stay running — they're daemon-scoped, not connection-scoped.
      },
    },
  });

  function handleClientEvent(
    ws: Bun.ServerWebSocket<ConnState>,
    event: ClientToDaemon
  ): void {
    switch (event.type) {
      case "world-subscribe": {
        const snapshot: DaemonToClient = {
          type: "world-snapshot",
          agents: world.agents(),
          messages: world.messagesByAgent(),
          features: world.features(),
          interAgentMessages: world.interAgentMessages(),
          autonomyEnabled,
        };
        sendOne(ws, snapshot);
        log(`[ws] world-subscribe → snapshot (${snapshot.agents.length} agents, ${snapshot.features.length} features, ${workers.size} workers, autonomy=${autonomyEnabled})`);
        return;
      }

      case "place-feature": {
        const f = world.placeFeature(event.q, event.r, event.kind);
        log(`[ws] place-feature ${event.kind} (${event.q},${event.r})`);
        return;
      }
      case "remove-feature": {
        const ok = world.removeFeature(event.q, event.r);
        if (!ok) sendOne(ws, { type: "agent-error", agentId: "", error: "no feature at that hex" });
        log(`[ws] remove-feature (${event.q},${event.r}) ${ok ? "ok" : "miss"}`);
        return;
      }

      case "set-autonomy": {
        autonomyEnabled = !!event.enabled;
        // Reset all pair budgets when re-enabling so the chain doesn't immediately re-pause.
        if (autonomyEnabled) {
          pairAutoCount.clear();
          pairLastAt.clear();
        }
        broadcast({ type: "autonomy-changed", enabled: autonomyEnabled });
        log(`[ws] set-autonomy → ${autonomyEnabled}`);
        return;
      }

      case "read-vault-file": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "vault-file-content", agentId: event.agentId, path: event.path, content: null, error: "no such agent" });
          return;
        }
        const content = readVaultFile(event.agentId, event.path);
        sendOne(ws, {
          type: "vault-file-content",
          agentId: event.agentId,
          path: event.path,
          content,
          error: content === null ? "file not found or path rejected" : undefined,
        });
        return;
      }

      case "write-vault-file": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "vault-file-written", agentId: event.agentId, path: event.path, ok: false, error: "no such agent" });
          return;
        }
        const ok = writeVaultFile(event.agentId, event.path, event.content);
        // Broadcast (not just sendOne) — multi-tab sees the write reflected.
        broadcast({ type: "vault-file-written", agentId: event.agentId, path: event.path, ok, error: ok ? undefined : "write rejected (path or filesystem error)" });
        if (ok) {
          // Re-broadcast the agent DTO so vaultFiles refreshes (memory graph picks up new files).
          const fresh = world.agent(event.agentId);
          if (fresh) broadcast({ type: "agent-updated", agent: fresh });
          // Also broadcast the new content to all clients so other tabs editing the same file see it.
          broadcast({ type: "vault-file-content", agentId: event.agentId, path: event.path, content: event.content });
        }
        log(`[ws] write-vault-file ${event.agentId} ${event.path} ${ok ? "ok" : "fail"}`);
        return;
      }

      case "delete-vault-file": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "vault-file-deleted", agentId: event.agentId, path: event.path, ok: false, error: "no such agent" });
          return;
        }
        const ok = deleteVaultFile(event.agentId, event.path);
        broadcast({ type: "vault-file-deleted", agentId: event.agentId, path: event.path, ok, error: ok ? undefined : "delete rejected (identity.md is daemon-managed, or file not found)" });
        if (ok) {
          // Re-broadcast the agent DTO so vaultFiles + vaultEdges refresh on all clients.
          const fresh = world.agent(event.agentId);
          if (fresh) broadcast({ type: "agent-updated", agent: fresh });
        }
        log(`[ws] delete-vault-file ${event.agentId} ${event.path} ${ok ? "ok" : "fail"}`);
        return;
      }

      case "install-skill": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "skill-installed", agentId: event.agentId, name: event.name, ok: false, error: "no such agent" });
          return;
        }
        const result = installSkill(event.agentId, event.name, event.content);
        broadcast({ type: "skill-installed", agentId: event.agentId, name: result.name ?? event.name, ok: result.ok, error: result.error });
        if (result.ok) {
          // Refresh vault DTO so frontend picks up the new file + edges.
          const fresh = world.agent(event.agentId);
          if (fresh) broadcast({ type: "agent-updated", agent: fresh });
        }
        log(`[ws] install-skill ${event.agentId} ${event.name} ${result.ok ? "ok" : "fail:" + result.error}`);
        return;
      }
      case "uninstall-skill": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "skill-uninstalled", agentId: event.agentId, name: event.name, ok: false, error: "no such agent" });
          return;
        }
        const result = uninstallSkill(event.agentId, event.name);
        broadcast({ type: "skill-uninstalled", agentId: event.agentId, name: result.name ?? event.name, ok: result.ok, error: result.error });
        if (result.ok) {
          const fresh = world.agent(event.agentId);
          if (fresh) broadcast({ type: "agent-updated", agent: fresh });
        }
        log(`[ws] uninstall-skill ${event.agentId} ${event.name} ${result.ok ? "ok" : "fail:" + result.error}`);
        return;
      }

      case "set-openrouter-config": {
        try {
          if (!event.apiKey || typeof event.apiKey !== "string" || event.apiKey.trim().length < 10) {
            sendOne(ws, { type: "openrouter-config-saved", ok: false, error: "apiKey missing or too short" });
            return;
          }
          setOpenRouterConfig({
            apiKey: event.apiKey.trim(),
            model: typeof event.model === "string" && event.model.trim() ? event.model.trim() : DEFAULT_OPENROUTER_MODEL,
          });
          sendOne(ws, { type: "openrouter-config-saved", ok: true });
          // Re-broadcast updated status so all clients can refresh their UI.
          broadcast({
            type: "providers-status",
            openrouter: { configured: true, model: getOpenRouterConfig()?.model },
          });
          log(`[ws] set-openrouter-config saved (model=${getOpenRouterConfig()?.model})`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sendOne(ws, { type: "openrouter-config-saved", ok: false, error: msg });
        }
        return;
      }

      case "get-providers-status": {
        const or = getOpenRouterConfig();
        sendOne(ws, {
          type: "providers-status",
          openrouter: { configured: !!or, model: or?.model },
        });
        return;
      }

      case "move-vault-file": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "vault-file-moved", agentId: event.agentId, oldPath: event.oldPath, newPath: event.newPath, ok: false, error: "no such agent" });
          return;
        }
        const result = moveVaultFile(event.agentId, event.oldPath, event.newPath);
        broadcast({
          type: "vault-file-moved",
          agentId: event.agentId,
          oldPath: event.oldPath,
          newPath: event.newPath,
          ok: result.ok,
          error: result.error,
        });
        if (result.ok) {
          const fresh = world.agent(event.agentId);
          if (fresh) broadcast({ type: "agent-updated", agent: fresh });
        }
        log(`[ws] move-vault-file ${event.agentId} ${event.oldPath} -> ${event.newPath} ${result.ok ? "ok" : "fail"}`);
        return;
      }

      case "create-agent": {
        const agent = world.createAgent({
          name:         event.name,
          glyph:        event.glyph,
          color:        event.color,
          q:            event.q,
          r:            event.r,
          systemPrompt: event.systemPrompt,
          model:        event.model,
        });
        log(`[ws] create-agent → ${agent.id} (${agent.name})`);
        return;
      }

      case "update-agent": {
        const agent = world.updateAgent(event.agentId, event.patch);
        if (!agent) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "no such agent" });
          return;
        }
        // M6: if the user just turned movement OFF, halt any in-flight walk.
        if (event.patch.movementEnabled === false) {
          stopWalk(event.agentId, { reason: "[Walk halted — movement was disabled.]" });
        }
        log(`[ws] update-agent ${event.agentId} ← ${Object.keys(event.patch).join(",")}`);
        return;
      }

      case "delete-agent": {
        const w = workers.get(event.agentId);
        if (w) {
          w.kill();
          workers.delete(event.agentId);
        }
        stopWalk(event.agentId);
        const ok = world.deleteAgent(event.agentId);
        if (!ok) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "no such agent" });
          return;
        }
        log(`[ws] delete-agent ${event.agentId}`);
        return;
      }

      case "boot-agent": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "no such agent" });
          return;
        }
        if (workers.has(event.agentId)) {
          // Already booted — confirm to caller.
          sendOne(ws, { type: "agent-spawned", agentId: event.agentId, sessionId: dto.sessionId });
          return;
        }
        bootAgent(event.agentId);
        return;
      }

      case "send-message": {
        const dto = world.agent(event.agentId);
        if (!dto) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "no such agent" });
          return;
        }
        // M3.5: a manual user prompt to either side of a pair resets that pair's
        // auto-trigger budget — the user is back at the wheel.
        resetPairBudgetsFor(event.agentId);

        // M6: a user prompt halts an in-flight walk — user is steering directly.
        stopWalk(event.agentId, { reason: "[Walk halted — user prompt received.]" });

        // Persist user message first — multi-tab + reload see it immediately.
        world.appendMessage(event.agentId, { side: "you", who: "You", text: event.text });

        // M3.5: refresh agent's world view if anything changed since last turn —
        // identity (rename/recolor), world topology (new agents, walls, routers).
        const worldNote = worldNoteIfChanged(event.agentId);

        // M3: pending inter-agent messages received since last turn → prepend
        // to the user text so claude actually sees them.
        const pending = world.pendingInterAgentMessagesFor(event.agentId);
        let textToSend = worldNote + event.text;
        if (pending.length > 0) {
          const MAX = 20;
          const shown = pending.slice(-MAX);
          const omitted = pending.length - shown.length;
          const lines: string[] = ["[Messages received from other agents since your last turn:"];
          for (const p of shown) {
            const fromAgent = world.agent(p.fromAgentId);
            const fromName = fromAgent?.name ?? p.fromAgentId;
            lines.push(`- from "${fromName}": ${p.text}`);
          }
          if (omitted > 0) lines.push(`(${omitted} earlier message${omitted === 1 ? "" : "s"} omitted)`);
          lines.push("]");
          lines.push("");
          lines.push(event.text);
          textToSend = worldNote + lines.join("\n");
          for (const p of pending) world.markInterAgentMessageDelivered(p.id);
        }

        // Auto-boot if not already running. send-message implies boot.
        if (!workers.has(event.agentId)) bootAgent(event.agentId);

        const worker = workers.get(event.agentId);
        if (!worker) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "failed to boot agent" });
          return;
        }
        world.updateAgent(event.agentId, { state: "thinking" });
        worker.send(textToSend);
        log(`[ws] send-message ${event.agentId} chars=${event.text.length}${pending.length > 0 ? ` (+${pending.length} pending)` : ""}`);
        return;
      }

      case "kill-agent": {
        stopWalk(event.agentId);
        const worker = workers.get(event.agentId);
        if (!worker) {
          sendOne(ws, { type: "agent-error", agentId: event.agentId, error: "not booted" });
          return;
        }
        worker.kill();
        log(`[ws] kill-agent ${event.agentId}`);
        return;
      }
    }
  }

  function sendOne(
    ws: Bun.ServerWebSocket<ConnState>,
    event: DaemonToClient
  ): void {
    ws.send(JSON.stringify(event));
  }

  return {
    server,
    killAll() {
      for (const w of workers.values()) w.kill();
      workers.clear();
      for (const [id] of walks) stopWalk(id);
    },
    world,
    bootAgent,
  };
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}
