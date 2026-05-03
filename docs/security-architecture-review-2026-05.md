# Squadron — Security & Architecture Review

**Date:** 2026-05-03
**Reviewer:** Claude (Opus 4.7, 1M context) — comprehensive read-only audit
**Subject:** `@m-luketin/squadron@0.1.2` (npm) and the working tree at `~/Desktop/squadron/`

---

## 1. TL;DR

**Posture: yes-with-caveats.** Recommending `npx @m-luketin/squadron` to a stranger today is *defensible* but not yet *safe-by-default*. Local-only mode is fine. The moment a user adds `cloudflared` (which the README and `bin/squadron.js` actively encourage), the daemon becomes publicly reachable and exposes two unauthenticated holes: an MCP HTTP endpoint and a vault static route that share no gate with the whitelisted WS. The supply-chain story is genuinely good — OIDC trusted publisher with verified SLSA v1 provenance, no `NPM_TOKEN` anywhere, a working secret-scan pre-push hook, a strict `files` allowlist enforced in CI. There are zero secrets in the repo or git history. The end-user data plane (vaults, SQLite, OAuth tokens) lives on the user's machine and is not transmitted anywhere. The three top risks, ranked:

1. **MCP HTTP endpoint and `/vault/...` static route are unauthenticated and ride the same cloudflared tunnel as the whitelisted WS.** An attacker who learns a tunnel URL + an agent UUID can drive tools and exfiltrate vault files without ever touching the WS gate.
2. **Default daemon mode is "OPEN" — first-run users with cloudflared installed get a publicly-reachable daemon with no token gate** unless they manually run `bun run whitelist add ...` first. The README and `bin/squadron.js` set up the tunnel without nudging the user toward gating it.
3. **Subprocess sandbox is `--dangerously-skip-permissions`** and the cwd is the agent's vault, but `claude-code`'s `Bash`/`Write`/etc. tools are *not* meaningfully sandboxed to the vault dir — they have full filesystem access as the user. This is fundamental to the product (it's the whole point of agent autonomy) but should be surfaced to end users in red letters.

Everything else is below the bar that should block a release, but several items are worth fixing before driving more npx installs.

---

## 2. Architecture as it actually runs

```
[end user's Mac]
│
├── bin/squadron.js  ─── Node bootstrap; checks bun + claude + cloudflared,
│                        execs scripts/bringup.sh
│
├── scripts/bringup.sh  ── starts the three local processes:
│   │
│   ├── daemon (Bun, port 7878) ──── daemon/index.ts → daemon/server.ts
│   │   ├── ws://:7878/ws            JSON-line protocol
│   │   │     [GATE: whitelist token if file populated, else OPEN]
│   │   ├── http://:7878/health      JSON status
│   │   └── http://:7878/mcp/agent/:id   MCP HTTP per agent
│   │         [GATE: NONE — relies on agent-UUID guess for tool exec]
│   │
│   ├── static server (Bun, port 8787) ── scripts/static.ts
│   │   ├── /Squadron.html, /src/*.jsx, /tokens.css   (UI shell)
│   │   └── /vault/<agentId>/<path>                   (vault file blobs)
│   │         [GATE: NONE — only safeJoin path-traversal guard]
│   │
│   └── (optional) 2× cloudflared quick tunnels
│       wss://<rand1>.trycloudflare.com → :7878
│       https://<rand2>.trycloudflare.com → :8787
│       URLs are ephemeral, regenerated each restart
│
├── per-agent worker (one per Live agent)
│   Bun.spawn("claude", [-p, --output-format stream-json, --input-format stream-json,
│                        --verbose, --include-partial-messages,
│                        --dangerously-skip-permissions,
│                        --append-system-prompt <augmented>,
│                        --resume <session-id>?,
│                        --mcp-config <inline-json pointing at the daemon's MCP HTTP>])
│   cwd = ~/.hexagent/agents/<id>/vault/
│   env: ANTHROPIC_API_KEY DELETED to force OAuth-from-keychain
│
├── ~/.hexagent/squadron.db  ── SQLite (WAL); world state, messages
└── ~/.hexagent/agents/<id>/vault/  ── markdown vaults (Obsidian-compatible)
```

**Trust boundaries:**

| Component | Trust boundary | Talks to |
|---|---|---|
| Daemon `/ws` | Whitelist gate (open by default) | UI clients, MCP-self via subprocess |
| Daemon `/mcp/agent/:id` | **None** — relies on UUID being unguessable | The agent's own claude subprocess (intended); anyone with HTTP access (actual) |
| Static server `/Squadron.html` etc. | None (public assets) | Browsers |
| Static server `/vault/<id>/<path>` | None — `safeJoin` only | Browsers (intended for in-page previews; public if tunneled) |
| `claude` subprocess | Inherits user's OS keychain OAuth; cwd=vault but full FS access | Anthropic API, the daemon's MCP, anything the agent writes/runs |
| SQLite + vault FS | Filesystem perms = user's own | Daemon, claude subprocess |
| cloudflared tunnel | None — the *whole point* is to make local services public | Internet ↔ daemon/static |

---

## 3. Threat model (STRIDE-lite)

### 3.1 Daemon WS (`/ws`)
- **Spoofing / Auth:** Open mode by default (`daemon/whitelist.ts:62-67`). Adding any token flips to gated. The check itself is correct: random 144-bit token, file re-read every connection (no-restart revoke), constant-string compare via `.find` — fine for the threat scope.
- **Tampering / Injection:** All inbound events go through `isClientToDaemon` discriminated-union validation in `daemon/protocol.ts` (file referenced; not exhaustively read but the dispatcher in `server.ts:548-560` rejects unknown events with no further parsing). `JSON.parse` is wrapped in try/catch. No string concatenation into shell. SQLite is via prepared statements throughout `db.ts`. Adequate.
- **Disclosure:** A WS client gets the full world snapshot (`server.ts:577-587`) — every agent's name/position/system-prompt and every message. In OPEN mode, this is leaked to anyone with the URL. **Mitigation: gating the daemon.**
- **DoS:** No rate limit on `send-message` events; an attacker with WS access can spawn arbitrary `claude` subprocesses (auto-boot in `server.ts:825`) and exhaust the user's Anthropic concurrency / billing. Auto-trigger budget (4 turns/pair) limits inter-agent loops, but a single attacker prompting from outside is not budgeted.
- **Elevation:** A connected client can `delete-agent`, `place-feature`, `write-vault-file`, `install-skill` (writes arbitrary markdown into the vault). Skill content is written verbatim via `installSkill` in `vault.ts:377-411` — an attacker can plant misleading skill files that change agent behavior on next read.

### 3.2 MCP HTTP server (`/mcp/agent/:id`)
- **Auth:** **None.** `daemon/server.ts:537-538` calls `handleMcpRequest(req, world, mover)` with no whitelist check. The whitelist is only consulted for `/ws` (server.ts:510-518).
- **Discovery:** `initialize` and `tools/list` succeed for any agentId string (`mcp-server.ts:99-125`). They leak the tool catalog and protocol version.
- **Tool exec:** Tool calls (`sendTo`, `readNeighborVault`, `moveToward`) gate on `world.agent(callerId)` returning a real agent (`world-tools.ts:64-65`, `:96-97`, `:128-129`). So an attacker needs a valid UUID to do anything beyond discovery.
- **Where do UUIDs leak?** Three places in the public surface: (a) the `world-snapshot` WS event (gated by whitelist if you've enabled it; otherwise free), (b) the `/vault/<agentId>/...` static route (which an attacker can crawl by enumerating agent IDs only if they have one to start), (c) UI-side rendering — anyone with the static URL gets agent IDs in JS state.
- **Impact if a UUID is known:** An attacker can call `send_to(name, text)` as that agent, planting messages in the inter-agent chat (which auto-triggers other agents and burns LLM tokens on the user's bill). They can also `read_neighbor_vault` to exfiltrate any adjacent agent's `.md` files, and `move_toward` to reposition agents. They cannot directly call the `claude` subprocess or its tools (`Bash`, `Write`, etc.) — those live inside the subprocess.
- **Mitigation present:** Adjacency check is enforced server-side (`world-tools.ts:71-77`, `:103-108`).
- **Mitigation absent:** No origin check, no token, no per-agent secret. CORS is wildcarded (`mcp-server.ts:50-54, 184`).

### 3.3 Static server (`scripts/static.ts`)
- **Path traversal in `safeJoin`** (lines 50-56): strips leading `/`, normalizes, refuses paths that escape `base + "/"`. This is correct — `normalize` collapses `..`, then the `startsWith(base + "/")` check catches sibling escapes (`/etc/passwd` → `/Users/.../squadron/ui/etc/passwd`, blocked by the not-found from `Bun.file().exists()` since that path doesn't exist; `..` blocked by the prefix check). **Verified safe.**
- **Vault route** (`static.ts:69-84`): UUID regex `[0-9a-f-]{36}` is a sanity check, not a security control — it just means the agent ID has to look like a UUID. Anyone with that UUID can read any file in the vault including `identity.md` (which contains the system prompt). **No auth.**
- **MIME type for `.html` is `text/html`** — vault files served as `.html` will execute in the browser's origin (`static.ts:21`). Combined with the in-app iframe `sandbox="allow-same-origin allow-scripts allow-popups allow-forms"` (`app.jsx:2046`), an attacker who plants an `.html` file in a vault and gets the user to preview it has roughly normal-website privileges within the static server's origin. They could fetch other vault files cross-vault by bouncing through the same origin.
- **CORS:** `*` everywhere (`static.ts:80, 96`). For static assets that's fine; for `/vault/...` it means any web page in any tab can read vault files if they know the agent UUID.

### 3.4 Per-agent claude subprocess
- **Sandbox:** `--dangerously-skip-permissions` (`daemon/claude-cli.ts:33`) — the agent has *no* per-tool prompts. It can `Bash` arbitrary commands as the user. The cwd is the vault dir, but `Bash`/`Write`/`Edit` accept absolute paths; they are NOT chrooted. Comment in `claude-cli.ts:31-33` claims "claude-code's other tools (Read/Write/Bash/etc.) are sandboxed to the agent's vault dir" — **this is incorrect and should be fixed in the comment**. The subprocess inherits the full user environment.
- **Auth:** `ANTHROPIC_API_KEY` is explicitly dropped from the subprocess env (`agent-worker.ts:62-63`) to force OAuth from the OS keychain. Good — prevents accidental API-key billing and means Squadron itself never sees credentials.
- **Prompt-injection threat:** Inter-agent messages are auto-prepended to the next user turn (`server.ts:806-822`) with no sanitization beyond JSON encoding. A malicious neighbor (or anyone with a valid agentId via the open MCP) can feed text that the recipient's claude session will read as part of its "user prompt" — including instructions to use `Bash` to do arbitrary things on the user's machine. This is fundamental to multi-agent systems but worth surfacing.
- **Resource:** No per-process memory/CPU/time limit. No global cost ceiling (M4-planned per `spec.md:198`).

### 3.5 Vault filesystem
- **Sandboxing:** `resolveVaultPath` (`vault.ts:450-457`) refuses absolute paths, `..` substrings, and paths that don't `startsWith(root + "/")`. **Verified safe.**
- **`identity.md` write/delete protection:** `writeVaultFile`, `moveVaultFile`, `deleteVaultFile` all guard on `full === join(root, "identity.md")` (`vault.ts:303-304, 327-329, 351`). Good.
- **Skill name normalization:** `normalizeSkillName` (`vault.ts:368-371`) regex-restricted to `[a-z0-9_-]{1,64}`. Skill *content* is written verbatim — markdown only, but markdown can contain wikilinks the agent will follow.

### 3.6 cloudflared tunnel
- **Trust:** Quick tunnels at `*.trycloudflare.com` are ephemeral but *publicly resolvable*. Anyone who knows the URL gets through. Cloudflare's logs may exist; the user has no control over that.
- **Discovery:** Quick tunnel hostnames are `random-words-pattern.trycloudflare.com` — not enumerable in practice (~2^60 keyspace), but URLs leak through chat logs, screenshots, browser history sync.
- **Defaults:** `bin/squadron.js:74-76` notes that without cloudflared the user runs in local-only mode. With cloudflared installed, `bringup.sh` *always* starts the tunnels — there's no opt-out at the npx level (only `SKIP_TUNNELS=1` env var exists at the bash layer). End user is not prompted "do you want to expose this to the internet?".

### 3.7 npm distribution chain
- **OIDC trusted publisher:** Verified — `dist.attestations.provenance.predicateType = "https://slsa.dev/provenance/v1"` for v0.1.2 in the registry response. `_npmUser.trustedPublisher.id = "github"`. No `NPM_TOKEN` in workflow (`publish.yml`). Confirmed via `curl https://registry.npmjs.org/-/npm/v1/attestations/@m-luketin%2fsquadron@0.1.2` — bundle includes a Sigstore certificate naming the GitHub Actions workflow.
- **CI gates** (`ci.yml`): `tsc --noEmit`, `scripts/scan-secrets.sh`, files-allowlist guard. All three are sane.
- **Tarball contents:** `npm pack --dry-run` shows 34 files in the working tree (vs. 30 published in v0.1.2 — the delta is the new `squadron-logo*` PNGs and the new `connections.jsx`/`data.jsx` revisions; also a `--hot`-only thing). Allowlist is `bin/, daemon/, scripts/, ui/, LICENSE, README.md`. No `.git`, no `node_modules`, no `.env`. ✓
- **Dependencies:** Two dev deps, `@types/bun` and `typescript`. Zero runtime deps. The runtime depends on Bun + claude-code CLI being preinstalled. **Tiny supply chain footprint.** This is excellent posture.
- **One concern:** v0.1.0 was published manually (no provenance — see `squadron_packaging_plan.md:111-113`). Anyone pinning `@0.1.0` gets an unsigned tarball. Recommend deprecating `0.1.0` on npm with a note pointing at `0.1.2+`.

---

## 4. Distribution & supply chain

| Item | Status | Notes |
|---|---|---|
| OIDC trusted publisher | ✓ | Verified via npm registry response; no NPM_TOKEN in workflow |
| SLSA v1 provenance | ✓ | Verified; bundle contains valid Sigstore cert pointing at `m-luketin/squadron/.github/workflows/publish.yml@refs/heads/main` |
| `files` allowlist | ✓ | CI guard in `ci.yml:21-29` rejects unexpected paths |
| `scan-secrets.sh` pre-push | ✓ | Patterns cover sk-ant-, sk-, ghp_/ghs_/gho_/ghu_, AKIA, JWT, xox[baprs]-, AIza, sk_live_; runs in CI as well |
| Runtime deps | ✓ | Zero — everything is provided by Bun stdlib + the claude-code CLI |
| `0.1.0` (no provenance) | ✗ | Manual publish, no signature; consider `npm deprecate` |
| `bin/squadron.js` shells out via `execSync` | ⚠ | Only runs `command -v <name>` and `cmd --version` with hardcoded args; no user input. Safe. |
| `install.sh` curl-pipe-bash | ⚠ | Standard footgun pattern; mitigated only by the GitHub HTTPS guarantee. Common in this niche; not actionable beyond signing the script if the repo gets popular. |
| `scripts/bringup.sh` `pkill -f "bun run …"` | ⚠ | Pattern is loose enough to kill a user's *other* `bun run` processes that match. Low impact — only affects users who happen to be running other bun processes named identically. |

**No concerning dependencies.** No transitive deps to audit.

---

## 5. End-user attack surface (`npx @m-luketin/squadron` from a stranger's box)

### Ports opened
- **7878** (daemon WS + MCP HTTP + healthcheck) — bound to `localhost` by default per `daemon/index.ts:7-8` (`SQUADRON_HOST` env var, defaults to `localhost`).
- **8787** (static server) — bound by `Bun.serve({port: PORT})` in `static.ts:63-65` with no `hostname` set; Bun's default is `0.0.0.0`. **This means the static server is reachable from the LAN by default** (anyone on the same Wi-Fi can hit it), even without cloudflared. The daemon itself is localhost-only; the static server isn't.
- **Cloudflared** opens *outbound* HTTPS to Cloudflare; no listening port.

### What runs as which user
Everything runs as the invoking user. No privilege separation. The `claude` subprocess inherits the user's full env (minus `ANTHROPIC_API_KEY`).

### Daemon WS exposure
- WS: gated by whitelist if file populated; **OPEN by default**.
- MCP HTTP: **never gated** — see § 3.2.
- `/health`: leaks agent count, worker count, feature count, whitelist-open boolean. Not a secret but useful for an attacker probing whether the host runs Squadron.
- Vault routes (over the static server, not the daemon): no gate beyond `safeJoin`.

### Whitelist gate — is the default safe?
The default is "anyone with the URL connects" (`whitelist.ts:55-58`). For local-only use, that's fine — `localhost` can't reach the box from outside. But:
1. The static server binds `0.0.0.0` by default → LAN exposure even without cloudflared.
2. With cloudflared, the daemon WS is on the public internet *and the static server is also on the public internet via the second tunnel*. The whole "OPEN mode is fine for local dev" assumption breaks.

**Default is NOT safe for the README's documented `npx` flow.** The `bin/squadron.js` flow auto-enables tunnels if cloudflared is installed and never asks the user to gate. **Recommendation:** when cloudflared is detected and `~/.hexagent/whitelist.json` is empty/missing, `bringup.sh` should auto-generate a token and bake it into the printed URL (or refuse to start with tunnels until the user runs `bun run whitelist add ...`). This is a P0 fix.

### Cloudflared tunnel — is exposure explicit?
Partly. `bin/squadron.js:71-72` says "cloudflared found — remote access available" in green. It does not say "cloudflared found — your daemon is now publicly reachable on the internet." The `bringup.sh` output includes the public URL but does not warn that *anyone* with that URL can drive agents (in OPEN mode). The README has the whitelist section but treats it as "optional, for sharing access" — not "required, before any tunnel starts."

### Browser CDN deps and SRI
`ui/Squadron.html:885-890`:
- `react@18.3.1` from unpkg — **SRI present**, sha384.
- `react-dom@18.3.1` from unpkg — **SRI present**, sha384.
- `@babel/standalone@7.29.0` from unpkg — **SRI present**, sha384.
- `marked@12.0.2` from cdn.jsdelivr — **NO SRI**. Pinned version, no integrity hash.
- `dompurify@3.1.5` from cdn.jsdelivr — **NO SRI**. Pinned version, no integrity hash.

The marked + dompurify gap is meaningful: those libraries process untrusted input (agent message text → marked → dompurify → `dangerouslySetInnerHTML` in `sidebars.jsx:168`). A jsdelivr compromise (or a tampered response, e.g. via an MITM if the user's network is hostile) could swap the sanitizer for a no-op. Add SRI hashes — fix is one line each.

### Vault file route + `safeJoin`
Verified safe (§ 3.3). `normalize` + `startsWith(base + "/")` correctly rejects `..`, absolute paths, and prefix-collision attacks (e.g. `/Users/.../squadron/ui-evil/...`).

### MCP per-agent tool gating
- Adjacency: enforced server-side via `world.connectedAgents()` (`world.ts:167-233`). The check looks at hex direct-adjacency *or* shared router cluster (BFS over router-router adjacency). Sound.
- Caller identity: derived from URL path `/mcp/agent/<id>` and looked up in `world.agent(callerId)`. **The daemon trusts that the caller IS that agent** — there is no per-agent secret (e.g., a token only the spawned subprocess knows). The mitigation is "the URL is on localhost". With cloudflared, that mitigation evaporates. See § 3.2 — this is the P0 finding.
- Spec claims "adjacency-gated incl. router-cluster bridges" (spec.md:90) — verified true.

---

## 6. Secrets & credentials

- **Repo:** Clean. `bash scripts/scan-secrets.sh` returns `✓ Clean. No secrets/PII detected.` on the working tree.
- **Git history (`git log --all -p | grep -iE '(secret|token|api[_-]?key|sk-)'`):** No real secrets. Hits are all comments/scanner patterns/UI placeholder text (`'sk-ant-…'` placeholder in `connections.jsx:92`).
- **Tarball:** No `.env`, no `*.key`, no `*.credentials`, no SQLite files. Verified via `npm pack --dry-run`.
- **Daemon does not store credentials.** The agent worker explicitly *deletes* `ANTHROPIC_API_KEY` from the subprocess env (`agent-worker.ts:63`) so any actual secret lives only in the user's OS keychain via the `claude` CLI's own auth.
- **Whitelist tokens** live at `~/.hexagent/whitelist.json` and are correctly excluded from any git-tracked path (`scan-secrets.sh:114-121` blocks accidentally tracking them).
- **CI:** No `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or other npm/registry secret in `publish.yml` or `ci.yml`. Verified — workflow uses pure OIDC.

**No leaks found.**

---

## 7. Code-quality risks (patterns that invite future CVEs)

1. **`dangerouslySetInnerHTML` from network input** (`sidebars.jsx:168`): currently fed only by `DOMPurify.sanitize(marked.parse(text))`. Correct *if* DOMPurify is what we think it is — see SRI gap in §5. If anyone refactors and bypasses the sanitizer, this becomes XSS. Worth a code comment naming the sanitizer requirement explicitly. Consider centralizing the markdown→HTML pipeline so future callers can't skip it.
2. **`require("node:fs")` lazy imports** in `vault.ts:332, 355, 425` — these mix CJS-style require into an ESM module. Works under Bun but brittle. Move to top-level ESM imports.
3. **`mcp-server.ts:41` regex extracts agentId from URL** with no UUID-shape validation; tools then look it up in the DB. Adding a UUID-shape regex (`[0-9a-f-]{36}`) at the URL parse layer would fail-closed earlier and give a cleaner error to confused MCP clients.
4. **`sendTo` text is unbounded** (`world-tools.ts:79`). No length cap. An agent (or attacker via MCP) can DoS the recipient's prompt by sending megabytes.
5. **The auto-trigger throttle is per-pair, not per-recipient or global** (`server.ts:138`). A coalition of N agents can burn the user's budget at N× the per-pair cap.
6. **`augmentSystemPrompt` interpolates agent names directly into the system prompt** (`server.ts:36-97`) — agent names are user-controlled (rename), so a malicious user (or a jailbroken agent, in a multi-user future) could craft a name that breaks out of the prompt structure. Fine for v1 single-user, urgent in phase 2 multi-user.
7. **The static server cwd-resolves at import time** (`static.ts:16`): `resolve(import.meta.dir, "../ui")`. This is correct only if the script is invoked from its own directory or via Bun's normal resolution. The `bringup.sh` cd's into `$REPO` first, so it's fine — but the implicit invariant is fragile.

None of these is a present CVE. All would be cheap to harden now and expensive later.

---

## 8. Operational gotchas for end users

These should be in the README's "before you run this" section, not buried in the spec:

1. **The agents can run arbitrary shell commands as you.** That's fundamental — `claude` has `Bash`, `Write`, `Edit`, etc., and Squadron passes `--dangerously-skip-permissions`. Don't run untrusted instructions through Squadron agents.
2. **5+ concurrent Live agents on one Anthropic subscription will hit limits** (documented in `squadron_runtime_ops.md:106-109` — observed once, briefly auto-suspended the user's account). End users should know.
3. **`cloudflared` exposes the daemon publicly.** The static server is on `0.0.0.0` even without cloudflared (LAN-reachable).
4. **The daemon writes anywhere under `~/.hexagent/`.** SQLite at `~/.hexagent/squadron.db`, vault dirs at `~/.hexagent/agents/<id>/vault/`. Nothing outside that root, but inside it the daemon will create directories and files freely.
5. **Vault dirs are not deleted on agent kill.** Erasing an agent leaves its vault on disk (intentional — see `spec.md:178`). End users should know to clean `~/.hexagent/agents/` periodically.
6. **`bun --hot` mode is unsafe for editing-while-running** (DB connection closes — see `squadron_runtime_ops.md:62-64`). The `bringup.sh` script correctly uses `daemon:prod`; users running `bun run daemon` directly might hit this.
7. **Whitelist tokens are stored in plaintext in `~/.hexagent/whitelist.json`.** Filesystem perms protect them; the user should know they're not in the keychain.

---

## 9. Recommendations, ranked

### P0 — fix before any further public push

1. **Gate the MCP HTTP endpoint.** `daemon/server.ts:537-538` should pass through `validateWhitelistToken` *or* require a per-agent secret known only to the spawned subprocess. The cleanest fix: when bootAgent constructs the MCP URL (line 442), include a per-agent token (`?token=<random>` or in an HTTP header via `claude --mcp-config` — verify what the SDK supports), then enforce it at `mcp-server.ts:41`. **File:** `daemon/server.ts` + `daemon/mcp-server.ts`.
2. **Gate the `/vault/<agentId>/<path>` static route.** Currently anyone with the agent UUID and the static URL reads any file. Either: (a) move the route to the daemon and require the same WS whitelist token, or (b) generate a per-vault-file capability token. **File:** `scripts/static.ts:69-84`.
3. **Auto-gate when cloudflared starts.** In `scripts/bringup.sh`, before launching the cloudflared steps, check `~/.hexagent/whitelist.json`; if empty, generate a token, write it, and embed it in the printed URL. Refuse to print a tunnel URL unless gated. **File:** `scripts/bringup.sh:64-93`.
4. **Add SRI to marked + dompurify.** **File:** `ui/Squadron.html:889-890`. One line each, integrity hash from the cdn.jsdelivr lock pages.
5. **Bind the static server to `127.0.0.1` by default.** Add `hostname: process.env.HOST ?? "127.0.0.1"` to `static.ts:63-65`. The cloudflared-driven path already goes through `localhost:8787`, so no functional regression. Removes accidental LAN exposure. **File:** `scripts/static.ts:63-65`.

### P1 — fix in the next release

6. **Deprecate `@m-luketin/squadron@0.1.0` on npm** (no provenance). `npm deprecate @m-luketin/squadron@0.1.0 "Use 0.1.2+ — this version was published without SLSA provenance"`.
7. **Cap `sendTo` text length** (e.g., 4 KB). `daemon/world-tools.ts:56-82`.
8. **Add a length/rate cap on inbound WS `send-message`** events to limit the cost of an attacker who has a token. `daemon/server.ts:782-836`.
9. **Surface the "agents can run shell as you" warning in the npx first-run output** (red text, two lines). `bin/squadron.js:78-84`.
10. **Fix the misleading comment in `daemon/claude-cli.ts:30-33`** — the sandbox claim is wrong.

### P2 — nice to have

11. **Validate agent UUID shape at the URL layer in MCP** (`mcp-server.ts:41`).
12. **Move lazy `require("node:fs")` calls to top-level ESM imports** (`vault.ts:332, 355, 425`).
13. **Pin the static server's CSP** via response header (`default-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://www.googletagmanager.com`). It can't be tight while babel-standalone is in play (needs `'unsafe-eval'`), but every other directive can be tightened.
14. **Audit the `bringup.sh` `pkill -f` patterns** to avoid killing other `bun run` processes that match the substring (low impact, low effort).
15. **Add a `--no-tunnels` flag to `bin/squadron.js`** so users can pass it explicitly without setting `SKIP_TUNNELS=1`. Discoverability.
16. **Document the LaunchAgent / persistent-mode story** — currently nothing auto-starts; some users will want that.

---

## Closing

The release pipeline is in genuinely good shape: OIDC, provenance, allowlist, pre-push secret scan, zero runtime deps. The local data plane is sound (sandboxed vault paths, prepared SQL statements, no credentials in repo or daemon). The product-level decision to drive `claude --dangerously-skip-permissions` is fundamental and should be surfaced loudly to end users, but it isn't a bug.

The biggest gap by a wide margin is the **mismatch between the WS whitelist gate and the rest of the daemon's HTTP surface** — MCP and vault routes don't share the gate, and turning on cloudflared makes that mismatch internet-reachable. P0 #1–#3 close that gap. With them fixed, recommending `npx @m-luketin/squadron` to a stranger becomes straightforward yes, not yes-with-caveats.

— end —
