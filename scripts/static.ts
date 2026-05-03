// Plain static-file server for Squadron.html + raw JSX assets, plus a
// `/vault/<agentId>/<path>` route that serves any agent's vault file with
// proper MIME types (so the chat UI can preview .html / images / videos /
// markdown without round-tripping through the daemon).
//
// Bun's `bun Squadron.html` mode tries to bundle the JSX files, which fails
// because the project uses babel-standalone in the browser. This serves
// every file as-is with no transformation.
//
//   bun run scripts/static.ts          # default port 8787
//   PORT=9000 bun run scripts/static.ts

import { resolve, join, normalize } from "node:path";
import { homedir } from "node:os";
import { validate as validateWhitelist } from "../daemon/whitelist";

const ROOT = resolve(import.meta.dir, "../ui");
const VAULTS_ROOT = join(homedir(), ".hexagent", "agents");
const PORT = Number(process.env.PORT ?? 8787);
// Local-only by default. Opt into LAN exposure with SQUADRON_STATIC_HOST=0.0.0.0
// (or any other interface). Public reachability is layered separately via
// cloudflared in bin/squadron.js, which is opt-in/gated.
const HOSTNAME = process.env.SQUADRON_STATIC_HOST ?? "127.0.0.1";

const TYPES: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".htm":   "text/html; charset=utf-8",
  ".jsx":   "application/javascript; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".mjs":   "application/javascript; charset=utf-8",
  ".ts":    "application/javascript; charset=utf-8",
  ".tsx":   "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".md":    "text/markdown; charset=utf-8",
  ".txt":   "text/plain; charset=utf-8",
  ".json":  "application/json; charset=utf-8",
  ".yaml":  "text/yaml; charset=utf-8",
  ".yml":   "text/yaml; charset=utf-8",
  ".toml":  "text/plain; charset=utf-8",
  ".svg":   "image/svg+xml",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".gif":   "image/gif",
  ".webp":  "image/webp",
  ".ico":   "image/x-icon",
  ".mp4":   "video/mp4",
  ".webm":  "video/webm",
  ".mov":   "video/quicktime",
  ".mp3":   "audio/mpeg",
  ".wav":   "audio/wav",
  ".pdf":   "application/pdf",
};

function safeJoin(base: string, sub: string): string | null {
  // Strip leading slash, normalize, refuse anything climbing out of base.
  const cleaned = normalize(sub.replace(/^\/+/, "")).replace(/^(\.\.[/\\])+/, "");
  const full = join(base, cleaned);
  if (!full.startsWith(base + "/") && full !== base) return null;
  return full;
}

function mimeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(req) {
    const url = new URL(req.url);

    // Vault route: /vault/<agentId>/<path...>
    // Gated by the same whitelist the daemon WS uses. In OPEN mode (no tokens
    // configured) `validateWhitelist` returns ok=true so local-only setups
    // keep working without ceremony. In GATED mode (any tokens present) the
    // request must carry ?token=<one-of-them>.
    const vaultMatch = url.pathname.match(/^\/vault\/([0-9a-f-]{36})(\/.*)?$/);
    if (vaultMatch) {
      const presented = url.searchParams.get("token");
      const auth = validateWhitelist(presented);
      if (!auth.ok) {
        return new Response("Unauthorized — pass ?token=<whitelist token>", { status: 401 });
      }
      const agentId = vaultMatch[1]!;
      const inner = vaultMatch[2] ?? "/";
      const vaultRoot = join(VAULTS_ROOT, agentId, "vault");
      const full = safeJoin(vaultRoot, inner);
      if (!full) return new Response("Not Found", { status: 404 });
      const file = Bun.file(full);
      if (!(await file.exists())) return new Response("Not Found", { status: 404 });
      const headers = new Headers({
        "content-type": mimeFor(full),
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
      });
      return new Response(file, { headers });
    }

    // App shell + JSX assets.
    let path = url.pathname === "/" ? "/Squadron.html" : url.pathname;
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
    const full = join(ROOT, safe);
    const file = Bun.file(full);
    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }
    const headers = new Headers({
      "content-type": mimeFor(full),
      "access-control-allow-origin": "*",
      // No browser cache — this is a dev/alpha-shaped product where the static
      // server serves the live working tree (debug-mode symlinks). Stale HTML
      // would prevent users from picking up the latest JSX cache-busters.
      "cache-control": "no-cache, no-store, must-revalidate",
    });
    return new Response(file, { headers });
  },
});

console.log(
  `squadron static server: http://localhost:${PORT}/Squadron.html\n` +
  `  app root:  ${ROOT}\n` +
  `  vaults:    ${VAULTS_ROOT}/<agentId>/vault/<path>`
);
