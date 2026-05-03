# Squadron — code cleanup opportunities (2026-05)

Scope: in-tree code audit before public release. No edits made — this is a triage list.

Conventions used: `path:line` cite, oldest/widest concerns first within each section.

---

## 1. Quick wins (one-line fixes)

1. `ui/src/icons.jsx:35` — debug `console.log('[squadron] icons loaded: …')` should be deleted; the `// eslint-disable-next-line no-console` above it is a tell.
2. `ui/src/app.jsx:1091-1093` — `console.log('[squadron] auto-trigger paused', …)` is annotated as "Soft signal — UI could show a chip later. Logged for now." Either ship the chip or drop the log.
3. `ui/src/app.jsx:1626-1627` — entire effect is a no-op stub: `useEffectA(() => { /* no-op for now */ }, [autoWalkOn, killed, walls]);`. Remove it; the comment above it already documents the deletion.
4. `ui/src/app.jsx:1629-1633` — `loopFlag` toggles every 9 s purely as a fake demo flag for the loop-detector pre-warning chip. Comment claims 18 s. Real loop detection isn't shipped — kill or wire to daemon.
5. `ui/src/sidebars.jsx:2098` — `window.GraphAgentList = GraphAgentList;` references an undefined symbol. Will throw `ReferenceError` at script load. Delete the line.
6. `ui/src/sidebars.jsx:1530` — `MemoryGraphTab({ agent, nodeColors, setNodeColor, onOpenFile, focusedFileFromSidebar })`: `setNodeColor` and `focusedFileFromSidebar` are never read. Remove from the prop list.
7. `ui/src/sidebars.jsx:1569` — `MemoryGraphFilesPanel({ …, onRemoveLink })`: `onRemoveLink` is never used.
8. `ui/src/data.jsx:55-70` — `initialAgents`, `initialWalls`, `initialConversations`, `mockChats`, `memoryGraphs`, `fileContents` are all empty literals; `mockChats` is the only one read (sidebars.jsx:215, dead fallback path — see #18). The other five are pure noise on `window.SQ`.
9. `ui/src/data.jsx:166-243` — entire `BUSY_*` block (`busyAgents`, `busyConversations`, `BUSY_NAMES`, `BUSY_GLYPHS`, `BUSY_TASKS`, `BUSY_STATES`, `BUSY_AGENT_COORDS`, `BUSY_WALLS`, `window.SQ.busy = {…}`) is unreferenced anywhere. ~80 lines of dead demo data.
10. `daemon/db.ts:79-83, 206-208, 213` — prepared statements `setStatus`, `setState`, `setSessionId`, `getMessagesByAgent` are defined but never called. Remove from the `Statements` interface and from `openDb()`.
11. `daemon/world.ts:550-556` — `setDraft()` is called only from `daemon/index.ts:46`. `setLive()` from `server.ts:464`. Both are fine, but the file says "Convenience for transitions handled by agent-worker callbacks" — clarify or drop the `setDraft` opts param (`clearSession` is always passed `true`).
12. `daemon/protocol.ts:48` — comment "Subprocess lifecycle (renamed from spawn-agent)" — the rename is ancient history; drop the parenthetical.
13. `daemon/server.ts:99-103` — the `import { isClientToDaemon, … }` block sits *after* a function definition (line 99 mid-file). Move imports to the top.
14. `daemon/server.ts:106-107` — `interface ConnState { /* M1: empty — workers and agents both live at daemon scope. */ }` — empty interface ships forever as a useless type. Either inline `{}` at the use site or delete.
15. `daemon/server.ts:1-5` — header comment "DAEMON-SCOPED — agents survive WS disconnects, are addressable by every connected tab, and can be auto-resumed on daemon startup." This is fine, but it's the only file-header in `daemon/`; consider parity with the others or delete the heavy banner.
16. `daemon/server.ts:226-227` — comment says "per-pair turn budget (6 consecutive — resets on any user manual message)" but `PAIR_BUDGET = 4` (line 137). Update one or the other.
17. `daemon/server.ts:589, 599` — `const f = world.placeFeature(…)` and `const ok = world.removeFeature(…)`: the variables are never read. Rename to `_` or drop the assignment.
18. `ui/src/sidebars.jsx:215-217` — fallback to `window.SQ.mockChats[conversation.id]` is dead now that `realMessages` is always present (App always passes a `messages` prop, even if empty). Remove the OR branch and `window.SQ.mockChats` reference.
19. `ui/src/sidebars.jsx:1144-1146` — `draftSys`, `draftGlyph`, `draftHex` declared in `AgentConfig`, but `commitGlyph` (lines 1174-1176) is never called and `commitSys` (1171-1173) is also never called from `AgentConfig`. The config form doesn't actually have a sysprompt or glyph input field anymore — those moved to `ProfileEditor`. Remove dead state + commits.
20. `ui/src/sidebars.jsx:1922` — `agents` is in dep array but the JSX path also reads `groups` derived from `filtered` from `agents`. The `agents.map(a=>a.id).join('|')` re-recompute key is duplicated at 1915 and 1922 — collapse.
21. `ui/Squadron.html:13-15` — `G-PLACEHOLDER` example mentions `G-XXXXXXXXXX`; matches `README.md:127` and `:129`. Pick one canonical placeholder shape.
22. `ui/Squadron.html:891-895` — three `<script src="https://unpkg.com/…">` integrity hashes are pinned to specific versions. Fine, but worth a comment that these must be bumped together with the babel/react cache-buster `?v=` below.
23. `ui/src/hexgrid.jsx:920-923` — `prompt('rename agent', a.name)` and the local `setAgents(prev => prev.map(...))` writes a name change that won't persist (next world-snapshot wipes it). Either route through `onUpdateAgent` (not currently a prop) or drop the menu entry.
24. `ui/src/hexgrid.jsx:924-941` — `duplicate` action constructs a local-only agent (`'a' + Math.random()`) that never hits the daemon. Same drift-on-snapshot bug. Drop or route through daemon.
25. `ui/src/hexgrid.jsx:942-959` — `walk` action is a fake animation; daemon's real walk path is `move_toward` MCP. Drop.
26. `ui/src/hexgrid.jsx:960-963` — `pause` toggles a local `state` value the daemon will overwrite. Drop or wire through.
27. `ui/src/app.jsx:33` — `dtoToAgent` synthesizes `task: dto.task ?? (…)`; `task` is never on the daemon DTO and only consumed by hexgrid tooltip (`hexgrid.jsx:481`). Either persist it server-side or stop pretending it's a server field.
28. `daemon/vault.ts:332, 355, 425` — three lazy `require("node:fs")` calls inside try blocks. The static `import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync }` at the top already names `node:fs`. Just add `renameSync, unlinkSync` to that import.
29. `scripts/whitelist.ts:79-83` — `addToken(label!)` is called inside the `url` command, meaning every invocation generates a *new* token. Probably intentional ("generate + print URL") but the `url <label> [base]` help text is ambiguous about side effects. Either rename to `add-url` or document.
30. `package.json:11` — `"keywords"` includes `"hex-grid"` and `"karpathy"` (the LLM-Wiki reference) but missing `"a2a"`, `"obsidian"`, `"vault"` which are central to the README pitch. Quick win for npm search.

---

## 2. Medium wins (a few minutes each)

### `ui/src/data.jsx` — split into "data" + "starter content"

The file has three unrelated sections: hex math (`HEX`, `axialToPixel`, `hexCorner`, `hexPath`, `HEX_DIRS`, `hexKey`, `areAdjacent`, `edgeMidpoint`), runtime constants (`AGENT_PALETTE`), and the starter skill library (`STARTER_SKILLS`, ~80 lines of markdown). Then ~80 lines of dead `BUSY_*` demo data. Three suggestions stacked:

1. Delete the `BUSY_*` block outright (item 1.9).
2. Move `STARTER_SKILLS` into its own `ui/src/skills.jsx` — it's the only thing in the file that's not pure math/render plumbing, and it's read by exactly one component (`SkillsSection` in sidebars.jsx).
3. Rename remaining `data.jsx` to `hex-math.jsx` since that's all that's left.

### `daemon/server.ts` — `pairLastAt` / `pairAutoCount` could move to a tiny class

Lines 132-138 + 236-302 + 605-608 manage the auto-trigger state machine across three places. A `PairBudget` class with `tryReserve(pair): { ok, reason? }`, `reset()`, `resetFor(agentId)` would localize the throttle/budget logic and let `maybeAutoTrigger` read like an actual policy.

### `ui/src/app.jsx:1422-1432` — hardcoded `connections` default

```js
const [connections, setConnections] = useStateA([
  { provider: 'claude', connType: 'cli-sub', label: 'claude · subscription via cli' },
  { provider: 'codex', connType: 'cli-sub', label: 'codex · subscription via cli' },
]);
```

The Codex connection is faked — the daemon doesn't actually wire codex (only `claude` is spawned in `agent-worker.ts:66`). The wizard then "verifies" with a `setTimeout(1200)` (`connections.jsx:96, 153`). Either ship a real codex provider (M-MultiModel from spec.md §16) or remove the codex picker card to avoid promising what doesn't work.

### `ui/src/app.jsx:1422-1432` + `connections.jsx` — wizard is mostly a mock

`CliHandoff` (connections.jsx:53-86) fakes a 4-step OAuth detection with `setTimeout`. Comment at line 54: "Simulated detection states — in reality the daemon polls the keychain / cli output." This isn't a real connection — it just stores a label in React state. For a public release, either:

- Make it real (probe `claude --version` / look at the keychain), OR
- Hide the "+ connect" button entirely until M-MultiModel ships.

A fake wizard is worse than no wizard.

### `ui/src/app.jsx:690-928` — `SettingsTab` has many fake controls

Throttling sliders, cost ceilings, name-source picker, accent picker, density picker — none of these are wired. Several use `defaultValue` with no `onChange`. Per CLAUDE.md "Don't add features beyond what was asked", this is the largest single accumulation of stub UI in the repo. Two options:

1. Delete the unwired categories from the sidebar (`cats` array, line 692) until they're real.
2. Mark them as "preview · not yet wired" with a banner so users don't think their changes stick.

### `ui/src/hexgrid.jsx:899-988` — `EdgePopover` toggles aren't persisted

`vaultRead` (line 415) and `commsEnabled` (411) live only in client-state (`edgeStates` in app.jsx:979). They survive within a session but the daemon ignores them — agents *can* always read neighbor vaults regardless of toggle. This matches the spec's "implicit capability" gap (spec.md §3.2) but the toggle UX implies enforcement. Either:

- Wire the toggles through (add to `update-agent` patch or new `edge-config` event), OR
- Remove the toggles + popover until M-Capabilities ships.

### `ui/src/sidebars.jsx:903-1053` — `SkillsSection` URL importer fetches from arbitrary URLs

`onUrlAdd` (line 926) does an unconditional `fetch(url)` and writes the response body straight into the agent's vault. No content-type check, no size cap, no MIME validation. For a local tool this is OK; for a public release it's worth at least:

- A 1 MB cap on the fetched body.
- A content-type allowlist (`text/*`, `application/json`).
- A confirmation modal before write.

### `daemon/server.ts:104-117` — `ConnState` interface + the `RunningServer.bootAgent` JSDoc

`ConnState` is empty; `bootAgent` exposed as part of `RunningServer` is only used by `daemon/index.ts` for cold-start restore. Rename interface to `WsContext` (or delete) and document `bootAgent` as "internal — used by index.ts on cold start."

### `daemon/world.ts:425-477` — `updateAgent` builds dynamic SQL

The dynamic UPDATE works but `openDb().db.prepare(sql).run(...)` (line 460) allocates a new prepared statement every patch. For frequent state changes (`thinking → idle` per turn) this is measurable. Pre-prepare the common one-key patches (`state`, `q`, `r`) as named statements alongside the existing `set*` ones (which are themselves dead — see 1.10).

### `daemon/index.ts:24-34` — `for (const a of allAgents)` writes identity.md to every agent on every cold boot

This is intentional ("catches agents that existed before this feature shipped") but should be guarded by a one-shot migration flag in `schema_version`. Otherwise we burn O(n) disk writes every daemon restart forever.

### `ui/src/hexgrid.jsx:23` — `HEX_FIELD = generateHexFieldRect(32, 22)` is module-scoped

A 32×22 = 704 hex grid is fixed at script load. That's fine, but `generateHexFieldRect` is never called again — inline the result or expose a constant `HEX_FIELD_COLS=32, HEX_FIELD_ROWS=22` so the dimensions are settings-tunable in the future.

---

## 3. Bigger refactors (worth a separate session)

### Split `app.jsx` (2152 lines) into ~5 files

Component breakdown of the current file:
- `DaemonPill`, `TopBar`, `TabGlyph`, `Tabs` (~330 lines) — top-bar + tab strip
- `MarkdownTab`, `OutlineRail`, `parseWikilinks`, `resolveWikilink` (~360 lines) — markdown editor
- `SettingsTab` (~240 lines) — settings center tab
- `App` shell + WS handling + tab persistence (~1200 lines)

A clean split would be `topbar.jsx` / `tabs.jsx` / `markdown-tab.jsx` / `settings-tab.jsx` / `app.jsx`. Each file then becomes individually skimmable. Today every cmd-F into `app.jsx` returns 5+ irrelevant hits.

### Split `sidebars.jsx` (2098 lines) similarly

Major components in there:
- `LeftList`, `ConvRow`, `ConvAvatar` (~110 lines) — conversation list
- `MdBubble`, `markFileLinks`, `extractFilename`, `TypingDots`, `ChatView` (~270 lines) — chat
- `MemoryGraph`, `classifyFileKind`, `radiusForKind`, `computeEffectiveColors` (~480 lines) — graph sim
- `SkillsSection`, `CrumbRow`, `PanelHeader`, `AgentConfig`, `ProfileEditor`, `pillBtnStyle` (~720 lines) — right sidebar
- `MemoryGraphTab`, `MemoryGraphFilesPanel`, `FileRow`, `LinkChip`, `rowBtn` (~330 lines) — graph tab
- `WorkingPip`, `AgentsList`, `SectionHeader`, `SearchBar` (~190 lines) — agents list

Suggested files: `left-conv-list.jsx`, `chat.jsx`, `memory-graph.jsx`, `right-agent-config.jsx`, `right-graph-files.jsx`, `agents-list.jsx`. Memory-graph specifically (force sim + interaction code) is its own concern that doesn't change when chat changes.

### Stop scattering `eslint-disable-next-line` in code that has no ESLint config

`grep -c eslint-disable-next-line` returns 14 hits across `ui/src/`. There is no `.eslintrc`, no `eslint.config.*`, no `eslint` in `package.json`. These pragmas are pure noise. Either:

1. Add ESLint to the toolchain (a real fix) and let it flag the things the disables are hiding (most are `no-console`, `no-alert`, `react-hooks/exhaustive-deps`).
2. Strip every `eslint-disable-next-line` line and address the underlying lints by hand (most are legitimate — alert prompts should become custom modals, console logs should disappear, exhaustive-deps comments hide intentional one-shot effects that should use a ref-based pattern).

### Migrate hardcoded color hexes in `hexgrid.jsx` to the `--sb-*` tokens

`hexgrid.jsx` has 5 sites where `#d93b25`, `#e6c068`, `#525252`, `#2a8c4a` are inline hexes (lines 201, 233, 258, 452, 1102, 1103). The comparable spots in `app.jsx` and `sidebars.jsx` use `var(--sb-*)`. Two callouts:

- `var(--sb-accent)` would replace `#d93b25` everywhere in this file.
- `var(--sb-work-tool)` (`#e6c068`) would replace the awaiting-input/loop chip color.
- `var(--sb-fg-disabled)` would replace `#525252`.
- `2a8c4a` (live green) appears 3+ times; promote to `--sb-status-live` in `tokens.css`.

These are inline because the SVG `fill`/`stroke` attributes don't accept `var(...)` in some browsers historically, but that's a non-issue in any browser shipped after ~2019.

The `FileRow` color picker (`sidebars.jsx:1780`) hardcodes the same 12 colors as the `--sb-graph-*` tokens (tokens.css:108-117). Drive that array from `getComputedStyle` reads of the tokens, or extract the swatch list to `data.jsx`/`tokens.css` so palette changes happen in one place.

---

## 4. Spec/status drift

### `spec.md` claims things that have shipped or are wrong

- `spec.md:85-91` "Implementation status (as of 2026-05-02)" lists M0 / M1 / M3 (subset) / M3.5 as shipped — but **M6 (`move_toward` autonomous movement)** is in fact shipped (`daemon/server.ts:304-431`, `daemon/world-tools.ts:118-161`, `daemon/db.ts:34, 119, 181-187` for the migration). spec.md:115 still lists M6 as not yet shipped.
- `spec.md:114` "M5 — Convert prototype to Next.js + Tailwind + shadcn (production codebase)" — README.md:14 is still the babel-in-browser prototype. Spec is correct here, but the order in `spec.md:106-117` puts M5 before M6 chronologically; M6 went first.
- `spec.md:208` "Graph view: wikilinks between vault files (parsing implementation deferred to M-MDContract; current view shows radial layout from `index.md`)" — wikilink parsing **shipped** (`daemon/vault.ts:131-177` `parseVaultEdges`, broadcast as `vaultEdges` on the agent DTO). The graph renders real edges (`sidebars.jsx:474-490`). Update spec.

### README claims things subtly off

- `README.md:30-34` "Install: `npx @m-luketin/squadron`. That's it." — skips that the user must have `claude` already installed AND signed in. `bin/squadron.js:57-67` will exit 1 with helpful instructions, but the README implies one-step install. Add a "Prerequisites" callout or move the requirements block before the install block.
- `README.md:166-171` Roadmap puts "v0.2 = codex provider" — currently the UI claims a working codex connection (`app.jsx:1424`) and lets users "select" codex models (`sidebars.jsx:1287-1288`) that the daemon will not honor. README and UI are out of sync about which providers actually work today.

### `ui/Squadron.html` ships `?v=20260503-redesign-15` everywhere

Cache-buster appears 7 times in the file. Easy way to forget one when shipping the next bump. Consider templating from a single source (a `<base>` tag or a build-step replacement) or at minimum a comment at the top: "bump every `?v=...` together when shipping."

---

## 5. Files to delete or move

### Probably delete

- `docs/redesign-2026-05/` (entire directory) — design canvas + boards + tokens-diff for a redesign that already shipped (per `Squadron.html` cache-buster `redesign-15`). Includes its own `mock.jsx`, `app.jsx`, `tokens.css`, `boards/*.jsx`. Useful as design history but bloats the repo and gets caught by every grep ("found 31 files" turns into "found 47 files"). Move to a separate `squadron-design-history` repo or delete outright. **~80 KB across 9 files.**
- `docs/squadron.png` (450 KB) — referenced by `README.md:11` but pulled from raw.githubusercontent.com, not from the local file. Either reference the local copy and pin it forever, or delete the local copy and rely on the GitHub-hosted one.
- `docs/pitch-deck/Squadron Pitch.html` and `docs/deck-review-2026-05.md` and `docs/pitch-brief-2026-05.md` (~480 KB total) — pitch artifacts, not code or product docs. Belong in a separate repo (`squadron-marketing`?) or a private branch. Public-release scan would flag these as "why is the pitch deck in the npm package?" — but they're not in the `package.json:files` allowlist so they don't ship; still, every clone pulls them.

### Move

- `landing/index.html` — currently in the repo root. If it's the deployed marketing page, it belongs in a `squadron-landing` repo (paired with a `vercel.json` or similar). If it's a sketch, move into `docs/`.
- `scripts/m1-smoke.ts` and `scripts/test-client.ts` — both are smoke tests for milestones already shipped. Move to `scripts/smoke/` so the top-level `scripts/` is just operator tools (`bringup.sh`, `static.ts`, `scan-secrets.sh`, `whitelist.ts`, `install-hooks.sh`).

### `.gitignore` notes

- Already ignores `~/.hexagent/` — good.
- Doesn't ignore `*.bak`, `*.old`, `*.tmp`, `*.orig` (common merge-conflict artifacts).
- Doesn't ignore `coverage/` (no tests yet but cheap to add).
- `ui/**/*.zip` is a Squadron-specific rule but no `.DS_Store` exclusion below the top-level (the existing `.DS_Store` rule covers it though, since it's a glob).

No `.bak`, `.old`, `.tmp`, `.orig` files currently in tree (verified). `node_modules/`, `.next/`, `out/`, `dist/`, `build/`, `.turbo/` already ignored.

---

## Summary numbers

- **~10 lines** of definitely-dead `console.log` (icons.jsx, app.jsx auto-trigger-paused).
- **~85 lines** of dead `BUSY_*` demo data (`ui/src/data.jsx`).
- **~30 lines** of dead-or-stale right-click menu handlers in `hexgrid.jsx` (rename / duplicate / walk / pause).
- **4 unused prepared statements** in `daemon/db.ts` (`setStatus`, `setState`, `setSessionId`, `getMessagesByAgent`).
- **~480 KB** of pitch / deck / review artifacts in `docs/` that never ship.
- **~80 KB** of redesign artifacts in `docs/redesign-2026-05/` describing a shipped redesign.
- **2 props** unused in `MemoryGraphTab` and **1 prop** unused in `MemoryGraphFilesPanel`.
- **1 reference error** at script load (`window.GraphAgentList = GraphAgentList;` references undefined symbol).
- **14 `eslint-disable-next-line` pragmas** in a project with no ESLint configured.
- **~6 fake controls** in `SettingsTab` with no `onChange` wired.
- **1 fake provider wizard** (`connections.jsx`) that looks real but only stores a label.
- **2 spec drift items**: M6 (movement) and wikilink parsing both shipped, both still listed as deferred.

The single highest-leverage change: delete the `BUSY_*` block + dead `data.jsx` exports + the `loopFlag` 9 s ticker + the no-op `useEffectA` at app.jsx:1627. Five-minute pass; ~120 lines lighter; nothing to retest because nothing reads them.
