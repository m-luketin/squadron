# MD content audit — 2026-05-03

## TL;DR

Drift is moderate, concentrated in three places. **The single thing that MUST be fixed before pushing 0.1.3** is `README.md:30-58` — it tells `npx` users they get "daemon + static server + tunnels," but as of commit `7893aff` (today's P0 security pass), `npx @m-luketin/squadron` is local-only by default and `--public` is required to start cloudflared. The README is the npm.org-visible page; shipping the wrong install behavior story is the most embarrassing kind of drift. Two other P0s: the seed-demo Tutor vault tells brand-new users to "click between two hexes" to place a wall (walls go ON a hex, not between), and Architect's `mcp-wire.md` says "Three tools" then lists four. Beyond P0, `spec.md` still says PAIR_BUDGET = 6 in two places (code is 4 — fixed in `ea6ecd6` for the comment, missed in spec), and `pitch-brief-2026-05.md` + `security-architecture-review-2026-05.md` both quote `0.1.2` as latest (transitional drift; will resolve when 0.1.3 publishes). The two long docs reviews (`security-architecture-review-2026-05.md`, `code-cleanup-2026-05.md`) are partially superseded by today's commits — several P0/quick-win items they list have been actioned. Voice/tone is consistent and good across the public-facing surfaces (README + landing).

---

## P0 (block 0.1.3 push)

### `README.md:34` — wrong install behavior
**Wrong:** "The CLI checks your dependencies, starts the daemon + static server + tunnels, and prints the URL to open in your browser."
**Truth:** Per `bin/squadron.js:23-24,140` (commit `7893aff`), `npx @m-luketin/squadron` is now local-only by default. Tunnels require explicit `--public`. The bin sets `SKIP_TUNNELS=1` unless `--public` is passed.
**Fix:** Replace with something like: "The CLI checks your dependencies, starts the daemon + static server (local-only — bound to 127.0.0.1), and prints the URL to open in your browser. Pass `--public` to also start cloudflared tunnels with an auto-generated whitelist token. `Ctrl+C` shuts everything down."

### `README.md:53-56` — outdated dev workflow comment
**Wrong:** "`bun run up                    # daemon + static server + cloudflared tunnels` / `# OR for local-only (no remote access):` / `SKIP_TUNNELS=1 bun run up`"
**Truth:** `scripts/bringup.sh:57-66` confirms `SKIP_TUNNELS=1` still works for local-only via `bun run up`, but the canonical user path is now `npx @m-luketin/squadron --public` (see `bringup.sh:62-65`'s own self-referential message). Block is technically still accurate for the dev path but inconsistent with the new npx default.
**Fix:** Reorder: lead with the local-only command, mention `SKIP_TUNNELS=1` as the equivalent for the `bun run up` dev path. Add a one-line note that the published bin uses `--public` flag instead.

### `daemon/seed-demo.ts:55` — Tutor's getting-started.md tells the user to place walls wrong
**Wrong:** "**Place a wall.** Hit `3`, click between two hexes."
**Truth:** Walls are placed ON a hex, not between. See `ui/src/hexgrid.jsx:715-718` — `mode === 'wall'` calls `onPlaceFeature(hex.q, hex.r, 'wall')` for the hex the cursor is on. The seed-demo's own `architecture.md` and the spec describe walls as hex-occupying features. New users following this instruction will be confused.
**Fix:** "Hit `3`, click an empty hex." (Optionally also note drag-paint works.)

### `daemon/seed-demo.ts:108` — Architect's mcp-wire.md says "Three tools" then lists four
**Wrong:** "Three tools:" followed by a four-item list including `move_to(q, r)`.
**Truth:** Bullet list contains `send_to`, `read_neighbor_vault`, `move_toward`, `move_to` — that's four. `move_to` was added in commit `4a1721d` and is in `daemon/world-tools.ts:174-202` + `TOOL_DEFINITIONS:249-265`.
**Fix:** "Four tools:" — and the same content is fine.

### `daemon/seed-demo.ts:107` — same file, MCP URL hostname
**Wrong:** "`http://127.0.0.1:7878/mcp/agent/<agentId>`"
**Truth:** `daemon/server.ts:512` builds the URL using `opts.host`, which `daemon/index.ts:8` defaults to `"localhost"` (not `127.0.0.1`). Functionally equivalent but the seed file is asserting precision it doesn't have.
**Fix:** Use `localhost` or note "(or 127.0.0.1; the daemon binds 127.0.0.1 only by default)".

---

## P1 (fix before next release)

### `spec.md:91` and `spec.md:194` — wrong PAIR_BUDGET value
**Wrong:** "Per-pair turn budget (6)" appears twice.
**Truth:** `daemon/server.ts:138` is `PAIR_BUDGET = 4`. Commit `ea6ecd6` fixed the comment in server.ts that said "(6 consecutive)" — but the spec wasn't updated.
**Fix:** Replace both `(6)` with `(4)`.

### `spec.md:82` — implementation-status timestamp is stale
**Wrong:** "(as of 2026-05-02)"
**Truth:** Wikilink parsing (M-MDContract subset), MCP HTTP auth, `move_to(q,r)`, demo seed, OpenRouter worker phases 1+2, security P0 fixes all landed 2026-05-03.
**Fix:** Bump to `(as of 2026-05-03)` and ensure the table reflects the additions below.

### `spec.md:104-117` — "Not yet shipped" milestone table is partially wrong
- **M-MultiModel** listed as not shipped, but commits `7357cc3` (worker factory), `ced63b8` (OpenRouter worker), `6157c8f` (WS protocol for OpenRouter config) just landed. Should be flagged "in progress — phases 1+2 shipped (Worker abstraction + OpenRouter); Gemini/Ollama still pending."
- **M5** (Next.js + Tailwind + shadcn): unchanged, still correct as not shipped.

### `spec.md:208` — claims wikilink parsing shipped but text is contradictory
The line says "Wikilink parsing shipped (May 2026)" — that's accurate. But the line just above (spec.md:168) says "M3 has placeholder edges; full wikilink parsing is M-MDContract." Same file disagrees with itself between section 8 and section 11.
**Fix:** Update spec.md:168 to match — wikilinks ship; M-MDContract is now just frontmatter contract + scopes + verifier.

### `spec.md:14` — pentagon.run positioning may be stale
**Claim:** "channel/DM-shaped"
**Truth:** Per `docs/deck-review-2026-05.md:135`, pentagon.run's current copy is "visual workspace where every agent has a place" — they've moved into spatial framing. The competitive line in the spec is now weaker than it was when written.
**Fix:** Soften or update — the differentiator is now (a) open source, (b) markdown-vault substrate, (c) hex topology as permission model.

### `daemon/seed-demo.ts:157` — Spec milestones missing M-MultiModel progress
**Wrong:** "**M-MultiModel** — Gemini + Ollama providers (claude shipped)" is in the "Next" list.
**Truth:** OpenRouter worker shipped (commits `7357cc3`, `ced63b8`, `6157c8f`); Gemini/Ollama still pending.
**Fix:** Move M-MultiModel to a third "in progress" group, or note "(phases 1+2 shipped: Worker factory + OpenRouter; Gemini/Ollama pending)".

### `daemon/seed-demo.ts:152-158` — milestones missing M-MultiModel phases shipped
The "Shipped" section in `Spec.milestones.md` doesn't mention the OpenRouter / multi-model worker abstraction, even though it's in HEAD.
**Fix:** Add an entry for the Worker-interface refactor + OpenRouter worker.

### `docs/pitch-brief-2026-05.md:84,204` — version is stale
**Wrong:** "Latest 0.1.2 with SLSA v1 provenance" / "`@m-luketin/squadron` 0.1.2 published"
**Truth:** `package.json:3` is `0.1.3`; commit `98cd8fe` bumps to 0.1.3 (not yet pushed/published). Brief is transitional-stale.
**Fix:** Update to 0.1.3 once published, or add an inline `[VERIFY: 0.1.3 push pending]`. Same line at `:208` ("running on the founder's Mac mini today").

### `docs/pitch-brief-2026-05.md:73-77` — milestone descriptions incomplete
Brief's milestone breakdown matches the older spec.md status; add a line for the Worker refactor + OpenRouter (M-MultiModel phases 1+2) and the security P0 fixes (auth gate on MCP, vault-route gate, --public flag).

### `docs/pitch-brief-2026-05.md:75` — pair budget value
**Wrong:** "per-pair budget (4)" — actually correct, BUT the brief was written when spec said 6. Drift in opposite direction; brief is right, spec is wrong (see P1 #1 above).

### `docs/pitch-brief-2026-05.md:160` — codex confusion
**Wrong:** "Multi-model from day one (not Claude-only) *[VERIFY: codex provider still pending — see "Vision" below]*"
**Truth:** Codex still throws (`worker-factory.ts:20`), but OpenRouter is now real. Update the VERIFY note: codex still pending, but OpenRouter provider has shipped.

### `docs/security-architecture-review-2026-05.md:5,11-14,117-121,232-240,etc.` — review is now superseded by today's commits
The review correctly identified P0 issues that have since been fixed in commits `7893aff` and `ea6ecd6`:
- P0 #1 (gate MCP HTTP) — **fixed** in `ea6ecd6` (`server.ts` now calls `validateWhitelistToken` on `/mcp/agent/<id>` unless loopback peer).
- P0 #2 (gate `/vault/<agentId>/<path>`) — **fixed** in `7893aff` (`scripts/static.ts:80-85`).
- P0 #3 (auto-gate when cloudflared starts) — **fixed** in `7893aff` (`bin/squadron.js:117-134` auto-generates whitelist token + bakes into URL).
- P0 #5 (bind static to 127.0.0.1) — **fixed** in `7893aff` (`scripts/static.ts:23`).
- P0 #4 (SRI for marked + dompurify) — **[VERIFY:]** not visible in commits I read; check `ui/Squadron.html:889-890`.
**Fix:** Add a top-of-doc note: "Update 2026-05-03 evening: P0 #1, #2, #3, #5 addressed in commits 7893aff + ea6ecd6. P0 #4 (SRI hashes) status unverified at audit time." Plus per-section strikethroughs or "(addressed)" tags. The review's overall posture conclusion ("P0 #1–#3 close that gap") is now achievable evidence rather than aspirational.

Also `:5` "Subject: `@m-luketin/squadron@0.1.2`" — bump to 0.1.3 when re-issuing.

Also `:14` "the README and `bin/squadron.js` actively encourage" — no longer true; bin/squadron.js now defaults to local-only and refuses to start tunnels without `--public`.

Also `:138` "`scripts/bringup.sh` `pkill -f \"bun run …\"`" — still accurate.

Also `:147` "**This means the static server is reachable from the LAN by default**" — no longer true; `static.ts:23` defaults `HOSTNAME` to `127.0.0.1`.

### `docs/code-cleanup-2026-05.md:165-180` — spec drift section is stale
**Wrong:** "spec.md:115 still lists M6 as not yet shipped." / "wikilink parsing shipped, but spec.md:208 says deferred"
**Truth:** Both addressed in commit `e4849d8`.
**Fix:** Add an "Update" header at the top noting which items have been actioned: items 1.1 (icons.jsx console.log — fixed), 1.5 (sidebars.jsx GraphAgentList ref — verify), 1.9 (BUSY_* block deleted — fixed in `e4849d8`), 1.16 (PAIR_BUDGET comment — fixed in `ea6ecd6`), 1.17 (verify), 4.x spec drift (fixed). Many "quick wins" still pending.

Also `:174-176` README "Install: `npx @m-luketin/squadron`" critique now needs a fresh look — the prerequisite gap is still real, but the install behavior itself has changed (local-only default).

### `landing/index.html:7,156` — "talk through MCP" + subscription wording fine; v0.1 marker is fine
The landing copy is accurate to current state. **One soft drift:** `:140` "your existing claude subscription runs the show" implicitly excludes the OpenRouter trial path that now exists in the daemon. Not a bug yet (no UI surfacing), but if OpenRouter trial gets wired into the install flow soon, the landing should update.

### `bin/squadron.js:1-9` — JSDoc header is ALREADY MOSTLY ACCURATE
**Audited claim:** "1. Confirms the prerequisites (Bun, claude-code) are present / 2. Hands off to scripts/bringup.sh which boots daemon + static + tunnels / 3. Forwards Ctrl+C to bringup so the user can stop with one keystroke"
**Truth:** Step 2 is misleading — only boots tunnels under `--public`. Step 1 doesn't mention cloudflared check (which is conditional but happens).
**Fix:** Replace step 2 with "Hands off to scripts/bringup.sh which boots daemon + static (and cloudflared tunnels if `--public`)." Optional: add a "0. Parses `--public` / `--help` flags" line.

---

## P2 (cleanup, no rush)

### `README.md:34-36` — `npx` install paragraph mentions things irrelevant to first-run
The paragraph mixes the install command, what it does, what `Ctrl+C` does, and the persistence claim. Tighten — split into install + what-runs + persistence (or just lift the wording from `landing/index.html` which says it cleaner in `:144-147`).

### `README.md:73-79` — feature bullets — keys & terms
- `:73` claims toolbar mode is `Spawn · Wall · Router · Erase · Select` w/ keys `S W R E V` — but actual default shortcuts are `1 2 3 4 5` (per `app.jsx:1016`). Same drift as `spec.md:136`. Either revert the shortcuts in code or update both files.

### `daemon/seed-demo.ts:64-72` — Tutor's tour.md
- `:64` mentions "Demo mode toggle" — actual top bar button is "demo on/off" (per `app.jsx:84-86`). Close enough; nit.
- `:66` "Two modes: **sessions** ... and **agents** ... Toggle with `⌘1` / `⌘2`." — verified accurate (`app.jsx:1003-1009`).
- `:68` "32×22 hex field" — accurate (`hexgrid.jsx:23`).
- `:70` "Click the avatar to enter the profile editor." — accurate (`sidebars.jsx:1184-1199`).

### `daemon/seed-demo.ts:71` — Tutor's tour says tabs have `delete` and `rename`
**Claim:** "Right-click for `pin`, `duplicate`, `rename`, `close others`, `close`, `delete`."
**Truth:** Tab context menu (`app.jsx:284-302`) has: pin/unpin, duplicate, rename, close-others, plus the standard close. `delete` is not a separate item. "rename" is `rename file…` — only on file tabs.
**Fix:** Drop `delete`, optionally clarify "rename" availability.

### `spec.md:136` — keyboard shortcuts `S W R E V` are pre-redesign
**Wrong:** "Keyboard: `S` `W` `R` `E` `V`."
**Truth:** Actual defaults are `1 2 3 4 5` (`app.jsx:1016`). Same drift as README.
**Fix:** Update to `1 2 3 4 5`, or note "user-rebindable; defaults `1 2 3 4 5`".

### `spec.md:319` — last-edited date stale
**Wrong:** "*Last edited: 2026-05-02. Replaces v1.1 of this doc.*"
**Truth:** Spec was edited in commit `e4849d8` on 2026-05-03.
**Fix:** Bump.

### `docs/pitch-brief-2026-05.md:60` — model dropdown list
**Claim:** "model (claude default opus 4.7, opus 4.7, sonnet 4.6, haiku 4.5, codex-1, codex-mini)"
**Truth:** Verified in `sidebars.jsx:1282-1287`. Accurate. (But the codex options don't actually work at the daemon — see `worker-factory.ts:20`.)

### `docs/pitch-brief-2026-05.md:77,80` — surfaces shipped list
The "~15 surfaces shipped" recap mostly matches but predates the OpenRouter worker, MCP auth gate, vault static-route gate, and the `--public` flag. If the brief is revisited for the deck, list these new surfaces.

### `docs/deck-review-2026-05.md:10` — "Pentagon.run's own marketing copy" line is fine
Verified by web fetch per the review itself; carries forward unchanged. Note the date claim "today" = 2026-05-03; if the brief is updated weeks from now the verification freshness should be re-flagged.

### `docs/deck-review-2026-05.md:32-37` — Cognition dates analysis
Review's verification looks methodologically careful (cited URL fetches). Carry forward; keep the P0 callout to fix the slide. **Out of audit scope** — these are about the deck HTML, not the doc.

### `docs/deck-review-2026-05.md:146` — A2A 1.0 release date still uncertain
The review correctly flags the spec.md:57 claim "hit 1.0 mid-April 2026" as `[VERIFY:]`. Spec carries the same unverified claim; both should resolve together.

### `landing/index.html:7,138-140` — "no API keys" is technically tightening
**Claim:** "No cloud, no API keys — your existing claude subscription runs the show."
**Truth:** Daemon now also supports OpenRouter via API key (`providers.ts`, `openrouter-worker.ts`). The OpenRouter path *is* an API key. This is fine if the landing intentionally markets the subscription path and treats OpenRouter as undocumented trial. **Flag if** the OpenRouter trial gets surfaced to alpha users.

### `daemon/seed-demo.ts:36-77` — Tutor wikilinks mostly resolve
- `[[squadron|what this is]]` — no `squadron.md` in Tutor's vault. Will render as broken/placeholder. Either create `squadron.md` or change the wikilink.
- `[[send-to|message each other]]` — resolves to `send-to.md` (line 73). ✓
- `[[getting-started]]` / `[[tour]]` — both exist. ✓
- `[[Spec.index|Spec]]` / `[[Architect.index|Architect]]` / `[[Skills.index|Skills]]` — these use a `<vaultName>.<fileName>` notation that the wikilink parser (`vault.ts:131-177`) is per-vault scoped; cross-vault wikilinks won't resolve. Either drop the cross-vault links from getting-started.md or wait until M-Addressing ships portable refs.

### `daemon/seed-demo.ts:113` — Architect's mcp-wire.md adjacency claim
**Claim:** "All adjacency-gated against the calling agent's connectedAgents() set..."
**Truth:** `move_toward` and `move_to` are NOT adjacency-gated — they bootstrap walking BEFORE adjacency. See `world-tools.ts:129-202`. Only `send_to` and `read_neighbor_vault` are adjacency-gated.
**Fix:** "send_to and read_neighbor_vault are adjacency-gated against the calling agent's connectedAgents() set; move_toward / move_to gate on movement-enabled, not adjacency."

### `daemon/seed-demo.ts:127` — Architect's security.md auth claim
**Claim:** "**Public mode (`--public`)** auto-generates a whitelist token... and prints a single ready-to-use URL with the token baked in."
**Truth:** Verified accurate (`bin/squadron.js:117-134`, `bringup.sh:96-104`). ✓ Good.

### `daemon/seed-demo.ts:124-128` — Architect's security.md missing the MCP gate
The new MCP HTTP auth gate from commit `ea6ecd6` is not mentioned. Worth adding a line: "MCP HTTP endpoint at `/mcp/agent/<id>` is gated by the same whitelist; loopback requests are exempted (so the local claude subprocess works without ceremony)."

### `daemon/seed-demo.ts:194-197` — Skills installing.md install location
**Claim:** "the daemon fetches it, writes to `<vault>/skills/<name>.md`, and updates `skills.md` (the hub)."
**Truth:** Verified — `daemon/vault.ts:377-411` `installSkill` writes `<root>/skills/<name>.md` and appends a wikilink to `skills.md`. ✓

### `daemon/seed-demo.ts:218-219` — Skills hub.md wikilink format
**Claim:** "wikilinks (`[[skills/summarize]]`, etc.)"
**Truth:** Per `vault.ts:401-409`, the appended line uses `[[<name>]]` (just the bare name, e.g. `[[summarize]]`) — not `[[skills/summarize]]`. The parser also stems on bare name (`vault.ts:139`).
**Fix:** Change to `[[summarize]]`, etc.

### `bin/squadron.js:55-61,69-75` — install hint commands
- `:58` says "`curl -fsSL https://bun.sh/install | bash`" — fine.
- `:71` says "`bun add -g @anthropic-ai/claude-code`" — accurate per `install.sh`.
- `:72` says "`claude auth login`" — verify against the actual claude CLI subcommand name. The README uses `claude auth login` too (`README.md:66`). [VERIFY:] confirm against current claude-code CLI.

---

## Seed-vault accuracy (demo agents)

### Tutor (`daemon/seed-demo.ts:23-77`)
| Claim | File:line | Verified | Notes |
|---|---|---|---|
| "Hit `2` (Spawn mode)" | seed-demo.ts:54 | ✓ | `app.jsx:1016` defaults match. |
| "Hit `3`, click between two hexes" | seed-demo.ts:55 | ✗ **P0** | Walls go ON a hex, not between. Wrong action verb. |
| "Hit `4`, click two non-adjacent hexes" | seed-demo.ts:56 | ✓ partial | Routers go on hexes too. Wording "click two non-adjacent hexes" is OK as instruction (place two of them). |
| "Top bar: Demo mode toggle" | seed-demo.ts:64 | ~ | Button label is "demo on/off"; close enough. |
| Two modes `⌘1`/`⌘2` | seed-demo.ts:66 | ✓ | `app.jsx:1003-1009`. |
| "Click an agent to focus, double-click to open chat" | seed-demo.ts:66 | ✓ | `sidebars.jsx:1948`. |
| "32×22 hex field" | seed-demo.ts:68 | ✓ | `hexgrid.jsx:23`. |
| Right sidebar contents (movement toggle, skills, etc.) | seed-demo.ts:70 | ✓ | Verified in `sidebars.jsx:1199+` (AgentConfig). |
| Tab right-click `delete` | seed-demo.ts:71 | ✗ P2 | No `delete` item in tab menu — only close/close-others. |
| `[[squadron|what this is]]` wikilink | seed-demo.ts:40 | ✗ P2 | No `squadron.md` exists in vault — broken link. |
| `[[Spec.index|Spec]]` cross-vault wikilink | seed-demo.ts:58-60 | ✗ P2 | Cross-vault wikilinks not supported (M-Addressing pending); will render as broken. |

### Architect (`daemon/seed-demo.ts:80-129`)
| Claim | File:line | Verified | Notes |
|---|---|---|---|
| "Daemon (Bun, port 7878)" | seed-demo.ts:100 | ✓ | `daemon/index.ts:9`. |
| WAL mode | seed-demo.ts:100 | ✓ | `daemon/db.ts` opens with WAL pragma. |
| "Static server (Bun, port 8787) ... Bound to 127.0.0.1 by default" | seed-demo.ts:101 | ✓ | `static.ts:23` (post commit `7893aff`). |
| "cloudflared for two public quick-tunnels ... when you pass `--public`. Whitelist token gating mandatory in that mode." | seed-demo.ts:103 | ✓ | `bin/squadron.js:117-134`, `bringup.sh:94-104`. |
| MCP URL `http://127.0.0.1:7878/mcp/agent/<agentId>` | seed-demo.ts:107 | ~ | Daemon defaults `host` to `localhost`; functionally same. P0 nit. |
| "Three tools:" then four bullets | seed-demo.ts:108-112 | ✗ **P0** | Off-by-one in count. |
| "All adjacency-gated against the calling agent's connectedAgents() set" | seed-demo.ts:113 | ✗ P2 | move_toward / move_to gate on movement-enabled, not adjacency. |
| `world.findPath()` / `world.findPathToHex()` | seed-demo.ts:116 | ✓ | `daemon/world.ts` has both. |
| "one hex per ~550ms via `setTimeout`" | seed-demo.ts:117 | ✓ | `server.ts:316` `WALK_STEP_MS = 550`. |
| Auto-prompt on arrival | seed-demo.ts:118 | ✓ | `server.ts:472-501` `onArrived`. No auto-prompt on hex arrival (`onArrivedHex:458-470`). ✓ matches Architect's claim "On arrival to a hex: just the system message". |
| Karpathy seed layout | seed-demo.ts:122 | ✓ | `vault.ts:113`. |
| `identity.md` daemon-managed, don't edit | seed-demo.ts:123 | ✓ | `vault.ts:303-304` etc. |
| OIDC trusted publisher, SLSA v1, no NPM_TOKEN | seed-demo.ts:128 | ✓ | Per security review §3.7. |
| MCP HTTP gate (post commit `ea6ecd6`) | — | ✗ P2 missing | Architect's security.md doesn't mention this. Worth adding. |

### Spec (`daemon/seed-demo.ts:132-175`)
| Claim | File:line | Verified | Notes |
|---|---|---|---|
| Vision: monetization at multi-user/cross-machine layer | seed-demo.ts:148-150 | ✓ | Matches spec.md §10/16. |
| Shipped milestones M0/M1/M3/M3.5/M6 | seed-demo.ts:154-158 | ✓ partial | Doesn't mention M-MultiModel phases 1+2 (Worker abstraction + OpenRouter) which shipped today. P1. |
| Next milestones list | seed-demo.ts:160-167 | ~ | M-MultiModel listed in "Next" — should be moved to "in progress". M5 / M4 / M-Identity / etc. all still accurately pending. |
| Anti-patterns | seed-demo.ts:170-174 | ✓ | Matches spec.md §4. |

### Skills (`daemon/seed-demo.ts:178-221`)
| Claim | File:line | Verified | Notes |
|---|---|---|---|
| Two install paths (URL + starter library) | seed-demo.ts:194-196 | ✓ | `vault.ts:377-411`, `data.jsx:76-154`. |
| Six pre-curated skills (named) | seed-demo.ts:196 | ✓ | All six present in `data.jsx`. |
| skills.md hub appended with wikilinks `[[skills/summarize]]` | seed-demo.ts:218 | ✗ P2 | Actual format is `[[summarize]]` (bare name, no folder prefix). |
| "daemon maintains this — don't hand-edit" | seed-demo.ts:219 | ✓ | `vault.ts:395-411`. |

---

## Cross-doc contradictions

1. **PAIR_BUDGET value.** `spec.md:91,194` says 6. `pitch-brief-2026-05.md:75` says 4. Code (`server.ts:138`) is 4. Spec is wrong.

2. **Hex toolbar shortcut keys.** `spec.md:136` and `README.md:73-79` (implicitly via the spec link) claim `S W R E V`. Code defaults are `1 2 3 4 5` (`app.jsx:1016`). README is silent on the keys but the cluster is referenced; spec is explicit and wrong. Tutor's tour (`seed-demo.ts:54-56`) is right (`2 3 4`).

3. **Wikilink parsing status.** `spec.md:168` says "M3 has placeholder edges; full wikilink parsing is M-MDContract." `spec.md:208` says "Wikilink parsing shipped (May 2026)". Same file disagrees with itself.

4. **Codex provider status.** `pitch-brief-2026-05.md:60` lists codex-1/codex-mini in the model dropdown (verified in `sidebars.jsx:1287`). `worker-factory.ts:20` throws "codex provider not yet implemented". The brief flags this in `:262` ("Codex provider — model dropdown lists ... but no Worker impl exists"); spec.md doesn't mention codex at all but lists "claude + codex" as v1 providers in `:226`. Resolution: codex is UI-only placeholder. Spec wording should say so.

5. **Tunnel default behavior.** `README.md:34` says tunnels start automatically. `bin/squadron.js:23-24,140` and `bringup.sh:62-65` make tunnels opt-in via `--public`. README is wrong (P0).

6. **Static server binding.** `security-architecture-review-2026-05.md:147,162` says static server binds 0.0.0.0 by default — was true at write-time, fixed in commit `7893aff` (`static.ts:23`). Review needs an update note.

7. **Latest npm version.** `pitch-brief-2026-05.md:84,204` and `security-architecture-review-2026-05.md:5,117-121,242` reference 0.1.2 as latest. `package.json:3` is 0.1.3 (commit `98cd8fe`, not yet pushed/published). Transitional drift.

---

*Audit complete. Output saved to `~/Desktop/squadron/docs/md-audit-2026-05.md`.*
