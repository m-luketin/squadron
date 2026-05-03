// Per-agent vault filesystem helpers.
// Each agent gets ~/.hexagent/agents/<id>/vault/ with a starter index.md.
// All reads are sandboxed: paths are normalized and rejected if they escape the vault root.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve } from "node:path";

const HEXAGENT_DIR = join(homedir(), ".hexagent");

export function vaultDir(agentId: string): string {
  return join(HEXAGENT_DIR, "agents", agentId, "vault");
}

export function workdir(agentId: string): string {
  // M3: workdir = vault. The agent's filesystem ops land in its own vault by default.
  return vaultDir(agentId);
}

/**
 * Create the vault dir for an agent if it doesn't exist. Seeds the
 * Karpathy LLM-Wiki layout for fresh agents (Karpathy gist
 * https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
 *
 * For existing agents (index.md already present) we DON'T overwrite — but we do
 * ensure `skills.md` exists since it's the hub for the skills feature and every
 * agent needs that node.
 */
export function ensureVaultDir(agentId: string, agentName: string): void {
  const dir = vaultDir(agentId);
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, "index.md");
  const isFresh = !existsSync(indexPath);

  // Skills hub — always ensured (additive for existing agents too).
  const skillsPath = join(dir, "skills.md");
  if (!existsSync(skillsPath)) {
    writeFileSync(
      skillsPath,
      `# Skills\n\n` +
      `Installed skills appear here as wikilinks. Each skill is a markdown file in ` +
      `\`skills/<name>.md\` describing a capability, persona, or framework you can apply.\n\n` +
      `_(no skills installed yet — search for some in the Skills section of the right sidebar)_\n`,
      "utf8"
    );
  }

  if (!isFresh) return;

  // Fresh-agent seed: Karpathy LLM-Wiki structure. Every hub file links back to
  // index, so the graph immediately shows a clean radial layout from day zero.
  const seed: Array<[string, string]> = [
    [
      "index.md",
      `# ${agentName}\n\n` +
      `This is your vault — a personal wiki shaped on Karpathy's LLM-Wiki pattern.\n` +
      `Anything you save here persists across sessions and is visible to neighbors.\n\n` +
      `## map\n\n` +
      `- [[log]] — append-only timeline of what happened, when\n` +
      `- [[skills]] — capabilities you've installed\n` +
      `- [[entities]] — people, organizations, products\n` +
      `- [[concepts]] — ideas, frameworks, theories\n` +
      `- [[sources]] — one summary per ingested document\n` +
      `- [[synthesis]] — cross-cutting analysis and derived insights\n` +
      `\n` +
      `## raw\n\n` +
      `Drop raw source material in \`raw/documents/\` and \`raw/assets/\`. ` +
      `Distil it up into the wiki when it earns a place there.\n`,
    ],
    [
      "log.md",
      `# Log\n\n` +
      `Append-only timeline. Newest entries at the top.\n\n` +
      `Format: \`## [YYYY-MM-DD] operation | title\` followed by a short paragraph.\n\n` +
      `Backlink: [[index]]\n`,
    ],
    [
      "entities.md",
      `# Entities\n\n` +
      `People, organizations, products, places. Each gets its own page in \`entities/<name>.md\` ` +
      `with attributes and links to related concepts/sources.\n\n` +
      `Backlink: [[index]]\n`,
    ],
    [
      "concepts.md",
      `# Concepts\n\n` +
      `Ideas, frameworks, theories. Each concept lives at \`concepts/<slug>.md\` and ` +
      `cross-references the entities and sources that informed it.\n\n` +
      `Backlink: [[index]]\n`,
    ],
    [
      "sources.md",
      `# Sources\n\n` +
      `One markdown summary per ingested document. The raw file lives in \`raw/documents/\`; ` +
      `the digestion lives in \`sources/<name>.md\`.\n\n` +
      `Backlink: [[index]]\n`,
    ],
    [
      "synthesis.md",
      `# Synthesis\n\n` +
      `Cross-cutting analysis — claims that draw from multiple sources, entities, ` +
      `or concepts. The interesting work happens here.\n\n` +
      `Backlink: [[index]]\n`,
    ],
  ];
  for (const [name, body] of seed) {
    const p = join(dir, name);
    if (!existsSync(p)) writeFileSync(p, body, "utf8");
  }

  // Pre-create the subdirs so agents can drop files in immediately. Empty dirs
  // don't surface in the graph but they document the convention via filesystem.
  for (const sub of ["entities", "concepts", "sources", "synthesis", "skills", "raw/documents", "raw/assets"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
}

/**
 * Parse `[[wikilinks]]` out of all .md files in the vault root and return
 * directed edges `[fromFile, toFile]`.
 *
 * Wikilink syntax handled:
 *   [[target]]
 *   [[target|alias]]      → target is the file
 *   [[target#section]]    → target is the file, section is dropped
 *   [[target.md]]         → optional explicit extension
 *
 * Targets that don't resolve to an existing .md file in the same vault are
 * silently dropped (no dangling edges in the graph).
 */
export function parseVaultEdges(agentId: string): [string, string][] {
  const dir = vaultDir(agentId);
  if (!existsSync(dir)) return [];

  const files = listVaultFiles(agentId);
  const fileSet = new Set(files);
  // Stem map for `[[name]]` (no .md) wikilinks. We index by:
  //   - full relative path stem (e.g. "skills/marketing-thread")
  //   - basename stem (e.g. "marketing-thread") — for cross-dir lookups
  // First-write-wins on basename collisions across dirs.
  const stemMap = new Map<string, string>();
  for (const f of files) {
    const stem = f.replace(/\.md$/i, "").toLowerCase();
    stemMap.set(stem, f);
    const base = stem.split("/").pop()!;
    if (base !== stem && !stemMap.has(base)) stemMap.set(base, f);
  }

  const edges: [string, string][] = [];
  // Light dedup so the renderer doesn't get N parallel edges between the same pair.
  const seen = new Set<string>();
  const wikilinkRe = /\[\[([^\]\n]+?)\]\]/g;

  for (const file of files) {
    let body: string;
    try { body = readFileSync(join(dir, file), "utf8"); } catch { continue; }

    let m: RegExpExecArray | null;
    while ((m = wikilinkRe.exec(body)) !== null) {
      const inner = m[1]!;
      // Strip the alias (everything after the first `|`) and section (`#…`).
      let target = inner.split("|", 1)[0]!.split("#", 1)[0]!.trim();
      if (!target) continue;
      // Resolve: explicit .md, or stem lookup.
      let resolved: string | undefined;
      if (fileSet.has(target)) resolved = target;
      else if (fileSet.has(target + ".md")) resolved = target + ".md";
      else resolved = stemMap.get(target.toLowerCase());
      if (!resolved || resolved === file) continue;
      const key = file + "→" + resolved;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([file, resolved]);
    }
  }
  return edges;
}

