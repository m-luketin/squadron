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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");

// CLI flags. Local-only is the safe default; --public opts into cloudflared
// tunnels so the daemon + UI become reachable from the public internet.
const argv = process.argv.slice(2);
const PUBLIC = argv.includes("--public");
const HELP = argv.includes("--help") || argv.includes("-h");

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

if (HELP) {
  process.stdout.write(
    `Squadron — local multi-agent control plane.\n\n` +
    `  npx @m-luketin/squadron            Start local-only (recommended).\n` +
    `  npx @m-luketin/squadron --public   Also expose via cloudflared tunnels.\n` +
    `                                     Will auto-generate a whitelist token\n` +
    `                                     if none exists. Print the gated URL.\n\n` +
    `Local-only is the default — your daemon binds 127.0.0.1 and is unreachable\n` +
    `from the internet or the LAN. --public is opt-in.\n`
  );
  process.exit(0);
}

// ---- 3. cloudflared (optional, only used with --public) ----
const cf = which("cloudflared");
if (PUBLIC) {
  if (cf) {
    ok(`cloudflared found — will expose via public tunnels`);
  } else {
    warn("--public requested but cloudflared not installed");
    process.stderr.write(
      `\nInstall cloudflared then re-run with --public:\n\n` +
      `  ${C.bold}brew install cloudflared${C.reset}\n\n` +
      `Or omit --public to run local-only.\n`
    );
    process.exit(1);
  }
} else if (cf) {
  ok(`cloudflared found (not used; pass --public to expose tunnels)`);
} else {
  ok(`local-only mode (no cloudflared, no public exposure)`);
}

// ---- 4. Whitelist gate (only relevant when --public) ----
// Public exposure without an auth token = anyone with the URL controls the
// daemon. Auto-generate a token here if the user hasn't already set one.
const HEXAGENT_DIR = path.join(homedir(), ".hexagent");
const WHITELIST_PATH = path.join(HEXAGENT_DIR, "whitelist.json");
let publicToken = null;
if (PUBLIC) {
  let wl = { tokens: [] };
  if (existsSync(WHITELIST_PATH)) {
    try { wl = JSON.parse(readFileSync(WHITELIST_PATH, "utf8")); }
    catch { wl = { tokens: [] }; }
  }
  if (!Array.isArray(wl.tokens)) wl.tokens = [];
  if (wl.tokens.length === 0) {
    publicToken = randomBytes(18).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    wl.tokens.push({ token: publicToken, label: "auto-public", createdAt: new Date().toISOString() });
    mkdirSync(HEXAGENT_DIR, { recursive: true });
    writeFileSync(WHITELIST_PATH, JSON.stringify(wl, null, 2) + "\n", "utf8");
    ok(`generated whitelist token (saved to ${WHITELIST_PATH})`);
  } else {
    publicToken = wl.tokens[0].token;
    ok(`using existing whitelist token (${wl.tokens.length} configured)`);
  }
}

// ---- 5. Boot ----
step("Starting Squadron");
const bringup = path.join(PKG_ROOT, "scripts", "bringup.sh");
const env = { ...process.env };
if (!PUBLIC) env.SKIP_TUNNELS = "1";
if (publicToken) env.SQUADRON_PUBLIC_TOKEN = publicToken;

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
