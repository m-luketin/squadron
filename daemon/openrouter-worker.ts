// OpenRouter-backed Worker. Stateless HTTP API → we keep the conversation
// history in memory ourselves (Claude's CLI subprocess does that for us; here
// we don't have that luxury).
//
// MVP scope:
//  - Chat-only. NO MCP tool calling yet (so OpenRouter agents can't send_to /
//    read_neighbor_vault / move_to). Acceptable for the "trial tier" — users
//    get a feel for Squadron before connecting their Claude subscription.
//  - Non-streaming. Synthesizes claude-shape stream events on the way out so
//    the rest of the daemon (event broadcast, status flips, message persist)
//    works unchanged.
//  - Per-worker conversation history kept in memory only — lost on restart.
//    For trial use that's fine; long-term memory still lives in the vault.

import type { AgentWorkerInit, Worker } from "./agent-worker.ts";
import { getOpenRouterConfig, DEFAULT_OPENROUTER_MODEL } from "./providers.ts";

interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterWorker implements Worker {
  readonly id: string;
  readonly name: string;
  sessionId: string | null;

  private readonly init: AgentWorkerInit;
  private readonly history: ORMessage[];
  private started = false;
  private inFlight = false;
  private killed = false;
  private abortController: AbortController | null = null;

  constructor(init: AgentWorkerInit) {
    this.id = init.id;
    this.name = init.name;
    this.sessionId = init.sessionId ?? null;
    this.init = init;
    this.history = [{ role: "system", content: init.systemPrompt }];
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // Synthesize a system/init event so server.ts flips status → Live and
    // captures a session id (the agent's own id, since OpenRouter has no
    // server-side session of its own).
    if (!this.sessionId) this.sessionId = this.id;
    this.init.onEvent({
      type: "system",
      subtype: "init",
      session_id: this.sessionId,
      provider: "openrouter",
    });
  }

  send(text: string): void {
    if (!this.started) {
      this.init.onError("send() called before start()");
      return;
    }
    if (this.killed) {
      this.init.onError("send() called after kill()");
      return;
    }
    if (this.inFlight) {
      this.init.onError("send() called while previous request still in flight");
      return;
    }
    void this.sendImpl(text);
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    if (this.abortController) {
      try { this.abortController.abort(); } catch { /* best effort */ }
      this.abortController = null;
    }
    // No subprocess to reap; just emit a clean exit so the daemon's worker map
    // tracking stays consistent.
    this.init.onExit(0);
  }

  // ---------- internals ----------

  private async sendImpl(userText: string): Promise<void> {
    const cfg = getOpenRouterConfig();
    if (!cfg) {
      this.init.onError(
        "openrouter not configured. Set apiKey in ~/.hexagent/providers.json (or use the in-app onboarding flow)."
      );
      return;
    }

    this.inFlight = true;
    this.history.push({ role: "user", content: userText });

    this.abortController = new AbortController();
    let assistantText = "";
    try {
      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${cfg.apiKey}`,
          // OpenRouter recommends an HTTP-Referer + X-Title for routing/attribution.
          "HTTP-Referer": "https://github.com/m-luketin/squadron",
          "X-Title": "Squadron",
        },
        body: JSON.stringify({
          model: cfg.model || DEFAULT_OPENROUTER_MODEL,
          messages: this.history,
          stream: false,
        }),
        signal: this.abortController.signal,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        this.init.onError(`openrouter ${resp.status}: ${body.slice(0, 300) || resp.statusText}`);
        // Roll back the user turn we just appended so the next attempt isn't
        // poisoned by a half-recorded exchange.
        this.history.pop();
        return;
      }

      const json = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (json.error) {
        this.init.onError(`openrouter error: ${json.error.message ?? "unknown"}`);
        this.history.pop();
        return;
      }

      assistantText = json.choices?.[0]?.message?.content ?? "";
      if (!assistantText) {
        this.init.onError("openrouter returned an empty response");
        this.history.pop();
        return;
      }

      this.history.push({ role: "assistant", content: assistantText });

      // Claude-shape stream events: assistant content, then a `result` event
      // carrying the same text so server.ts's onResult handler fires.
      this.init.onEvent({
        type: "assistant",
        message: { content: [{ type: "text", text: assistantText }] },
        provider: "openrouter",
      });
      this.init.onEvent({
        type: "result",
        result: assistantText,
        provider: "openrouter",
      });
      this.init.onResult?.(assistantText);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        this.init.onError("openrouter request aborted");
      } else {
        this.init.onError(
          `openrouter fetch failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      this.history.pop();
    } finally {
      this.inFlight = false;
      this.abortController = null;
    }
  }
}
