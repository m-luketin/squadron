// Per-user model provider config (API keys, default model per provider).
// Stored at ~/.hexagent/providers.json so it lives outside the project repo
// and survives daemon restarts. Local-only — never broadcast over WS.
//
// Shape:
//   {
//     "openrouter": {
//       "apiKey": "sk-or-...",
//       "model":  "meta-llama/llama-3.2-3b-instruct:free"
//     }
//   }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

export interface ProvidersFile {
  openrouter?: OpenRouterConfig;
  // Future: codex (OAuth-only, no key needed); claude (OAuth-only, no key needed).
}

const HEXAGENT_DIR = join(homedir(), ".hexagent");
const PROVIDERS_PATH = join(HEXAGENT_DIR, "providers.json");

// A small free-tier model — good enough for trial chat without a Claude sub.
// User can override per-call via the model field in OpenRouterConfig.
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

export function readProviders(): ProvidersFile {
  if (!existsSync(PROVIDERS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(PROVIDERS_PATH, "utf8")) as ProvidersFile;
  } catch {
    return {};
  }
}

export function writeProviders(p: ProvidersFile): void {
  mkdirSync(HEXAGENT_DIR, { recursive: true });
  writeFileSync(PROVIDERS_PATH, JSON.stringify(p, null, 2) + "\n", "utf8");
}

export function getOpenRouterConfig(): OpenRouterConfig | null {
  const p = readProviders();
  if (!p.openrouter || typeof p.openrouter.apiKey !== "string") return null;
  return {
    apiKey: p.openrouter.apiKey,
    model: typeof p.openrouter.model === "string" ? p.openrouter.model : DEFAULT_OPENROUTER_MODEL,
  };
}

export function setOpenRouterConfig(cfg: OpenRouterConfig): void {
  const p = readProviders();
  p.openrouter = cfg;
  writeProviders(p);
}
