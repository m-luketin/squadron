# Squadron — Product Spec (v2.0)

> Major reframe (May 2026). v1.x described Squadron as a personal spatial control plane for Matija. v2.0 commits the project to a different shape: **a free, open-source competitor to `pentagon.run`**, with architectural commitments designed to make the platform impossible to follow without breaking. Single-user product is the wedge; multi-user platform is the moat.
>
> What was already locked in v1.x (the spatial UX, MD vaults, daemon-supervised CLI subprocesses) carries forward; the foundations gain stricter constraints to keep cross-user collaboration cheap to build later.

**Name:** Squadron.
**Pitch:** A free + OSS multi-agent orchestration platform. Agents coordinate through a shared, user-owned MD-file knowledge graph. Walking agents form teams on the fly. Multi-model from day one. Graph-native UI; chat is the audit/transparency surface, not the coordination mechanism.

---

## 1. Strategic positioning

`pentagon.run`: $50/mo, closed-source desktop app, Claude-only, single-user, channel/DM-shaped.

Squadron commits to four moves they can't easily mirror:

1. **MD-file knowledge graph as the coordination substrate.** Coordination state isn't opaque agent memory; it lives in `.md` files the user owns, can read, edit, link, and visualize. Philosophical wedge + moat against tribal-knowledge black boxes.
2. **Walking agents — dynamic team formation.** Agents recognize they need help and recruit a teammate at runtime. Not pre-provisioned channels; runtime-shaped topology.
3. **Multi-model from day one.** Claude + Codex (GPT) + Gemini + local (Ollama). No provider lock-in.
4. **Graph-native UI, not chat-native.** Hex world (or graph canvas) is the primary surface. Chat exists as an audit/transparency surface for the human; coordination happens via typed handoffs in MD files.

These four are non-negotiable; everything else is a tradeoff against them.

## 2. Three-phase rollout

Every foundational decision is made now with the multi-user case in mind, even though we ship single-user first. Skipping phases is the standard failure mode.

| Phase | When | What |
|---|---|---|
| **1** | months 0-9 | Single-user product. All foundational decisions made with phase 2/3 in mind. Architecturally multi-user-ready. |
| **2** | months 9-15 | Multi-human, single-org. Multiple admins on one shared grid with one set of agents. Multiplayer coordination cost without cross-org trust complexity. |
| **3** | months 15-24 | Cross-user collaboration. Different users' agents on the same canvas, with proper trust / permissions / audit. The strongest moat lives here. |

## 3. Foundational architectural decisions (load-bearing)

Get these right *now*, even on a single-user release, because they're either trivial or extremely expensive to fix later.

### 3.1 Identity is global from day one
- Agent IDs are UUIDs (already shipped — see M1).
- Each agent carries an **A2A-style agent card** — discoverable metadata block (name, capabilities, version, owner, vault root, public-facing toolkit). The card is portable across users.
- No integer auto-increment IDs. No "Atlas as user-1's row 3" — that doesn't extend.
- **Status:** UUIDs in place. Agent-card formalization is M-Identity (next).

### 3.2 Permissions are capability-based, not role-based
- Wrong: "Atlas has admin." Right: "Atlas holds a scoped capability token to read folder X / write to file Y / send_to agent Z." Tokens are issued, scoped, revocable, auditable.
- Every per-agent toolkit configuration grants a *capability set*, not a role.
- This generalizes to cross-user collaboration cleanly; role-based does not.
- **Status:** today's "neighbors can read each other's vault by default" is *implicit* capability. M-Capabilities makes it explicit + scoped.

### 3.3 MD-graph addressing must be portable
- File references in MD files use a URL-like scheme that can later cross vault boundaries. Wikilinks today (`[[file]]`); portable scheme tomorrow (`squadron://<orgOrUserId>/<agentId>/vault/<path>`).
- Don't hardcode local paths into agent system prompts or tool returns.
- **Status:** vaults exist on disk; addressing scheme not yet enforced. M-Addressing pins this down.