/** Recursively list `.md` files in the vault, sorted by path. Subdir files are
 *  returned with their relative path (e.g. `skills/marketing-thread.md`). */
export function listVaultFiles(agentId: string): string[] {
  const root = vaultDir(agentId);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  function walk(rel: string) {
    const abs = rel ? join(root, rel) : root;
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); }
    catch { return; }
    for (const d of entries) {
      // Skip dotfiles and a few well-known noisy dirs.
      if (d.name.startsWith(".") || d.name === "node_modules") continue;
      const childRel = rel ? rel + "/" + d.name : d.name;
      if (d.isDirectory()) {
        walk(childRel);
      } else if (d.isFile() && d.name.endsWith(".md")) {
        out.push(childRel);
      }
    }
  }
  walk("");
  return out.sort();
}

/**
 * Write/refresh the agent's `identity.md` file in its vault.
 * Daemon-managed file — represents the current canonical identity. Useful so:
 *   - the agent itself can re-read its own state on demand
 *   - neighbors who `read_neighbor_vault(name, "identity.md")` see live identity
 *   - the human user can read it externally (Obsidian etc.) for parity
 *
 * This file is rewritten on every identity-relevant change. Don't edit it by
 * hand — the daemon will overwrite. Other vault files (notes, scratch, etc.)
 * remain agent- and user-editable.
 */
export interface IdentityFileInput {
  id: string;
  name: string;
  glyph?: string;
  color?: string;
  status?: string;
  state?: string;
  model?: string | null;
  sessionId?: string | null;
  q?: number;
  r?: number;
  systemPrompt?: string;
}

