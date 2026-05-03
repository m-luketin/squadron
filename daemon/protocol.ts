// Squadron WebSocket event protocol — single source of truth for both ends.
// Line-delimited JSON over the WS. Each frame is one event.

import type {
  AgentDto,
  FeatureDto,
  InterAgentMessageDto,
  MessageDto,
} from "./world.ts";
import type { FeatureKind } from "./db.ts";

// Pass-through stream-json events from `claude -p`. Opaque on the wire.
export type ClaudeStreamEvent = unknown;

// ---------- Client → Daemon ----------

export type ClientToDaemon =
  // World subscription / snapshot
  | { type: "world-subscribe" }

  // Agent CRUD (M1)
  | {
      type: "create-agent";
      name?: string;
      glyph?: string;
      color?: string;
      q?: number;
      r?: number;
      systemPrompt?: string;
      model?: string;
    }
  | {
      type: "update-agent";
      agentId: string;
      patch: Partial<{
        name: string;
        glyph: string;
        color: string;
        systemPrompt: string;
        model: string;
        q: number;
        r: number;
        movementEnabled: boolean;
      }>;
    }
  | { type: "delete-agent"; agentId: string }

  // Subprocess lifecycle (renamed from spawn-agent)
  | { type: "boot-agent"; agentId: string }
  | { type: "kill-agent"; agentId: string }

  // Conversation
  | { type: "send-message"; agentId: string; text: string }

  // M3 — world features (walls + routers, daemon-persisted)
  | { type: "place-feature"; q: number; r: number; kind: FeatureKind }
  | { type: "remove-feature"; q: number; r: number }

  // M3.5 — autonomous wakeup kill switch
  | { type: "set-autonomy"; enabled: boolean }

  // M3-vault-edit — read / write a vault file from the UI
  | { type: "read-vault-file"; agentId: string; path: string }
  | { type: "write-vault-file"; agentId: string; path: string; content: string }
  | { type: "delete-vault-file"; agentId: string; path: string }
  | { type: "move-vault-file"; agentId: string; oldPath: string; newPath: string }

  // M-Skills — install/uninstall a markdown skill in the agent's vault.
  // Daemon writes skills/<name>.md and atomically updates skills.md's wikilinks.
  | { type: "install-skill"; agentId: string; name: string; content: string }
  | { type: "uninstall-skill"; agentId: string; name: string };

// ---------- Daemon → Client ----------

export type DaemonToClient =
  // World deltas (broadcast to all open clients)
  | {
      type: "world-snapshot";
      agents: AgentDto[];
      messages: Record<string, MessageDto[]>;
      features: FeatureDto[];
      interAgentMessages: InterAgentMessageDto[];
      autonomyEnabled: boolean;
    }
  | { type: "autonomy-changed"; enabled: boolean }
  | { type: "auto-trigger-paused"; pairKey: string; reason: "budget" | "throttle" }

  // M3-vault-edit
  | { type: "vault-file-content"; agentId: string; path: string; content: string | null; error?: string }
  | { type: "vault-file-written"; agentId: string; path: string; ok: boolean; error?: string }
  | { type: "vault-file-deleted"; agentId: string; path: string; ok: boolean; error?: string }
  | { type: "vault-file-moved"; agentId: string; oldPath: string; newPath: string; ok: boolean; error?: string }
  | { type: "skill-installed"; agentId: string; name: string; ok: boolean; error?: string }
  | { type: "skill-uninstalled"; agentId: string; name: string; ok: boolean; error?: string }
  | { type: "agent-created"; agent: AgentDto }
  | { type: "agent-updated"; agent: AgentDto }
  | { type: "agent-deleted"; agentId: string }
  | { type: "message-appended"; message: MessageDto }
  | { type: "feature-placed"; feature: FeatureDto }
  | { type: "feature-removed"; q: number; r: number }
  | { type: "inter-agent-message-appended"; message: InterAgentMessageDto }

  // Subprocess lifecycle / streaming
  | { type: "agent-spawned"; agentId: string; sessionId: string | null }
  | { type: "agent-event"; agentId: string; event: ClaudeStreamEvent }
  | { type: "agent-stderr"; agentId: string; line: string }
  | { type: "agent-error"; agentId: string; error: string }
  | { type: "agent-exited"; agentId: string; exitCode: number | null };

// ---------- Type guards ----------

const CLIENT_EVENT_TYPES = new Set([
  "world-subscribe",
  "create-agent",
  "update-agent",
  "delete-agent",
  "boot-agent",
  "kill-agent",
  "send-message",
  "place-feature",
  "remove-feature",
  "set-autonomy",
  "read-vault-file",
  "write-vault-file",
  "delete-vault-file",
  "move-vault-file",
  "install-skill",
  "uninstall-skill",
]);

export function isClientToDaemon(x: unknown): x is ClientToDaemon {
  if (!x || typeof x !== "object") return false;
  const t = (x as { type?: unknown }).type;
  return typeof t === "string" && CLIENT_EVENT_TYPES.has(t);
}
