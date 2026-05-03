// Squadron daemon entry. Boots the WS server, restores Live agents, handles signals.

import { startServer } from "./server.ts";
import { closeDb, getDbPath } from "./db.ts";
import { ensureVaultDir, writeIdentityFile } from "./vault.ts";
import { maybeSeedDemoAgents } from "./seed-demo.ts";

const host = process.env.SQUADRON_HOST ?? "localhost";
const port = Number(process.env.SQUADRON_PORT ?? 7878);

if (Number.isNaN(port) || port < 1 || port > 65535) {
  console.error(`[squadron] invalid SQUADRON_PORT: ${process.env.SQUADRON_PORT}`);
  process.exit(1);
}

const running = startServer({ host, port });

console.log(`[squadron] daemon listening on ws://${host}:${port}/ws`);
console.log(`[squadron] healthcheck:  http://${host}:${port}/health`);
console.log(`[squadron] DB:           ${getDbPath()}`);

// First-run demo seed: drop a Squadron-about-Squadron starter team if the world
// is empty. Idempotent — only fires when there are zero agents in the DB.
if (maybeSeedDemoAgents(running.world)) {
  console.log(`[squadron] seeded 4 demo agents (Tutor, Architect, Spec, Skills) — fresh install`);
}

// M3: ensure every existing agent has a vault folder + index.md (idempotent).
// M3.5: also write/refresh identity.md so the file matches the current DB state
// (catches agents that existed before this feature shipped).
const allAgents = running.world.agents();
for (const a of allAgents) {
  ensureVaultDir(a.id, a.name);
  writeIdentityFile({
    id: a.id, name: a.name, glyph: a.glyph, color: a.color,
    status: a.status, state: a.state, model: a.model,
    sessionId: a.sessionId, q: a.q, r: a.r,
    systemPrompt: a.systemPrompt,
  });
}
if (allAgents.length > 0) console.log(`[squadron] vaults + identity.md refreshed for ${allAgents.length} agent(s)`);

// On cold boot: scan for previously-Live agents and resume their subprocesses.
const liveAgents = running.world.liveAgents();
if (liveAgents.length === 0) {
  console.log(`[squadron] no Live agents to restore`);
} else {
  console.log(`[squadron] restoring ${liveAgents.length} Live agent(s):`);
  for (const a of liveAgents) {
    console.log(`           - ${a.name} (${a.id}) session=${a.sessionId ?? "(missing)"}`);
    if (!a.sessionId) {
      // Can't resume without a session id — degrade to Draft.
      running.world.setDraft(a.id, { clearSession: true });
      continue;
    }
    running.bootAgent(a.id);
  }
}

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[squadron] ${signal} — killing workers, stopping server, closing DB`);
  running.killAll();
  running.server.stop();
  closeDb();
  setTimeout(() => process.exit(0), 250);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
