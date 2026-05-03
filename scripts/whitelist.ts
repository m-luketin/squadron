#!/usr/bin/env bun
// Manage the daemon WS access whitelist (`~/.hexagent/whitelist.json`).
//
//   bun run scripts/whitelist.ts list                 # show all tokens
//   bun run scripts/whitelist.ts add <label>          # generate a token for <label>
//   bun run scripts/whitelist.ts add <label> <token>  # add a custom token
//   bun run scripts/whitelist.ts revoke <token>       # revoke a specific token
//   bun run scripts/whitelist.ts url <label> [base]   # generate + print a shareable URL
//
// When the file is empty / missing, the daemon runs in OPEN mode (no gate).
// Adding the first token flips it to GATED mode immediately — no daemon restart needed.

import { addToken, readWhitelist, revokeToken, whitelistPath } from "../daemon/whitelist.ts";

const args = process.argv.slice(2);
const cmd = args[0];

function help(code = 0): never {
  console.log(
`Squadron whitelist CLI

  list                       Show all tokens (token previews only).
  add <label>                Generate + store a token for <label>; prints token.
  add <label> <token>        Store a specific token (custom value).
  revoke <token>             Remove a token from the whitelist.
  url <label> [base]         Generate a token and print the full shareable URL.
                             [base] is the static-server URL prefix, e.g.
                             https://<static>.trycloudflare.com — defaults to env
                             SQUADRON_BASE_URL.

State:  ${whitelistPath()}`
  );
  process.exit(code);
}

if (!cmd || cmd === "-h" || cmd === "--help") help();

if (cmd === "list") {
  const wl = readWhitelist();
  if (wl.tokens.length === 0) {
    console.log("(empty — daemon running in OPEN mode)");
    process.exit(0);
  }
  console.log(`${wl.tokens.length} token(s):`);
  for (const t of wl.tokens) {
    const preview = t.token.slice(0, 6) + "…" + t.token.slice(-4);
    console.log(`  ${preview}  ${t.label}  (${t.createdAt})`);
  }
  process.exit(0);
}

if (cmd === "add") {
  const label = args[1];
  if (!label) { console.error("error: missing label\n"); help(1); }
  const customToken = args[2];
  const entry = addToken(label!, customToken);
  console.log(`added token for "${entry.label}":`);
  console.log(`  ${entry.token}`);
  process.exit(0);
}

if (cmd === "revoke") {
  const token = args[1];
  if (!token) { console.error("error: missing token\n"); help(1); }
  const ok = revokeToken(token!);
  console.log(ok ? "revoked" : "not found");
  process.exit(ok ? 0 : 1);
}

if (cmd === "url") {
  const label = args[1];
  if (!label) { console.error("error: missing label\n"); help(1); }
  const base = args[2] || process.env.SQUADRON_BASE_URL;
  if (!base) {
    console.error("error: no base URL — pass it as 2nd arg or set SQUADRON_BASE_URL\n");
    help(1);
  }
  const entry = addToken(label!);
  // Daemon WS URL is assumed to be at base + scheme swap. If user provides a
  // separate daemon URL via env, allow override.
  const daemonBase = process.env.SQUADRON_DAEMON_URL || base!.replace(/^http/i, "ws");
  const wsUrl = daemonBase + "/ws";
  const fullUrl = `${base}/Squadron.html?daemon=${encodeURIComponent(wsUrl)}&token=${encodeURIComponent(entry.token)}`;
  console.log(`token for "${label}":  ${entry.token}`);
  console.log("");
  console.log("share this URL:");
  console.log(`  ${fullUrl}`);
  process.exit(0);
}

console.error(`unknown command: ${cmd}\n`);
help(1);
