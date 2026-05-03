// Whitelist gate for the daemon WS endpoint.
//
// Storage: ~/.hexagent/whitelist.json
//   { "tokens": [ { "token": "<random>", "label": "<friend>", "createdAt": "..." } ] }
//
// Behavior:
//   - File missing, empty, or `tokens` is empty array → OPEN MODE: no gate,
//     anyone with the URL can connect. (Default for fresh installs / local dev.)
//   - File present with at least one token → GATED MODE: WS upgrade must
//     include `?token=<one of the listed tokens>`, else upgrade is refused.
//
// The file is read on every WS upgrade — cheap, and means tokens edited from
// outside (a CLI helper, the user manually) take effect without restart.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WhitelistToken {
  token: string;
  label: string;
  createdAt: string;
}

export interface Whitelist {
  tokens: WhitelistToken[];
}

const HEXAGENT_DIR = join(homedir(), ".hexagent");
const WHITELIST_PATH = join(HEXAGENT_DIR, "whitelist.json");

export function whitelistPath(): string {
  return WHITELIST_PATH;
}

export function readWhitelist(): Whitelist {
  if (!existsSync(WHITELIST_PATH)) return { tokens: [] };
  try {
    const raw = readFileSync(WHITELIST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Whitelist>;
    const tokens = Array.isArray(parsed.tokens) ? parsed.tokens.filter(
      (t) => t && typeof t.token === "string" && typeof t.label === "string"
    ) : [];
    return { tokens };
  } catch {
    return { tokens: [] };
  }
}

export function writeWhitelist(wl: Whitelist): void {
  mkdirSync(HEXAGENT_DIR, { recursive: true });
  writeFileSync(WHITELIST_PATH, JSON.stringify(wl, null, 2) + "\n", "utf8");
}

/** True if the whitelist is empty/missing → no gate. */
export function isOpen(): boolean {
  return readWhitelist().tokens.length === 0;
}

/** Validate a token. Returns the matching label, or null if rejected. In OPEN MODE, returns "open". */
export function validate(presentedToken: string | null | undefined): { ok: boolean; label?: string } {
  const wl = readWhitelist();
  if (wl.tokens.length === 0) return { ok: true, label: "open" };
  if (!presentedToken) return { ok: false };
  const hit = wl.tokens.find(t => t.token === presentedToken);
  return hit ? { ok: true, label: hit.label } : { ok: false };
}

/** Add a token. Generates a random one if not provided. Returns the new token. */
export function addToken(label: string, customToken?: string): WhitelistToken {
  const wl = readWhitelist();
  const token = customToken ?? generateToken();
  const entry: WhitelistToken = { token, label, createdAt: new Date().toISOString() };
  wl.tokens.push(entry);
  writeWhitelist(wl);
  return entry;
}

/** Revoke a token by its value. Returns true if found+removed. */
export function revokeToken(token: string): boolean {
  const wl = readWhitelist();
  const before = wl.tokens.length;
  wl.tokens = wl.tokens.filter(t => t.token !== token);
  if (wl.tokens.length === before) return false;
  writeWhitelist(wl);
  return true;
}

function generateToken(): string {
  // 24 chars of url-safe base64 from random bytes — plenty of entropy, fits in a query string.
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