### 3.4 Inter-agent wire protocol is A2A from day one
- Even when two agents are on the same machine, they communicate via Agent-to-Agent (A2A) protocol — Google's open standard, now under Linux Foundation, hit 1.0 mid-April 2026.
- Pair with **MCP** for agent-to-tool. They're complementary: A2A = peer protocol; MCP = tool protocol.
- Today's `send_to(name, text)` MCP tool is a temporary shim. M-A2A replaces it with proper A2A semantics (typed messages, capability handshake, request/response correlation).
- **Status:** MCP layer working (M3). A2A swap is the highest-leverage refactor before phase 2.

## 4. Anti-patterns (do not violate)

- **Don't gate features the free tier could technically support.** OSS audiences punish this; backlash compounds.
- **Don't let agents chat freely without structure.** Free chat = role drift, conversation rot, interpretation drift. Chat is the transparency layer. Coordination happens via typed handoffs and structured MD frontmatter.
- **Don't default to MIT/Apache without deciding.** AGPL or BUSL likely fits — prevents `pentagon.run` (or anyone) from forking and closing the source.
- **Don't pause shipping for a "let's just refactor" rewrite.** New code adopts new conventions; old code gets refactored only when touched for other reasons.
- **Don't chase moats we can't have.** No data moat, no patent moat, no brand moat (yet). Real moats: community, protocol, taste, vertical depth, architectural commitments.

## 6. MD-coordination requirements (non-negotiable)

These prevent the documented failure modes of file-based multi-agent coordination (MAST taxonomy: 21% of failures are weak verification; 37% coordination; 42% spec issues).

- **Frontmatter contract on every coordination file.** YAML on top with `owner`, `status`, `updated_at`, `schema_version`, plus typed fields downstream agents need. Prose body is human-readable only.
- **Per-agent read/write scopes.** Each agent's configuration declares which files it reads and which it writes. Default is *not* "everyone reads everything."
- **Per-workflow `status.md`** tracking state transitions (`brief_ready → script_in_progress → script_ready → …`). Cheap, readable, gives transaction boundaries, doubles as user-facing transparency.
- **Append-only patterns** for decisions, history, and notes wherever possible. Reduces overwrite risk; gives free audit trail.
- **A verifier agent** that checks final artifacts against the original brief. Don't skip this — MAST puts 21% of multi-agent failures here.

These graduate from spec → implementation in M-MDContract.

## 7. Implementation status (as of 2026-05-02)

### Shipped

| Milestone | Description |
|---|---|
| **M0** ✅ | Daemon vertical slice. Bun daemon supervising `claude -p --output-format stream-json` subprocess via WS. End-to-end confirmed (`apiKeySource: "none"`). |
| **M1** ✅ | Multi-agent + persistence. SQLite at `~/.hexagent/squadron.db`. Agents survive page reload + daemon restart (via `claude --resume`). Multi-tab sync via broadcast. |
| **M3 (subset)** ✅ | Vaults at `~/.hexagent/agents/<id>/vault/` (Obsidian-compatible). Local MCP HTTP server hosted by daemon, injected per-agent via `--mcp-config`. Tools: `send_to(name, text)` and `read_neighbor_vault(name, path)` — adjacency-gated incl. router-cluster bridges. World features (walls + routers) daemon-persisted in SQLite. |
| **M3.5** ✅ | Autonomous wakeup with guardrails. Recipient agents auto-respond when they receive an inter-agent message. Per-pair turn budget (6), per-pair throttle (1.5s), kill-switch wiring. User manual prompt resets the pair budget. |

### UX fixes shipped (worth tracking)

- Auto-open user-chat on focus (deviates from earlier "highlight only, no auto-dive" decision)
- Auto-scroll chat to bottom on new messages
- Drag-resizable left + right sidebars (widths persisted to localStorage)
- Speech bubbles above Live agents show real recent assistant text (sliding window, ~4s rotation)
- Drag-paint walls + routers (mouse-down + drag paints across hexes, mutually exclusive at the daemon)
- Drag-erase features (never agents — agents must be explicitly clicked in Erase mode)
- Inter-agent activity affordance: cyan dotted lines + bouncing dots light up router clusters touched by 2+ Live agents (router-bridged "wire" visualization)
- Conversations list derived live from `agents` + adjacency (incl. router-bridged inter-agent placeholder rows)

