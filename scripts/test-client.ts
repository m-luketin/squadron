// End-to-end smoke test for the Squadron daemon (M0).
//
//   bun run test:client
//
// Connects to ws://localhost:7878/ws, spawns one agent, sends a tiny prompt,
// prints every received event, kills the agent, prints PASS/FAIL.

import type { ClientToDaemon, DaemonToClient } from "../daemon/protocol.ts";

const WS_URL = process.env.SQUADRON_WS_URL ?? "ws://localhost:7878/ws";
const AGENT_ID = "test-1";

const ANSI = {
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  gray:   "\x1b[90m",
  reset:  "\x1b[0m",
};

console.log(`${ANSI.bold}Squadron M0 smoke test${ANSI.reset}`);
console.log(`${ANSI.gray}connecting to ${WS_URL}${ANSI.reset}\n`);

const ws = new WebSocket(WS_URL);

let assistantText = "";
let apiKeySource: string | null = null;
let totalCostUsd: number | null = null;
let sessionId: string | null = null;
let resultSeen = false;
let exited = false;
let exitCode: number | null = null;
let killRequested = false;

ws.addEventListener("open", () => {
  console.log(`${ANSI.green}● connected${ANSI.reset}`);
  send({
    type: "spawn-agent",
    id: AGENT_ID,
    name: "Atlas",
    systemPrompt: "You are a helpful test agent. Be terse.",
  });
});

ws.addEventListener("message", (msg) => {
  let event: DaemonToClient;
  try {
    event = JSON.parse(typeof msg.data === "string" ? msg.data : msg.data.toString());
  } catch {
    console.log(`${ANSI.red}!! non-JSON frame:${ANSI.reset}`, msg.data);
    return;
  }

  switch (event.type) {
    case "agent-spawned":
      sessionId = event.sessionId;
      log("agent-spawned", `sessionId=${event.sessionId ?? "(pending)"}`);
      // Send the test prompt immediately.
      send({
        type: "send-message",
        agentId: AGENT_ID,
        text: "Reply with exactly the word OK and nothing else. No punctuation.",
      });
      break;

    case "agent-event": {
      const e = event.event as Record<string, unknown> | null;
      if (!e || typeof e !== "object") {
        log("agent-event", "(non-object)");
        break;
      }
      const t = e.type as string | undefined;
      const sub = e.subtype as string | undefined;

      if (t === "system" && sub === "init") {
        apiKeySource = (e.apiKeySource as string | undefined) ?? null;
        if (typeof e.session_id === "string" && !sessionId) sessionId = e.session_id;
        log("event", `system/init  apiKeySource=${ANSI.bold}${apiKeySource}${ANSI.reset}  model=${e.model}`);
      } else if (t === "rate_limit_event") {
        const info = e.rate_limit_info as Record<string, unknown> | undefined;
        log("event", `rate_limit  status=${info?.status}  type=${info?.rateLimitType}`);
      } else if (t === "assistant") {
        const msg = e.message as { content?: Array<Record<string, unknown>> } | undefined;
        const blocks = msg?.content ?? [];
        for (const b of blocks) {
          if (b.type === "text" && typeof b.text === "string") {
            assistantText += b.text;
          }
        }
        log("event", `assistant  text=${JSON.stringify(assistantText)}`);
      } else if (t === "result") {
        resultSeen = true;
        totalCostUsd = (e.total_cost_usd as number | undefined) ?? null;
        log("event", `result  total_cost_usd=${totalCostUsd}  duration_ms=${e.duration_ms}`);
        // We have a result — kill the agent and finish.
        killRequested = true;
        send({ type: "kill-agent", agentId: AGENT_ID });
      } else {
        log("event", `${t}${sub ? "/" + sub : ""}`);
      }
      break;
    }

    case "agent-stderr":
      console.log(`${ANSI.gray}  [stderr]${ANSI.reset} ${event.line}`);
      break;

    case "agent-error":
      console.log(`${ANSI.red}!! agent-error: ${event.error}${ANSI.reset}`);
      break;

    case "agent-exited":
      exited = true;
      exitCode = event.exitCode;
      log("agent-exited", `exitCode=${event.exitCode}`);
      finish();
      break;
  }
});

ws.addEventListener("close", () => {
  console.log(`${ANSI.gray}● disconnected${ANSI.reset}`);
  if (!exited) finish(); // server closed before we saw exit
});

ws.addEventListener("error", (e) => {
  console.log(`${ANSI.red}!! websocket error${ANSI.reset}`, e);
  process.exit(2);
});

// Timeout safety: 60s for the whole flow.
setTimeout(() => {
  console.log(`${ANSI.red}!! timeout — daemon did not finish in 60s${ANSI.reset}`);
  try { ws.close(); } catch {}
  process.exit(3);
}, 60_000);

// ---------- helpers ----------

function send(event: ClientToDaemon): void {
  log("→", event.type, ANSI.cyan);
  ws.send(JSON.stringify(event));
}

function log(label: string, detail = "", color = ANSI.yellow): void {
  console.log(`${color}${label.padEnd(14)}${ANSI.reset}${detail}`);
}

function finish(): void {
  console.log(`\n${ANSI.bold}── verdict ──${ANSI.reset}`);
  const okOAuth = apiKeySource === "none";
  const okOK    = assistantText.toUpperCase().includes("OK");
  // A clean exit is code 0; if we requested the kill, SIGTERM (143) / SIGKILL (137) are also fine.
  const okExit  = exited && (
    exitCode === 0 ||
    exitCode === null ||
    (killRequested && (exitCode === 143 || exitCode === 137))
  );

  console.log(`apiKeySource:    ${apiKeySource ?? "(missing)"}   ${okOAuth ? "✅" : "❌"}`);
  console.log(`assistant text:  ${JSON.stringify(assistantText)}   ${okOK ? "✅" : "❌"}`);
  console.log(`agent exited:    ${exited ? `code=${exitCode}${killRequested ? " (we asked)" : ""}` : "(no)"}   ${okExit ? "✅" : "❌"}`);
  console.log(`session id:      ${sessionId ?? "(none)"}`);
  console.log(`total_cost_usd:  ${totalCostUsd ?? "(none)"}`);
  console.log(`result seen:     ${resultSeen}`);

  const pass = okOAuth && okOK && okExit;
  console.log(
    `\n${pass ? ANSI.green + "✅ PASS" : ANSI.red + "❌ FAIL"} — ${
      pass
        ? "M0 vertical slice works end-to-end. Subscription billing flows through."
        : "Something didn't line up. Inspect events above."
    }${ANSI.reset}`
  );

  try { ws.close(); } catch {}
  process.exit(pass ? 0 : 1);
}
