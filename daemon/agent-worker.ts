// One AgentWorker = one `claude -p` subprocess.
// Owns the lifecycle, line-buffered stdio readers, and event/error/exit callbacks.
//
// Worker interface is the contract any provider (claude, codex, openrouter, …)
// must satisfy. The factory in worker-factory.ts dispatches construction by
// provider name; server.ts calls only methods on the interface.

import {
  buildClaudeArgs,
  extractSessionId,
  formatUserTurn,
  parseStreamJson,
} from "./claude-cli.ts";
import type { ClaudeStreamEvent } from "./protocol.ts";

/** Common runtime contract for every model provider's worker. */
export interface Worker {
  readonly id: string;
  readonly name: string;
  /** Latest known provider session id (for resume). Null until the provider hands one over. */
  readonly sessionId: string | null;
  /** Spawn the underlying transport (subprocess for claude/codex; HTTP client for openrouter). Idempotent. */
  start(): void;
  /** Deliver one user turn. */
  send(text: string): void;
  /** Tear down. Idempotent. */
  kill(): void;
}

export interface AgentWorkerInit {
  id: string;
  name: string;
  systemPrompt: string;
  /** Optional client-supplied session id (used for `--session-id`). Mutually exclusive with `resumeSessionId`. */
  sessionId?: string;
  /** Resume an existing session via `claude --resume <id>`. Used by daemon restart restore. */
  resumeSessionId?: string;
  /** Inline JSON for --mcp-config. Set by server.ts to point claude at the daemon's MCP endpoint. */
  mcpConfigJson?: string;
  /** Working directory for the subprocess. M3: agent's vault folder. */
  cwd?: string;
  onEvent:  (event: ClaudeStreamEvent) => void;
  onStderr: (line: string) => void;
  onError:  (error: string) => void;
  onExit:   (exitCode: number | null) => void;
  /** Fired when a `result` event arrives, with the assistant turn's final text. */
  onResult?: (text: string) => void;
}

export class AgentWorker implements Worker {
  readonly id: string;
  readonly name: string;
  /** Captured from the first system/init event; falls back to the input id. */
  sessionId: string | null;

  private readonly init: AgentWorkerInit;
  private proc: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private killing = false;

  constructor(init: AgentWorkerInit) {
    this.id = init.id;
    this.name = init.name;
    this.sessionId = init.sessionId ?? null;
    this.init = init;
  }

  /** Spawn the subprocess and start reading streams. Idempotent guard included. */
  start(): void {
    if (this.proc) return;

    const args = buildClaudeArgs({
      systemPrompt: this.init.systemPrompt,
      sessionId: this.init.sessionId,
      resumeSessionId: this.init.resumeSessionId,
      mcpConfigJson: this.init.mcpConfigJson,
    });

    // Force OAuth path: drop ANTHROPIC_API_KEY in subprocess env so claude can't
    // accidentally bill via API key when subscription auth is intended.
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    delete env.ANTHROPIC_API_KEY;

    try {
      this.proc = Bun.spawn(["claude", ...args], {
        stdin:  "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env,
        cwd: this.init.cwd,
      });
    } catch (err) {
      this.init.onError(
        `failed to spawn claude: ${err instanceof Error ? err.message : String(err)}`
      );
      this.init.onExit(null);
      return;
    }

    void this.readStdout();
    void this.readStderr();
    void this.waitForExit();
  }

  /** Send one user turn to the live subprocess. */
  send(text: string): void {
    if (!this.proc) {
      this.init.onError("send() called before start() / after exit");
      return;
    }
    const line = formatUserTurn(text) + "\n";
    try {
      // In Bun, proc.stdin is a FileSink — synchronous write + flush.
      this.proc.stdin.write(line);
      this.proc.stdin.flush();
    } catch (err) {
      this.init.onError(
        `stdin write failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Graceful kill: SIGTERM, then SIGKILL after 2s. */
  kill(): void {
    if (!this.proc || this.killing) return;
    this.killing = true;
    try {
      this.proc.kill("SIGTERM");
    } catch {
      /* best effort */
    }
    setTimeout(() => {
      try {
        this.proc?.kill("SIGKILL");
      } catch {
        /* best effort */
      }
    }, 2_000);
  }

  // ---------- stream readers (line-buffered) ----------

  private async readStdout(): Promise<void> {
    if (!this.proc) return;
    let buf = "";
    const decoder = new TextDecoder();
    const reader = this.proc.stdout.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const r = parseStreamJson(line);
          if (r.ok) {
            const sid = extractSessionId(r.event);
            if (sid && !this.sessionId) this.sessionId = sid;
            this.init.onEvent(r.event);
            // Fire onResult when a result event arrives with the turn's final text.
            const ev = r.event as Record<string, unknown> | null;
            if (ev && ev.type === "result" && typeof ev.result === "string") {
              this.init.onResult?.(ev.result);
            }
          } else {
            this.init.onError(`unparsed stdout line: ${r.error} :: ${r.raw.slice(0, 200)}`);
          }
        }
      }
      // flush any trailing line at EOF
      if (buf.trim()) {
        const r = parseStreamJson(buf);
        if (r.ok) this.init.onEvent(r.event);
      }
    } catch (err) {
      this.init.onError(
        `stdout reader failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async readStderr(): Promise<void> {
    if (!this.proc) return;
    let buf = "";
    const decoder = new TextDecoder();
    const reader = this.proc.stderr.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.trim()) this.init.onStderr(line);
        }
      }
      if (buf.trim()) this.init.onStderr(buf);
    } catch {
      /* stderr is best-effort */
    }
  }

  private async waitForExit(): Promise<void> {
    if (!this.proc) return;
    const code = await this.proc.exited;
    this.init.onExit(typeof code === "number" ? code : null);
  }
}