### Not yet shipped (next milestones)

| Milestone | Description |
|---|---|
| **M-Identity** | A2A-style agent cards. Each agent carries a portable metadata block. Foundational for phase 2. |
| **M-Capabilities** | Replace implicit "neighbors can read" with explicit scoped capability tokens. |
| **M-Addressing** | Portable URL-style references between MD files (`squadron://<userId>/<agentId>/vault/<path>`). |
| **M-A2A** | Replace the MCP `send_to` shim with proper A2A peer protocol. MCP stays for tools. |
| **M-MDContract** | YAML frontmatter contract, per-agent read/write scopes, `status.md` per workflow, verifier agent. |
| **M4** | Throttle / loop-detector / global cost ceiling — full guardrail set. Hooks-based. |
| **M5** | Convert prototype to Next.js + Tailwind + shadcn (production codebase). |
| **M6** | ✅ **Shipped (May 2026).** `move_toward` autonomous movement with path planning + animation. |
| **M-MultiModel** | Gemini + Ollama providers wired. |
| **M-License** | Pick AGPL or BUSL; ship LICENSE + headers. |

The next concrete deliverable before more features: a **four-section architecture audit** (identity / permissions / MD addressing / wire protocol) — see Section 12.

---

## 8. UI layout (carries forward from v1.x)

Center is a tabbed workspace, IDE-style.

### Center — Tabbed workspace
- **Tab 1: Hex Grid** — uncloseable, default. The primary surface. *This is graph-native, not chat-native.*
- **Settings tab** — opened by the top-bar gear; closeable. Internally split: left rail of categories (Connections / Defaults / Throttling / Cost / Names / Appearance), main pane.
- **Memory editor tabs** — each `.md` file opened from any agent's graph view becomes a closeable tab. Tab title shows the file name with a small badge for which agent's vault it belongs to.
- Switching tabs is instant; tabs persist across focus changes and across app restarts.
- Open `.md` tabs from the previous focused agent stay open when focus changes.

### Hex Grid tab — placement modes & affordances
- Toolbar: **Spawn · Wall · Router · Erase · Select**. Keyboard: `S` `W` `R` `E` `V`. `Esc` closes any popover/menu.
- **Spawn:** click empty hex → Draft agent appears, daemon assigns ID/name/color. Auto-focus and auto-open chat.
- **Wall / Router / Erase:** click + drag-paint. Wall and Router are mutually exclusive (PRIMARY KEY (q,r) on `world_features`). Drag-erase removes features only — agents require an explicit click in Erase mode (avoids accidental loss).
- **Drag-to-move:** in any mode, drag any agent to a free hex (user override of autonomous movement).
- **Right-click on agent:** context menu — focus · message… · walk to random free hex · pause/resume · rename · duplicate · kill.
- **Edge midpoint dot (live A↔B only):** click → popover with per-edge toggles (autonomous comms enabled, cross-vault read enabled).
- **Speech bubbles:** Live agents show a small bubble above their hex with a sliding-window snippet of their most recent assistant message (~4s rotation). Off at far zoom.
- **Status chips (bottom-left of canvas):** world name, live/total agents, tick counter, throttle interval, loop-detector flag (when active), paused state, far-zoom indicator.
- **Per-hex visual states (agents):** `idle` / `thinking` / `tool-running` / `moving` / `awaiting-input` / `errored`.
- **Movement animation:** smooth slide between hexes; brief duration so it reads as motion, not teleport.
- **Inter-agent activity affordance:**
  - *Direct adjacency:* bouncing dots animate along the shared edge. Bidirectional, two parallel lanes.
  - *Router-bridged:* cyan dotted lines + bouncing dots light up every router↔router and agent↔router edge in a router cluster touched by 2+ Live agents. The whole network "lights up like a wire."
- **Walls:** distinct hatched dark visual. **Routers:** light woven dotted pattern with cyan ring + slow pulse.
- **Infinite canvas** with pan/zoom + minimap. At far zoom, agents render as colored dots with symbol; walls render as solid pattern.

