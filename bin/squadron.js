#!/usr/bin/env node
// Squadron CLI entry — `npx @m-luketin/squadron`.
// This is a tiny Node bootstrapper that:
//   1. Confirms the prerequisites (Bun, claude-code) are present
//   2. Hands off to scripts/bringup.sh which boots daemon + static + tunnels
//   3. Forwards Ctrl+C to bringup so the user can stop with one keystroke
//
// The daemon itself is Bun-only (uses bun:sqlite + Bun.serve + Bun.spawn),
// which is why we shell out to bun rather than running everything in Node.

import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function step(s) { process.stderr.write(`${C.cyan}▸${C.reset} ${s}\n`); }
function ok(s)   { process.stderr.write(`  ${C.green}✓${C.reset} ${s}\n`); }
function warn(s) { process.stderr.write(`  ${C.yellow}!${C.reset} ${s}\n`); }
function fail(s) { process.stderr.write(`  ${C.red}✗${C.reset} ${s}\n`); process.exit(1); }

function which(cmd) {
  try {
    return execSync(`command -v ${cmd}`, { stdio: ["ignore", "pipe", "ignore"], shell: "/bin/bash" })
      .toString().trim() || null;
  } catch { return null; }
}

function tryVersion(cmd, args = ["--version"]) {
  try {
    return execSync([cmd, ...args].join(" "), { stdio: ["ignore", "pipe", "ignore"] })
      .toString().split("\n")[0].trim();
  } catch { return null; }
}

// ---- 1. Bun ----
step("Checking dependencies");
const bun = which("bun");
if (!bun) {
  warn("bun not found");
  process.stderr.write(
    `\nSquadron's daemon runs on Bun. Install with:\n\n` +
    `  ${C.bold}curl -fsSL https://bun.sh/install | bash${C.reset}\n\n` +
    `Then re-run ${C.bold}npx @m-luketin/squadron${C.reset}.\n`
  );
  process.exit(1);
}
ok(`bun ${tryVersion("bun") || "(version unknown)"}`);

// ---- 2. claude-code ----
const claude = which("claude");
if (!claude) {
  warn("claude-code CLI not found");
  process.stderr.write(
    `\nSquadron drives the claude-code CLI as a subprocess. Install with:\n\n` +
    `  ${C.bold}bun add -g @anthropic-ai/claude-code${C.reset}\n\n` +
    `Then ${C.bold}claude auth login${C.reset} and re-run.\n`
  );
  process.exit(1);
}
ok(`claude found at ${claude}`);

// ---- 3. cloudflared (optional) ----
const cf = which("cloudflared");
if (cf) {
  ok(`cloudflared found — remote access available`);
} else {
  warn("cloudflared not found — running in local-only mode (browser must be on this machine)");
  warn("install for remote access: brew install cloudflared");
}

// ---- 4. Boot ----
step("Starting Squadron");
const bringup = path.join(PKG_ROOT, "scripts", "bringup.sh");
const env = { ...process.env };
if (!cf) env.SKIP_TUNNELS = "1";

const proc = spawn("bash", [bringup], { cwd: PKG_ROOT, env, stdio: "inherit" });

const forward = (sig) => () => {
  if (proc && !proc.killed) proc.kill(sig);
};
process.on("SIGINT",  forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));
process.on("SIGHUP",  forward("SIGHUP"));

proc.on("exit", (code) => {
  process.exit(code === null ? 1 : code);
});
