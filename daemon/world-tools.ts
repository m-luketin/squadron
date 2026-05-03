// World-tool implementations: send_to, read_neighbor_vault, move_toward.
// Each takes the calling agent's id (resolved from the MCP request URL),
// the tool args, and returns a JSON result.
//
// Adjacency is gated through World.connectedAgents() which combines
// hex-direct neighbors and router-cluster bridges.
// Movement is planned via World.findPath() and executed by an AgentMover
// passed in from server.ts (the walk-loop lives there).

import { readVaultFile } from "./vault.ts";
import { World } from "./world.ts";

export interface ToolResult {
  ok: boolean;
  error?: string;
  /** For read_neighbor_vault */
  content?: string;
  /** For read_neighbor_vault — the absolute path that was read (relative to vault root) */
  path?: string;
  /** For send_to — the daemon-assigned message id */
  messageId?: number;
  /** For move_toward */
  hops?: number;
  etaMs?: number;
  walking?: boolean;
}

/** Server-side hook that actually drives the agent's step-by-step walk. */
export interface AgentMover {
  /** Start a walk from caller toward targetAgent. Returns sync feasibility check. */
  startWalk(callerId: string, targetAgentId: string): {
    ok: boolean;
    reason?: string;
    hops?: number;
    etaMs?: number;
  };
}

interface SendToArgs {
  name?: unknown;
  text?: unknown;
}
interface ReadNeighborVaultArgs {
  name?: unknown;
  path?: unknown;
}
interface MoveTowardArgs {
  name?: unknown;
}

function findAgentByName(world: World, name: string) {
  const target = name.trim().toLowerCase();
  return world.agents().find((a) => a.name.toLowerCase() === target) ?? null;
}

export function sendTo(world: World, callerId: string, args: SendToArgs): ToolResult {
  if (typeof args.name !== "string" || args.name.trim() === "") {
    return { ok: false, error: "missing or invalid 'name' argument" };
  }
  if (typeof args.text !== "string") {
    return { ok: false, error: "missing or invalid 'text' argument" };
  }

  const caller = world.agent(callerId);
  if (!caller) return { ok: false, error: "caller agent not found" };

  const target = findAgentByName(world, args.name);
  if (!target) return { ok: false, error: `no agent named "${args.name}" in this world` };
  if (target.id === caller.id) return { ok: false, error: "can't send to yourself" };

  const reachable = world.connectedAgents(callerId);
  if (!reachable.has(target.id)) {
    return {
      ok: false,
      error: `"${target.name}" is not adjacent to you and not on the same router cluster — move closer or place a router bridge`,
    };
  }

  const msg = world.appendInterAgentMessage(caller.id, target.id, args.text);
  if (!msg) return { ok: false, error: "failed to persist message" };
  return { ok: true, messageId: msg.id };
}

export function readNeighborVault(
  world: World,
  callerId: string,
  args: ReadNeighborVaultArgs
): ToolResult {
  if (typeof args.name !== "string" || args.name.trim() === "") {
    return { ok: false, error: "missing or invalid 'name' argument" };
  }
  if (typeof args.path !== "string" || args.path.trim() === "") {
    return { ok: false, error: "missing or invalid 'path' argument" };
  }

  const caller = world.agent(callerId);
  if (!caller) return { ok: false, error: "caller agent not found" };

  const target = findAgentByName(world, args.name);
  if (!target) return { ok: false, error: `no agent named "${args.name}" in this world` };
  if (target.id === caller.id) return { ok: false, error: "use your own filesystem tools to read your own vault" };

  const reachable = world.connectedAgents(callerId);
  if (!reachable.has(target.id)) {
    return {
      ok: false,
      error: `"${target.name}" is not adjacent or router-bridged — can't read their vault from here`,
    };
  }

  const content = readVaultFile(target.id, args.path);
  if (content === null) {
    return { ok: false, error: `couldn't read "${args.path}" from ${target.name}'s vault (file missing or path rejected)` };
  }
  return { ok: true, content, path: args.path };
}

export function moveToward(
  world: World,
  mover: AgentMover,
  callerId: string,
  args: MoveTowardArgs,
): ToolResult {
  if (typeof args.name !== "string" || args.name.trim() === "") {
    return { ok: false, error: "missing or invalid 'name' argument" };
  }

  const caller = world.agent(callerId);
  if (!caller) return { ok: false, error: "caller agent not found" };
  if (!caller.movementEnabled) {
    return {
      ok: false,
      error: "movement is disabled for you. The user must enable it in the right-sidebar agent config (Movement toggle) before you can walk.",
    };
  }

  const target = findAgentByName(world, args.name);
  if (!target) return { ok: false, error: `no agent named "${args.name}" in this world` };
  if (target.id === caller.id) return { ok: false, error: "you can't walk to yourself" };

  const result = mover.startWalk(caller.id, target.id);
  if (!result.ok) {
    return { ok: false, error: result.reason ?? "could not start walk" };
  }

  if ((result.hops ?? 0) === 0) {
    return {
      ok: true,
      walking: false,
      hops: 0,
      error: undefined,
    };
  }

  return {
    ok: true,
    walking: true,
    hops: result.hops,
    etaMs: result.etaMs,
  };
}

/** MCP tool catalog — exposed by mcp-server.ts at tools/list. */
export const TOOL_DEFINITIONS = [
  {
    name: "send_to",
    description:
      "Send a text message to a directly-adjacent agent (or one bridged via routers). " +
      "The recipient sees your message prepended to their next user-prompt turn.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The recipient agent's name (case-insensitive)." },
        text: { type: "string", description: "The message text." },
      },
      required: ["name", "text"],
    },
  },
  {
    name: "read_neighbor_vault",
    description:
      "Read a markdown file from a connected agent's vault (directly adjacent or router-bridged). " +
      "Path is relative to that agent's vault root, e.g. 'index.md'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The neighbor agent's name." },
        path: { type: "string", description: "Vault-relative file path, e.g. 'index.md'." },
      },
      required: ["name", "path"],
    },
  },
  {
    name: "move_toward",
    description:
      "Walk toward another agent on the hex grid, step by step, around walls and other agents. " +
      "Returns immediately with ETA. The daemon advances you one hex at a time; on arrival " +
      "you are auto-prompted to start the conversation. If 'hops' is 0, you are already adjacent " +
      "to the target — no movement needed; just call send_to.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The target agent's name (case-insensitive)." },
      },
      required: ["name"],
    },
  },
] as const;