### Memory editor tab content
- CodeMirror editing of the `.md` file.
- Live save (debounced) writes to disk; agent picks up changes on its next turn.
- Header: agent name + vault path; back arrow returns to Hex Grid.

### Left sidebar — Conversation pane (two states)
- **List state (default):** scrollable list of all conversations, derived live from agents + adjacency.
  - Top: filter / sort controls (participants, status: live/archived, time range, unread). Default sort: newest first.
  - Two groups: **Your chats** (one row per agent) and **Inter-agent sessions** (one row per session — repeat A↔B meetings = separate rows).
  - Each row: avatar(s), label, last message preview, status badge, timestamp.
- **Chat state:** click any row → sidebar swaps to full chat view (header with back button, scrollback, composer). Inter-agent sessions: user can drop messages as a third participant. Auto-scrolls to latest message on update.
- **Focused-hex behavior:** clicking an agent on the grid auto-opens that agent's user-chat in the left sidebar (revised May 2026 from the original "highlight only" rule — auto-dive proved less friction in practice).
- **Activity badges:** consistent across user↔agent and inter-agent rows.
- **Loop-detector pre-warning:** when an inter-agent pair is approaching its turn budget, the chat header shows an amber chip ("⚠ loop detector · turn budget K/N · auto-pause approaching"). User can pre-empt the auto-pause.

### Right sidebar
- **Top — agent config panel:** status banner (`Draft` / `Live`); editable name, model, system prompt, allowed tools, MCP servers, working directory, per-edge toggles for current neighbors. Connections section with `+` to wire up new providers (CLI OAuth handoff or API key). Read-only telemetry: status, last activity, message count, approximate usage.
- **Bottom — memory graph:** Obsidian-style force-directed graph of the focused agent's vault. Edges are wikilinks (M3 has placeholder edges; full wikilink parsing is M-MDContract). Click node → opens that file as a new tab in the center. Hover → preview.
- **Drag-resizable:** left and right sidebars resize via the inner-edge handles. Widths persist to localStorage. Bounds: left 220–560, right 240–640.

## 9. Agent lifecycle

1. **Spawn (Draft).** Click empty hex → daemon creates agent (UUID, random name, available palette color), `~/.hexagent/agents/<id>/vault/` is created with seed `index.md`. No subprocess. No LLM call. Auto-focus, auto-open chat.
2. **Instantiate (Live).** First user `send-message` → daemon spawns `claude -p --output-format stream-json --input-format stream-json --verbose --include-partial-messages --append-system-prompt <augmented> --session-id <uuid> --mcp-config <inline JSON> --dangerously-skip-permissions` with cwd = vault dir. On `system/init` event: status flips Live and session_id is captured.
3. **Live is sticky.** The subprocess can exit between turns (claude `-p` semantics); `status` stays Live and `state` parks at `idle`. Next message auto-boots a fresh subprocess via `--resume <session_id>`.
4. **Move & connect.** Agent calls `move_toward(target)` (post-M6) or user drags. Sustained adjacency opens an autonomous A↔B session.
5. **Disconnect.** Walking out of adjacency (or wall placed between) archives the session. Returning starts a new one; older threads remain accessible.
6. **Persist.** Layout, walls, routers, agent state (Draft/Live), all chats (user↔agent + inter-agent), and vaults persist across sessions.
7. **Suspend (UI closed).** Daemon keeps state but autonomous traffic halts (workers may still be running but no UI is observing).
8. **Terminate.** Explicit kill from config panel or Erase mode. SQL cascade deletes messages; vault folder is left on disk for safety until M-Trash is added.

## 10. Adjacency, inter-agent comms, autonomous wakeup

