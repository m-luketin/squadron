// Pure helpers for building `claude -p` argv and parsing its stream-json output.
// No I/O. Tested via the daemon's end-to-end test client.

import type { ClaudeStreamEvent } from "./protocol.ts";

export interface BuildArgsInput {
  systemPrompt: string;
  /** Brand-new session: pass a UUID we want claude to use. Mutually exclusive with `resumeSessionId`. */
  sessionId?: string;
  /** Resume an existing session captured from a prior run's init event. */
  resumeSessionId?: string;
  /** Inline JSON for --mcp-config (M3). Squadron's MCP server URL etc. */
  mcpConfigJson?: string;
}

/**
 * Build the argv for `claude -p` in stream-json mode.
 *
 * Verified by the auth spike (2026-05-01):
 *   --output-format stream-json requires --verbose
 *   plain `-p` reads OAuth from keychain → apiKeySource: "none"
 */
export function buildClaudeArgs(input: BuildArgsInput): string[] {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--input-format",  "stream-json",
    "--verbose",
    "--include-partial-messages",
    // Skip per-tool permission prompts — there's no interactive UI in our subprocess.
    // The daemon-hosted MCP tools are trusted (we wrote them); claude-code's other
    // tools (Read/Write/Bash/etc.) are sandboxed to the agent's vault dir.
    "--dangerously-skip-permissions",
  ];
  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    args.push("--append-system-prompt", input.systemPrompt);
  }
  if (input.resumeSessionId) {
    // Resume an existing session — preserves conversation context across daemon restarts.
    args.push("--resume", input.resumeSessionId);
  } else if (input.sessionId) {
    // Brand-new session with a daemon-chosen UUID.
    args.push("--session-id", input.sessionId);
  }
  if (input.mcpConfigJson) {
    // Inline JSON: claude-code accepts a JSON string for --mcp-config. (Alternatively a file path.)
    args.push("--mcp-config", input.mcpConfigJson);
  }
  return args;
}

export type ParseResult =
  | { ok: true;  event: ClaudeStreamEvent }
  | { ok: false; raw: string; error: string };

/** Parse one line of stream-json output. Defensive against malformed lines. */
export function parseStreamJson(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, raw: line, error: "empty line" };
  try {
    return { ok: true, event: JSON.parse(trimmed) };
  } catch (err) {
    return {
      ok: false,
      raw: line,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Pull the session_id from a `system/init` event, if that's what we got.
 * Returns null otherwise. Daemon caches the first session_id it sees so
 * resume-on-restart works in M1 even if `--session-id` isn't honored on input.
 */
export function extractSessionId(event: ClaudeStreamEvent): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e.type === "system" && e.subtype === "init" && typeof e.session_id === "string") {
    return e.session_id;
  }
  return null;
}

/** Format a user turn the way `--input-format stream-json` expects. */
export function formatUserTurn(text: string): string {
  return JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
  });
}
