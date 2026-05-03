# Squadron — pitch deck brief

> Brief for Claude Design. Each numbered section maps to 1–3 slides.
> Voice: terse, confident, technical. Match the alpha landing page (`landing/index.html`).
> No hyperbole. No "revolutionary," no "10x," no "AI-powered." Earn the weight.
>
> Items marked `[VERIFY: …]` are guesses I couldn't confirm from the source files — founder must correct before sharing.
> Items marked `[CONFLICT: …]` are inconsistencies between memory files I refused to paper over.

---

## 1. Tagline + elevator (1 slide)

**Tagline:** *A spatial multi-agent control plane that runs on your machine.*

> **Founder note:** "agent playground" framing is preferred for the eventual headline copy. The current tagline is technically accurate but heavier than needed; designer has license to land on a warmer line built around "playground."

**Three-line elevator (lifted from `landing/index.html`, the founder's own voice):**

> Agents live on a hex grid. They share a markdown vault, walk to each other, talk through MCP tools.
> Karpathy-style LLM-Wiki memory. No cloud, no API keys — your existing claude subscription runs the show.
> Local-first, open source, one `npx` command.

Test: a stranger reads three lines and gets it. The hex grid is the hook.

---

## 2. The problem (2 slides — one for "single agent ceiling," one for "naive multi-agent")

**Slide A — the single-agent ceiling.** Today's agent tools are all built for *one* agent at a time:

- **Cursor / Continue / Cline / Roo** — IDE-shaped. One agent in one editor. No notion of multiple agents that coordinate.
- **Devin** — closed-source SaaS. You don't see the workspace, you don't own the memory, you can't compose your own team.
- **MetaGPT / AutoGen / CrewAI** — orchestration libraries. You write Python. There's no UI. There's no spatial intuition. There's no shared substrate the agents can read and edit like humans do.
- **Pentagon.run** — closest competitor. $50/mo, closed-source desktop app, Claude-only, single-user, channel/DM-shaped (Slack-with-bots).

**Slide B — what breaks when you try multi-agent yourself.** The naive thing — open six terminals, run six `claude` sessions, wave at the screen — falls apart fast:

- **Subscription ban risk.** Anthropic's per-subscription concurrency tripwire kicks in around 5+ concurrent CLI sessions. Founder hit a brief silent auto-suspend on 2026-05-02 from exactly this. There is no public spec for this — you discover it by getting cut off.
- **File-vault chaos.** Six agents writing to disk in your home directory with no shared addressing scheme = unrecoverable mess. Whose `notes.md` is whose? Who can read whose context?
- **Coordination is opaque.** Agent-to-agent memory is hidden inside conversation buffers. You can't audit it, branch it, edit it. The agents drift, repeat, contradict — and you can't see *why*.
- **No spatial affordance.** Slack-with-bots = everyone shouts in the same room. There's no "Alice walks over to Bob's desk." There's no topology. There's no way to *shape the team*.

The user-side workaround for everyone serious about multi-agent today is *manual coordination from a human meta-agent* (the founder uses a launchd-spawned Claude session called "Phil Jackson" for exactly this). That's a smart hack, not a product.

---

## 3. The Squadron answer (2–3 slides — one per subsystem cluster, OR one big architecture diagram)

Squadron is a **graph-native operating system for local agents**. Five subsystems, each load-bearing:

**Hex grid as spatial control plane.** The center of the UI is a 32×22 hex field (704 hexes). Agents are objects on hexes. You spawn them, drag them, paint walls between them, paint routers to connect distant clusters. Adjacency is a real thing: two agents can talk only if they share a hex edge or a router cluster. The grid isn't decorative — it's the permission model rendered as space.

**MCP-driven inter-agent communication.** The daemon hosts a per-agent MCP server at `/mcp/agent/:id`. Each agent gets three tools: `send_to(name, text)`, `read_neighbor_vault(name, path)`, `move_toward(name)`. All adjacency-gated. This is `claude` calling MCP tools — the same standard tool-call protocol the rest of the ecosystem already speaks. No bespoke wire format.

**Markdown vault as shared memory.** Every agent owns a folder at `~/.hexagent/agents/<id>/vault/`. Plain `.md` files. Obsidian-compatible. Wikilinks parsed (`[[file]]` / `[[file|alias]]` / `[[file#section]]`). New agents get [Karpathy's LLM-Wiki layout](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) seeded by default — `index`, `log`, `entities/`, `concepts/`, `sources/`, `synthesis/`. The user can read and edit any of it. Coordination state is files, not opaque memory.

**Walking metaphor.** Agents `move_toward(name)` — pathfind around walls and other agents, one hex per ~550ms with smooth animation. They form teams *at runtime* by walking together. Movement is per-agent toggleable. Nothing pre-provisioned.

**Right-sidebar agent config.** Per-agent panel: name, glyph, color, model (claude default opus 4.7, opus 4.7, sonnet 4.6, haiku 4.5, codex-1, codex-mini), photo (96×96), per-edge toggles for neighbors, telemetry. Click the avatar and the whole sidebar swaps to a profile editor with a 250-emoji picker.

**Memory graph.** Force-directed graph of one agent's vault. Real wikilink edges. Drag-to-pan, wheel-zoom, drag nodes. Per-node colors. Click a node, the file opens as a center-panel tab. The graph view replaces the right sidebar with a file-list panel. Demonstrated against Jordan's vault — 34 files, 202 wikilink edges, 3 thematic clusters with cross-cluster connections.

---

## 4. What's actually shipped (1–2 slides — checklist style, dense)

Pulled directly from `squadron_status.md`. This is real, running on the founder's Mac mini today.

**Milestones**

- **M0** — Bun + WS daemon, `claude -p` subprocess, stream-json parsing, basic UI.
- **M1** — SQLite (WAL), `--resume` for restart resilience, multi-tab WS sync, restore Live agents on daemon boot.
- **M3 (subset)** — per-agent vault folders, MCP HTTP server with `send_to` + `read_neighbor_vault` adjacency-gated, daemon-persisted walls + routers, inter-agent message persistence + delivery on next user turn, memory graph reads real `vaultFiles`.
- **M3.5** — per-pair budget (4) + throttle (1500ms) for auto-triggered replies, kill switch in top bar (autonomy on/off).
- **M6** — `move_toward`. Agents pathfind around walls and other agents one hex per ~550ms with smooth animation. Per-agent toggle.

**~15 surfaces shipped in the May 2026 push**

Memory graph (force sim, drag-pan, wheel-zoom, drag nodes, screen-CTM coord mapping) · wikilink parser (`parseVaultEdges`) · per-node colors with right-click popover · MD editor with 500ms debounced save + Cmd+S · vault file CRUD (read/write/delete/move with rename migration) · "The Grid" tab (uncloseable, position 0) · tab UX overhaul (drag-reorder, right-click pin/duplicate/close, horizontal scroll, drop-indicators) · profile editor with photo upload + 250 curated emoji + 20 symbols · right-sidebar swap on memory-graph tabs · left-sidebar Sessions/Agents toggle · search across sessions/agents/files · configurable shortcuts (1–5 default, click-rebind) · 32×22 rectangular hex field (704 hexes, was 169) · per-agent telemetry (real msg count + relative-time `last`) · model dropdown wired to current models · walls/routers drag-paint with mutual exclusion at the daemon.

**Distribution / CI-CD (live as of 2026-05-03)**

- `@m-luketin/squadron` on npm. **Latest 0.1.2 with SLSA v1 provenance.** 122.7KB / 30 files.
- Install: `npx @m-luketin/squadron`. Brings up daemon + static server + cloudflared tunnels. `Ctrl+C` shuts everything down.
- `.github/workflows/publish.yml` — tag-triggered (`v*.*.*`), **OIDC trusted publisher, no `NPM_TOKEN`**. Uses `node-version: '24'` (npm 11.5.1+ required for OIDC TP — burned hours discovering this).
- `.github/workflows/ci.yml` — every PR + push to main: `bun install --frozen-lockfile` → `bunx tsc --noEmit` → `bash scripts/scan-secrets.sh` → files-allowlist guard. Caught 3 real type errors on first run.
- Pre-push secret scanner (`scripts/scan-secrets.sh`): patterns for Anthropic/OpenAI/GitHub/AWS/JWT/Slack/Google/Stripe + hardcoded `/Users/neo` paths + foreign emails.
- MIT licensed.

**Persistence**

SQLite at `~/.hexagent/squadron.db` (WAL mode) — `agents`, `messages`, `world_features`, `inter_agent_messages` tables. Vaults at `~/.hexagent/agents/<id>/vault/`. Survive page reload AND daemon restart. Page reload on a tab in another browser = matching world snapshot in <1s.

---

## 5. Demo flow (1 slide — annotated screen-rec storyboard, ~90s)

Mirror this in a screencast. Each beat = 5–15s. Total ~90s.

```
0:00  bun run up                           — terminal: daemon + static + 2 tunnels boot,
                                             prints browser URL
0:08  Open URL in browser                  — empty hex grid, "no agent focused"
0:12  Click Spawn (S), click empty hex     — Draft agent appears, random name + color,
                                             chat opens in left sidebar
0:18  Type "hi" → Enter                    — daemon spawns claude subprocess, status
                                             flips Live, response streams in
0:25  Spawn second agent on adjacent hex   — second agent appears, also random
0:30  In agent A's chat: "send_to B
      saying you found something
      interesting in jwt-rotation.md"      — A calls send_to via MCP, message lands
                                             in A↔B inter-agent row, B auto-responds
                                             (autonomy on)
0:45  In B's chat: "read A's index.md
      and quote one line"                  — B calls read_neighbor_vault, quotes content
0:55  Drag B to a non-adjacent hex         — next send_to from A returns "not adjacent"
1:00  Place a router between them          — cyan dotted lines + bouncing dots light
                                             up the cluster, send_to succeeds again
1:10  Open Memory Graph tab on Jordan      — force-directed graph of 34 files,
                                             202 edges, 3 clusters. Drag-pan, wheel-zoom.
1:20  Click a node                         — file opens as center tab, MD editor,
                                             Cmd+S saves
1:25  Top-bar kill switch                  — autonomy off, auto-trigger paused;
                                             manual prompts still work
1:30  END
```

The story: spawn, talk, share a vault file, gate by space, scale by graph, kill safely.

---

## 6. Competitive landscape (1 slide — grid)

| Tool | Shape | What they don't do |
|---|---|---|
| **Cursor** | Single-agent IDE | No multi-agent. No spatial. No shared memory. |
| **Continue** | Single-agent IDE extension | Same. |
| **Cline / Roo** | Single-agent CLI-ish | Same. |
| **Devin** | Closed-source SaaS | You can't see the workspace, can't own the memory, can't compose teams. Their box. |
| **MetaGPT / AutoGen / CrewAI** | Orchestration libraries (Python) | No UI. No spatial intuition. You write code to define a team. Coordination is opaque agent memory. |
| **pentagon.run** | $50/mo closed-source desktop | Claude-only. Single-user. Channel/DM-shaped (Slack-with-bots). Closed source. |
| **Squadron** | Spatial OS for agents on YOUR machine | (this is the slot) |

**Position line:** *"Squadron is the spatial OS for local agents. Cursor is for one agent in your editor. Squadron is for a team of agents in your home directory."*

Differentiators (per `spec.md` v2.0, four moves designed to be hard to mirror):

1. MD-file knowledge graph as the coordination substrate (not opaque agent memory)
2. Walking agents — runtime team formation (not pre-provisioned channels)
3. Multi-model from day one (not Claude-only) *[VERIFY: codex provider still pending — see "Vision" below]*
4. Graph-native UI, not chat-native

---

## 7. Why now (1 slide — bullets with timestamps)

The pieces only just snapped into place:

- **Anthropic subscription tier (Claude Pro/Max)** — flat-rate access to a strong model. You can run multiple sessions on one OAuth without per-token billing surprise.
- **OAuth-able CLI (`claude-code`)** — the CLI holds an OAuth token in the OS keychain. Squadron drives it as a subprocess and inherits auth. No API keys. No credential storage in Squadron itself.
- **MCP standard** — Anthropic's Model Context Protocol gives a clean tool wire. `send_to`, `read_neighbor_vault`, `move_toward` are just MCP tools. Standards win.
- **1M-context Claude** — vault files can grow without immediate compaction pressure. The "memory is files" bet works because models can hold the working set.
- **Bun matured** — single-binary daemon with WS, HTTP, SQLite, subprocess spawning, and `--compile` cross-target binaries. One person can ship the whole stack.
- **A2A protocol hit 1.0** *[VERIFY: spec.md says "Google's open standard, now under Linux Foundation, hit 1.0 mid-April 2026" — verify this date and provenance before putting it in the deck.]*

The window where one builder can ship a local-first agentic OS is open. Two years ago none of this was possible.

---

## 8. Business model directions (1–2 slides — four cards, no winner picked)

This section is deliberately speculative. Present the trade-offs; let the founder + design discuss.

**Option A — Open-source core + paid cloud (Squadron Hub).**
Free OSS local daemon. Paid cloud service for shared worlds (multi-human canvases), agent identity / agent cards, A2A relay between machines, optional managed backups.
*Pros:* clean separation, recurring revenue, the multi-user phase 2/3 of the spec naturally monetizes.
*Cons:* need to build + operate cloud infra; risks the "Don't gate features the free tier could technically support" anti-pattern from spec.md §4 if drawn wrong.

**Option B — Pure OSS, get hired/contracted to integrate (the studio model).**
Squadron stays MIT, no SaaS. Solbound.dev sells integration / custom skill packs / verticalized agent recipes to clients (Solana protocols, etc.).
*Pros:* fits the existing 11-person studio perfectly. Zero recurring infra cost. Open-source narrative is uncompromised. Squadron becomes the studio's calling card.
*Cons:* revenue is project-shaped, not recurring. Doesn't scale beyond studio capacity.

**Option C — Marketplace for skills + agent profiles + memory packs.**
Squadron stays free; a marketplace surfaces curated skills (the starter library is already there: `summarize`, `bug-report`, `meeting-notes`, `tweet-thread`, `cold-email`, `code-review`), agent personas, pre-built memory vaults (e.g. "JWT spec expert," "Solana program reviewer"). Platform takes a cut.
*Pros:* aligns with the "skill = markdown file installable from any GitHub URL" architecture that already ships. Long-tail revenue. Community-driven supply.
*Cons:* marketplaces are hard to bootstrap; quality control burden; payment infra; small per-transaction revenue means heavy volume requirement.

**Option D — Subscription "Squadron Pro."**
Free tier identical to OSS. Pro tier adds: private agent recipes, premium model providers (e.g. claude opus access for users without their own sub), observability + cost dashboards, team collaboration features, priority support.
*Pros:* familiar SaaS shape, predictable revenue.
*Cons:* directly violates spec.md §4 anti-pattern *"Don't gate features the free tier could technically support."* Founder has explicit opinions against this shape — needs careful framing or it undermines the OSS narrative.

The four are not mutually exclusive. B + (A or C) is the most natural pairing.

---

## 9. Traction / proof points (1 slide — honest)

What can be claimed *today*, no embellishment:

- **Shipped publicly.** GitHub repo `m-luketin/squadron`, MIT licensed, README rewritten 2026-05-03, npm package live.
- **`@m-luketin/squadron` 0.1.2 published with SLSA v1 provenance.** OIDC trusted publisher. No tokens in CI.
- **`npx @m-luketin/squadron` works end-to-end** on a clean machine (assuming Bun + claude CLI are installed; bootstrap installer handles them).
- **CI/CD green** — typecheck, secret scan, files-allowlist guard on every PR + push.
- **Alpha invite landing page live** at `landing/index.html` collecting signups (currently mailto fallback to matija@solbound.dev; Tally/webhook swap pending).
- **Running as the founder's daily driver.** ~9 agents in the DB on his Mac mini. Roughly 3 Live + the persistent launchd "Phil Jackson" Claude Code session = 4 concurrent claude processes (capped after the 2026-05-02 subscription tripwire).
- **Real-world stress test passed.** Inter-agent communication, autonomous wakeup, vault file CRUD, memory graph, restart resilience all proven on the founder's actual workload.
- **Distribution audit infrastructure shipped** — release security checklist (`scripts/scan-secrets.sh`, `npm pack --dry-run`, provenance verification, OIDC posture check) runs per release.

What we **cannot** claim yet (don't put in the deck):
- External users / DAU / install counts (alpha hasn't opened beyond the founder)
- Revenue
- Funding
- Press
- A specific number of paid customers

---

## 10. Where this goes (1 slide — short, no roadmap)

Squadron is single-user and local today. The direction is **social**: shared worlds where multiple humans run their agents on the same canvas, with proper trust, permissions, and identity between agents. That's where the monetization lives — the local daemon stays free and open source, the cross-user / cross-machine layer is the paid surface.

The foundational work on agent identity, capability tokens, addressing, and a proper agent-to-agent wire protocol all stages toward that. Nothing about today's local experience changes; it just gains a "share this world" affordance.

---

## 11. The founder (1 slide)

**Matija Luketin** — builder behind [solbound.dev](https://solbound.dev), a Solana-native development studio (est. 2022, 11 people, Solana itself among their clients). Also runs Superteam Balkans, the non-profit promoting Solana in the Balkans region. Squadron is built solo, in the open, on his own machines, against his own daily workload. matija@solbound.dev / @matija_sol.

---

## 12. Asks (1 slide — two specific asks)

**Alpha users.** *"Looking for the first 10 alpha users from agent-tooling builders. Drop your email at [landing URL]; you get the install link and a direct line to the founder."*

**Skill-pack authors.** *"The starter library has 6 skills today. We want 60. Markdown files, installable from any GitHub URL — write them in your domain, ship them in ours."*

Two asks, both cheap, both honest. No fundraising claim until external traction is real.

---

## Appendix — design notes for Claude Design

- **Colors / type from `landing/index.html`** — bg `#0c0d10`, fg `#e8ebee`, accent `#7fb6d9` (cool blue), red `#d93b25` (CTA), amber `#e6c068`. Display font: IBM Plex Sans. Mono: JetBrains Mono. Marker text uses uppercase mono with `///` prefix.
- **Voice cues from the landing copy:** terse, lowercase section headers (`/// what it does`), bulleted lists with `▸`, mono code blocks for install commands.
- **Screenshots available.** `~/Desktop/squadron/docs/squadron.png` (450KB, "six-agent product team in a hex world") — already used as the README hero. There's also a `~/Desktop/squadron/docs/redesign-2026-05/` directory with newer design assets [VERIFY: contents not enumerated in this brief — pull whatever's most current].
- **Demo recording.** Founder should record the §5 flow as a 90s screencast. Slides can embed or link.
- **Architecture diagram.** The 8-line ASCII block in `README.md` ("Architecture (one screen)") is the right shape. Render it as a clean diagram with three boxes: daemon (port 7878) / static server (port 8787) / per-agent claude subprocess (cwd = vault dir). Arrows: WS, HTTP, MCP.

## Appendix — open items

Resolved before deck ship:
- `move_toward` shipped status — confirmed shipped; status memory corrected.
- Asks — locked to alpha users + skill-pack authors.
- Vision section — replaced the long roadmap with a short "social → monetization" framing per founder direction.

Still open (founder will handle directly):
- **A2A 1.0 release date** — claimed mid-April 2026, Linux Foundation. Verify before quoting publicly.
- **Codex provider** — model dropdown lists `codex-1` / `codex-mini` but no `Worker` impl exists per `squadron_codex_plan.md`. Treat as UI-only placeholder for now; revisit when ChatGPT-Plus subscription is in place.
- **Alpha signup count** — landing page is `mailto` fallback today; no count to cite until a real form handler is swapped in.