- **Conversation requires sustained adjacency** *or* shared router cluster (both routes count as "connected").
- **MCP tool layer (current):** `send_to(name, text)` writes a row to `inter_agent_messages` and broadcasts `inter-agent-message-appended`. `read_neighbor_vault(name, path)` reads sandboxed.
- **A2A swap (planned, M-A2A):** the same semantics carried over a typed peer protocol with capability handshake. Tools below the protocol stay the same; the wire format changes.
- **Auto-trigger (M3.5 shipped):** when an inter-agent message lands and autonomy is on, the recipient subprocess is auto-prompted with the message formatted as `[Auto-routed message from "X" via send_to: …]`. Recipient processes naturally; replies (incl. further `send_to` calls) cascade.
- **Pending-message injection (M3 shipped):** if the recipient is offline (or autonomy is off), pending inter-agent messages queue. On the next user manual prompt to that agent, the queue is prepended as `[Messages received from other agents since your last turn: …]` and marked delivered.

### Guardrails (shipped + planned)

| Guardrail | Status | Notes |
|---|---|---|
| Per-pair turn budget (6) | ✅ M3.5 | Resets on any user manual prompt to either side. |
| Per-pair throttle (1.5s) | ✅ M3.5 | Min gap between auto-triggers per pair. |
| Top-bar kill switch | ✅ M3.5 | Daemon-side `autonomyEnabled` flag. Multi-tab synced. |
| Per-session message-rate cap | M4 | Belt-and-suspenders on top of pair throttle. |
| Global cost ceiling | M4 | Per-agent + per-world daily budget; auto-suspend on breach. |
| Loop detector (semantic similarity) | M4 | Auto-pause + warn when recent turns repeat. |
| Per-agent movement budget | M4 | Caps moves/min; prevents pathological wander. |

## 11. Memory model (with v2 commitments)

- Each agent owns a markdown **vault** (folder of `.md` files at `~/.hexagent/agents/<id>/vault/`).
- Vault writes happen autonomously during conversations (agent uses its own filesystem tools — its cwd is its vault) AND manually via the graph editor.
- **Read access:** adjacent agents read by default; per-edge toggle disables. *(M-Capabilities will replace this with explicit scoped tokens.)*
- **Write access:** only the owning agent and the user. Neighbors never write. Hard rule.
- **Graph view:** wikilinks between vault files. ✅ Wikilink parsing shipped (May 2026) — `parseVaultEdges()` extracts `[[target]]` / `[[target|alias]]` / `[[target#section]]`; UI renders real edges and falls back to radial layout only when zero links exist.
- **MD-coordination contract (M-MDContract, planned):** YAML frontmatter required on coordination files; per-workflow `status.md`; append-only for decisions/history; verifier agent at end of pipeline.

## 12. Audit task (next deliverable, before more features)

Write a four-section audit document covering, for each foundational decision:

1. **Identity** — what we do today, what the two-user case requires, what fixing it costs now vs. later.
2. **Permissions** — same structure.
3. **MD addressing** — same structure.
4. **Wire protocol** — same structure.

Test for each section: sketch how it behaves with two users where one invites the other's agent into a workspace. Failures show up immediately at that scale.

The audit lives at `~/Desktop/squadron/audit.md` (to be written).

## 13. Runtime architecture (carries forward, with multi-provider note)

