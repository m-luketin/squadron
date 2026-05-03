// M1 smoke test: verify create-agent → send-message → message-appended → reload → snapshot
// preserves state. Run after wiping ~/.hexagent/squadron.db for a clean baseline.
//
//   rm -f ~/.hexagent/squadron.db
//   bun run scripts/m1-smoke.ts

import type { ClientToDaemon, DaemonToClient } from "../daemon/protocol.ts";

const URL = process.env.SQUADRON_WS_URL ?? "ws://localhost:7878/ws";

function open(): WebSocket {
  return new WebSocket(URL);
}

function send(ws: WebSocket, e: ClientToDaemon): void {
  ws.send(JSON.stringify(e));
}

function until<T extends DaemonToClient["type"]>(
  ws: WebSocket,
  t: T,
  filter?: (e: Extract<DaemonToClient, { type: T }>) => boolean,
  timeoutMs = 30_000
): Promise<Extract<DaemonToClient, { type: T }>> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`timeout waiting for ${t}`)), timeoutMs);
    const onMsg = (m: MessageEvent) => {
      let parsed: DaemonToClient;
      try { parsed = JSON.parse(typeof m.data === "string" ? m.data : m.data.toString()); }
      catch { return; }
      if (parsed.type !== t) return;
      if (filter && !filter(parsed as Extract<DaemonToClient, { type: T }>)) return;
      clearTimeout(to);
      ws.removeEventListener("message", onMsg);
      resolve(parsed as Extract<DaemonToClient, { type: T }>);
    };
    ws.addEventListener("message", onMsg);
  });
}

async function awaitOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === 1) return;
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
  });
}

async function main() {
  console.log("M1 smoke");
  console.log("-".repeat(50));

  // ---- Phase 1: connect, subscribe, expect empty (or non-empty if DB had state) ----
  const ws1 = open();
  await awaitOpen(ws1);
  console.log("ws1 open");
  send(ws1, { type: "world-subscribe" });
  const snap1 = await until(ws1, "world-snapshot");
  console.log(`world-snapshot: ${snap1.agents.length} agents, ` +
              `${Object.values(snap1.messages).reduce((s, m) => s + m.length, 0)} messages`);

  // ---- Phase 2: create an agent ----
  send(ws1, { type: "create-agent", q: 0, r: 0, name: "Smoke", systemPrompt: "Be terse." });
  const created = await until(ws1, "agent-created");
  console.log(`agent-created: ${created.agent.id} name=${created.agent.name} status=${created.agent.status}`);

  const agentId = created.agent.id;

  // ---- Phase 3: send a message; expect message-appended user, then assistant ----
  const userMsg = until(ws1, "message-appended", m => m.message.agentId === agentId && m.message.side === "you");
  send(ws1, { type: "send-message", agentId, text: "Reply with exactly OK and nothing else." });
  const userPersisted = await userMsg;
  console.log(`message-appended (user): "${userPersisted.message.text}"`);

  const assistantMsg = await until(
    ws1, "message-appended",
    m => m.message.agentId === agentId && m.message.side === "them",
    60_000
  );
  console.log(`message-appended (assistant): "${assistantMsg.message.text.slice(0, 60)}"`);

  // ---- Phase 4: open second connection, expect snapshot to include the agent + 2 messages ----
  ws1.close();
  await new Promise(r => setTimeout(r, 200));
  const ws2 = open();
  await awaitOpen(ws2);
  send(ws2, { type: "world-subscribe" });
  const snap2 = await until(ws2, "world-snapshot");
  const found = snap2.agents.find(a => a.id === agentId);
  const msgs2 = snap2.messages[agentId] || [];
  console.log(`reload-snapshot: agent ${found ? "✅ present" : "❌ missing"}, messages=${msgs2.length}`);

  // ---- Phase 5: cleanup — delete the agent ----
  send(ws2, { type: "delete-agent", agentId });
  const deleted = await until(ws2, "agent-deleted", e => e.agentId === agentId);
  console.log(`agent-deleted: ${deleted.agentId}`);

  ws2.close();
  console.log("-".repeat(50));

  const okSnapshot = snap1 != null;
  const okCreated  = !!created.agent && created.agent.status === "Draft";
  const okUserMsg  = userPersisted.message.text.includes("OK") || userPersisted.message.text.length > 0;
  const okAssistOK = /\bOK\b/i.test(assistantMsg.message.text);
  const okReload   = !!found && msgs2.length >= 2;
  const okDelete   = !!deleted;

  console.log(`snapshot       ${okSnapshot ? "✅" : "❌"}`);
  console.log(`agent created  ${okCreated ? "✅" : "❌"}`);
  console.log(`user persisted ${okUserMsg ? "✅" : "❌"}`);
  console.log(`assistant ok   ${okAssistOK ? "✅" : "❌"}`);
  console.log(`reload sync    ${okReload ? "✅" : "❌"}  (messages on reload: ${msgs2.length})`);
  console.log(`delete         ${okDelete ? "✅" : "❌"}`);

  const pass = okSnapshot && okCreated && okUserMsg && okAssistOK && okReload && okDelete;
  console.log("");
  console.log(pass ? "✅ M1 PASS" : "❌ M1 FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(2);
});