export function writeIdentityFile(a: IdentityFileInput): void {
  const dir = vaultDir(a.id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "identity.md");
  const now = new Date().toISOString();
  const fm = [
    "---",
    "type: identity",
    "managed_by: squadron-daemon",
    `agent_id: ${a.id}`,
    `name: ${JSON.stringify(a.name)}`,
    a.glyph != null ? `symbol: ${JSON.stringify(a.glyph)}` : "",
    a.color != null ? `color: ${JSON.stringify(a.color)}` : "",
    a.status != null ? `status: ${a.status}` : "",
    a.state != null ? `state: ${a.state}` : "",
    a.model != null ? `model: ${JSON.stringify(a.model)}` : "",
    a.sessionId != null ? `session_id: ${a.sessionId}` : "",
    a.q != null ? `position_q: ${a.q}` : "",
    a.r != null ? `position_r: ${a.r}` : "",
    `updated_at: ${now}`,
    "---",
  ].filter(Boolean).join("\n");

  const body = [
    "",
    `# ${a.name}`,
    "",
    "_This file is managed by the Squadron daemon. Do not hand-edit; it is rewritten on every identity change. Use it to verify your current name, position, and operating instructions when something feels off._",
    "",
    "## current",
    "",
    `- **Name:** ${a.name}`,
    a.glyph ? `- **Symbol:** ${a.glyph}` : "",
    a.color ? `- **Color:** ${a.color}` : "",
    a.q != null && a.r != null ? `- **Position:** hex (q=${a.q}, r=${a.r})` : "",
    a.status ? `- **Status:** ${a.status}` : "",
    a.model ? `- **Model:** ${a.model}` : "",
    "",
    a.systemPrompt && a.systemPrompt.trim().length > 0
      ? "## operating instructions\n\n" + a.systemPrompt.trim() + "\n"
      : "## operating instructions\n\n_(no custom system prompt set)_\n",
  ].filter(s => s !== "").join("\n");

  writeFileSync(path, fm + "\n" + body, "utf8");
}

/**
 * Read a file from an agent's vault, sandboxed. Returns null if the file is
 * outside the vault, doesn't exist, or fails to read.
 */