- **Local daemon** (Bun) — owns process lifecycle, message bus, SQLite storage, MCP HTTP server, A2A peer endpoint (post-M-A2A).
- **Per-agent worker** — spawns the configured CLI subprocess. v1: `claude` and `codex` (auth via OAuth in user's keychain). M-MultiModel adds Gemini CLI + Ollama.
- **Web UI** — Next.js (post-M5; today: Babel-in-browser prototype). Talks to the daemon over local WebSocket; can be served by the daemon itself.
- **Auth:** none of our problem — `claude` / `codex` already hold their own OAuth tokens in the OS keychain.

**Implications:**
- Distribution is local-only (single binary or `npx squadron`); no SaaS for the free tier.
- Agents have full local filesystem access via their CLI tool layer.
- Cross-platform constrained by the underlying CLIs.

## 14. Tech stack (concrete current state)

- **Frontend:** Babel-in-browser React (current prototype) → Next.js + Tailwind + shadcn (post-M5). Hex grid: custom SVG with pointy-top axial coords, infinite pan/zoom, minimap. Memory graph: hand-rolled radial layout (cytoscape/d3-force comes with M-MDContract). Editor: CodeMirror 6 (post-M5).
- **Daemon:** Bun. `Bun.serve` for HTTP + WS. `Bun.spawn` for subprocesses. `bun:sqlite` for storage. `node:fs` for vault I/O.
- **MCP:** hand-rolled JSON-RPC over HTTP at `/mcp/agent/<id>`. Streamable-http transport. Switch to A2A wire post-M-A2A.
- **Storage:** SQLite at `~/.hexagent/squadron.db` (tables: `agents`, `messages`, `world_features`, `inter_agent_messages`, `schema_version`). Plain `.md` files at `~/.hexagent/agents/<id>/vault/`.
- **Distribution:** local-only; `npx squadron` or packaged binary (post-M-License).

## 15. Random / minor decisions

- **Random name source:** built-in list (~500 short evocative names — mythological / celestial / mineral). User-overridable in Settings → Names.
- **Far-zoom tier:** at high zoom, agents are colored dots with their symbol; walls solid; labels off.
- **Cross-session tab persistence:** center tabs reopen on app restart. Hex Grid is always selected on cold start.

## 16. Explicit non-goals for v1 (single-user phase 1)

These are deferred but explicitly *on the roadmap*, not killed:

- **Multi-user / cross-org collaboration** → phase 3
- **Multiple humans on one org's grid** → phase 2
- **Mobile / tablet support** → unscoped, later
- **Cloud hosting / SaaS distribution** → never replaces the local-first baseline
- **Multi-provider beyond claude + codex** → M-MultiModel
- **Inter-agent vault writes** → covered by M-Capabilities (explicit scoped grants)
- **Built-in persona / template library** → post-launch
- **Custom OAuth implementations** → we hand off to the CLIs (kept indefinitely)
- **Agent-built walls / routers** → user-only world-shaping (kept indefinitely)
- **Inter-world or cross-world agent transport** → unscoped

## 17. Verification — end-to-end demo flow (current single-user shape)

Lifelong manual-test script. Run in order; failures here block ship.

```
0. Reset:                  rm -rf ~/.hexagent/    (nuke DB + vaults)

1. Cold start:             cd ~/Desktop/squadron && bun run daemon
                           — empty Hex Grid; empty sidebar; "no agent focused"

2. Spawn:                  Spawn-mode click on empty hex
                           → Draft agent appears (random name, color), chat opens

3. Instantiate:            type "hi" → daemon spawns claude subprocess
                           → status flips Live, response streams, message persists

4. Spawn second agent:     click another empty hex; configure if desired

5. Direct send_to:         move agents adjacent (or place router cluster between)
                           → from A's chat: "send_to B saying hello"
                           → A calls send_to; "A↔B" inter-agent row gets the message;
                             B auto-responds (if autonomy on); chain may bounce

6. read_neighbor_vault:    "Read B's index.md and quote it"
                           → A calls read_neighbor_vault; quotes content

7. Adjacency revoked:      drag A non-adjacent (and out of any router cluster)
                           → next send_to from A returns "not adjacent"

8. Router-bridge:          place router(s) connecting A and B's hex
                           → send_to succeeds again
                           → cyan wire visualization lights up the cluster

9. Reload page:            full snapshot restores — agents, walls, routers,
                           messages, inter-agent history, vaults

10. Restart daemon:        Ctrl+C, re-run
                           → "restoring N Live agent(s)" — sessions resume via --resume

11. Multi-tab sync:        open the URL in second tab
                           → snapshot loads matching state; sending in tab 2 → tab 1 sees live

12. Erase agent:           Erase mode → click agent → vanishes from grid + sidebar + DB

13. Kill switch:           top-bar button → autonomy off → auto-trigger paused
                           (manual user prompts still work). Click again → resumes.
```

## 18. License (open)

Decide AGPL or BUSL before public release. Reasoning: we want the free tier complete and forkable, but not closeable by competitors (notably `pentagon.run`). MIT/Apache do the second poorly. Final pick is M-License.

---

*Last edited: 2026-05-02. Replaces v1.1 of this doc.*