export function readVaultFile(agentId: string, relativePath: string): string | null {
  const full = resolveVaultPath(agentId, relativePath);
  if (!full || !existsSync(full)) return null;
  try {
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

/**
 * Write a file in an agent's vault, sandboxed. Creates intermediate directories
 * if needed. Returns true on success, false if the path is rejected or write fails.
 *
 * Writes from the UI / daemon are unrestricted (the human user owns every vault).
 * Writes from agents go through tools (e.g. their built-in `Write` / `Edit`),
 * which are also rooted at this directory because the subprocess `cwd` is the vault.
 */
export function writeVaultFile(agentId: string, relativePath: string, content: string): boolean {
  const full = resolveVaultPath(agentId, relativePath);
  if (!full) return false;
  // Refuse to overwrite the daemon-managed identity.md from this path —
  // forcing it through writeIdentityFile keeps the schema honest.
  const root = resolve(vaultDir(agentId));
  if (full === join(root, "identity.md")) return false;
  try {
    // Ensure parent directory exists.
    const parent = full.replace(/\/[^/]+$/, "");
    mkdirSync(parent, { recursive: true });
    writeFileSync(full, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Rename / move a file inside the agent's vault. Both paths are sandboxed to
 * the vault root. Refuses identity.md as either source or target, refuses if
 * the target already exists. Returns true on success.
 */
export function moveVaultFile(agentId: string, oldPath: string, newPath: string): { ok: boolean; error?: string } {
  const fromFull = resolveVaultPath(agentId, oldPath);
  const toFull = resolveVaultPath(agentId, newPath);
  if (!fromFull || !toFull) return { ok: false, error: "path rejected" };
  if (!existsSync(fromFull)) return { ok: false, error: "source not found" };
  const root = resolve(vaultDir(agentId));
  const idPath = join(root, "identity.md");
  if (fromFull === idPath) return { ok: false, error: "identity.md is daemon-managed (cannot rename)" };
  if (toFull === idPath) return { ok: false, error: "cannot overwrite identity.md" };
  if (existsSync(toFull)) return { ok: false, error: "target already exists" };
  try {
    const { renameSync, mkdirSync } = require("node:fs");
    // Ensure parent dir exists if newPath includes a subdir.
    const parent = toFull.replace(/\/[^/]+$/, "");
    mkdirSync(parent, { recursive: true });
    renameSync(fromFull, toFull);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Delete a file from an agent's vault, sandboxed. Refuses identity.md (daemon-managed)
 * and any path that escapes the vault root. Returns true on success.
 */
export function deleteVaultFile(agentId: string, relativePath: string): boolean {
  const full = resolveVaultPath(agentId, relativePath);
  if (!full || !existsSync(full)) return false;
  const root = resolve(vaultDir(agentId));
  if (full === join(root, "identity.md")) return false;
  try {
    // Lazy import to avoid a top-level rmSync require — keeps this module
    // import-light for environments that don't need delete.
    const { unlinkSync } = require("node:fs");
    unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

// ---------- M-Skills: install/uninstall markdown skills ----------

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Normalize a skill name to a safe lowercase slug. Returns null if unrecoverable. */
export function normalizeSkillName(input: string): string | null {
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return SKILL_NAME_RE.test(slug) ? slug : null;
}

/**
 * Install a skill into the agent's vault: write `skills/<name>.md` AND append
 * a wikilink line `- [[<name>]]` to `skills.md` if missing. Idempotent.
 */
export function installSkill(agentId: string, rawName: string, content: string): { ok: boolean; error?: string; name?: string } {
  const name = normalizeSkillName(rawName);
  if (!name) return { ok: false, error: "invalid skill name" };
  if (!content || content.trim().length === 0) return { ok: false, error: "empty skill content" };

  const root = vaultDir(agentId);
  if (!existsSync(root)) return { ok: false, error: "vault dir missing" };
  mkdirSync(join(root, "skills"), { recursive: true });

  // 1. write skills/<name>.md
  const skillPath = join(root, "skills", name + ".md");
  try {
    writeFileSync(skillPath, content, "utf8");
  } catch (e) {
    return { ok: false, error: "skill write failed: " + (e instanceof Error ? e.message : String(e)) };
  }

  // 2. ensure skills.md exists, then append wikilink if missing
  const hubPath = join(root, "skills.md");
  let hub: string;
  try {
    hub = existsSync(hubPath) ? readFileSync(hubPath, "utf8") : `# Skills\n\nInstalled skills:\n\n`;
  } catch { hub = `# Skills\n\nInstalled skills:\n\n`; }
  const linkLine = `- [[${name}]]`;
  if (!hub.split("\n").some(l => l.trim() === linkLine)) {
    // Strip the "no skills installed yet" placeholder if present.
    hub = hub.replace(/_\(no skills installed yet[^)]*\)_\n?/g, "").replace(/\n{3,}/g, "\n\n");
    if (!hub.endsWith("\n")) hub += "\n";
    hub += linkLine + "\n";
    try { writeFileSync(hubPath, hub, "utf8"); }
    catch (e) { return { ok: false, error: "hub update failed: " + (e instanceof Error ? e.message : String(e)) }; }
  }

  return { ok: true, name };
}

/**
 * Uninstall a skill: remove `skills/<name>.md` and strip the matching wikilink
 * line from `skills.md`. Idempotent — succeeds even if the file is already gone.
 */
export function uninstallSkill(agentId: string, rawName: string): { ok: boolean; error?: string; name?: string } {
  const name = normalizeSkillName(rawName);
  if (!name) return { ok: false, error: "invalid skill name" };

  const root = vaultDir(agentId);
  const skillPath = join(root, "skills", name + ".md");
  if (existsSync(skillPath)) {
    try {
      const { unlinkSync } = require("node:fs");
      unlinkSync(skillPath);
    } catch (e) {
      return { ok: false, error: "delete failed: " + (e instanceof Error ? e.message : String(e)) };
    }
  }

  // Remove the wikilink line from skills.md (any leading bullet/number variant).
  const hubPath = join(root, "skills.md");
  if (existsSync(hubPath)) {
    try {
      const hub = readFileSync(hubPath, "utf8");
      const filtered = hub.split("\n").filter(line => {
        const m = line.match(/\[\[([^\]|#]+?)(?:\|[^\]]+)?(?:#[^\]]+)?\]\]/);
        if (!m) return true;
        return m[1]!.trim().toLowerCase() !== name;
      }).join("\n");
      writeFileSync(hubPath, filtered, "utf8");
    } catch (e) {
      return { ok: false, error: "hub update failed: " + (e instanceof Error ? e.message : String(e)) };
    }
  }
  return { ok: true, name };
}

function resolveVaultPath(agentId: string, relativePath: string): string | null {
  const root = resolve(vaultDir(agentId));
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..")) return null;
  const normalized = normalize(relativePath);
  const full = resolve(root, normalized);
  if (!full.startsWith(root + "/") && full !== root) return null;
  return full;
}
