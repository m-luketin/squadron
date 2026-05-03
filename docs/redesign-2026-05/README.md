# Handoff: Squadron · May 2026 Redesign

## Overview

This handoff covers a design pass on Squadron, an agentic-OS multi-agent IDE-shaped product. ~15 surfaces shipped via Claude Code in M5–M6 without coordinated design review; this redesign absorbs them into the existing visual grammar and tightens six specific design problems.

The pass is **not a rebuild** — visual DNA (dark surface, red-only accent, mono+display+body type stack, dotted dividers, monospaced eyebrows) stays. Goal is coherence across the new + old surfaces and a small set of new tokens.

## About the Design Files

The HTML files in this bundle are **design references** built as a React + inline-Babel prototype. They are not production code to copy. The task is to **recreate these designs in the target codebase's existing environment** (the live Squadron React app) using its established patterns, components, and state stores.

If a pattern in this prototype conflicts with one already in the codebase, prefer the codebase's pattern and treat the prototype as a target for visual + behavioral fidelity, not a literal copy.

## Fidelity

**High-fidelity.** Final colors, typography scale, spacing, glyph systems, and animation behavior are intended to be implemented as drawn. Mock content (agent names, vault contents, graph nodes) is illustrative only — pull real data from the existing stores.

## Files in this bundle

- `Squadron Redesign.html` — entry point, loads all artboards. Open in a browser.
- `tokens.css` — current design tokens. New tokens defined in artboard 06 need to be merged in.
- `design-canvas.jsx` — pan/zoom canvas host for the artboards (not part of the product, just the presentation tool).
- `app.jsx` — registers all artboards.
- `mock.jsx` — mock data (10 agents, 32-node memory graph, 9 sessions, etc).
- `boards/tab-strip.jsx` — artboard 01
- `boards/right-sidebar.jsx` — artboard 02
- `boards/memory-graph.jsx` — artboard 03
- `boards/editor-chat.jsx` — artboard 04
- `boards/left-sidebar.jsx` — artboard 05
- `boards/tokens-diff.jsx` — artboard 06

## Screens

### 01 · Tab strip taxonomy

**Purpose:** Make the five middle-panel tab kinds (grid, file, memory-graph, vault-preview, settings) visually distinct without breaking the "one red moment per viewport" rule.

**Layout:** Tab strip is 36px tall, full-width, single horizontal row, scrolls horizontally on overflow. 1px bottom border (`--sb-line`). Each tab has 1px right border.

**Tab anatomy:**
- Padding: `0 12px 0 14px` (file/memory/preview/settings); `0 16px 0 14px` for grid.
- Gap between elements inside a tab: 8px.
- Active tab: background `--sb-bg-elev`, foreground `--sb-fg`, 1px bottom underline in the kind's accent color (overlapping the strip's border).
- Inactive: transparent background, foreground `--sb-fg-muted`.

**Grid (home) tab — special:**
- Always at slot 0, cannot be closed, no context menu.
- Badge: 18×18 rounded-3px square, background `rgba(217,59,37,0.18)`, border `1px solid rgba(217,59,37,0.5)`, contains "G" in display font 11px weight 600 white.
- When active, background also gets a faint vertical gradient: `linear-gradient(180deg, rgba(217,59,37,0.08), rgba(217,59,37,0) 70%)` over the elev color.

**Other kinds — kind glyph:**
- 14×14 square with 2px radius, 1px border, monospace 9px glyph centered. Border + glyph color is `--sb-line` / `--sb-fg-muted` when inactive, the kind's accent color when active.
- Glyphs: file→`md`, memory→`◉`, preview→`▦`, settings→`⚙`.

**Vault badge** (file kind only): 9px monospace text, padding `1px 5px`, 1px border `--sb-line`, 3px radius, color `--sb-fg-faint`. Shows the vault name (e.g. `atlas`).

**Pin marker:** 9px monospace `◉` glyph in `--sb-accent`, sits between the kind glyph and the title. Pinned tabs sort to slot 1 (right after grid). Settings cannot be pinned. Re-pinning unpins.

**Close button:** 14×14 transparent button, 12px `×`, color `--sb-fg-disabled`. Grid has none.

**Drag behavior:**
- Custom ghost replaces the browser default: same chip styling, background `rgba(10,10,10,0.95)`, blur(6px) backdrop, 1px border `--sb-line`, soft red drop shadow `0 0 0 1px rgba(217,59,37,0.3)` + `0 12px 32px rgba(0,0,0,0.6)`, transform `rotate(-1.5deg)`.
- Source tab while dragging: opacity 0.4.
- Drop indicator: 2px wide accent bar on the leading edge of the target slot, glow `0 0 8px rgba(217,59,37,0.6)`, vertical inset 4px top/bottom.

**Right-click menu (file kind shown):**
- Position: anchor below the right-clicked tab, left-aligned to its left edge.
- Background `rgba(10,10,10,0.97)`, 1px border `--sb-line`, 4px radius, 4px outer padding, blur(8px) backdrop, shadow `0 12px 32px rgba(0,0,0,0.6)`, min-width 200px.
- Section header: 10px monospace `--sb-fg-faint`, padding `6px 10px`, 1px bottom border `--sb-line-soft`, format `/// ATLAS/ROADMAP.MD` (uppercase vault/path).
- Items: 7px vertical / 10px horizontal padding, 12px label + 10px monospace shortcut right-aligned, 3px radius on hover.
- Menu by kind:
  - `file`: pin / duplicate / rename / open vault folder / sep / close / close others / delete file (red).
  - `memory`, `preview`: pin / duplicate / sep / close / close others.
  - `settings`: close only.
  - `grid`: no menu.

**State management:**
- Tab list with: `id`, `kind`, `title`, `vault?`, `pinned?`, `dirty?` (for file kinds).
- Active tab id.
- Drag state: dragged tab id, drop-target tab id + side.
- Persist tab list + active id in localStorage on change. Hydrate on mount.
- Pin sort: `[grid, ...pinned (in pin order), ...rest (in user order)]`.

---

### 02 · Right sidebar coherence

**Purpose:** AgentConfig, MemoryGraphFilesPanel, and ProfileEditor share one shell so navigating between them feels like the same surface.

**Shared shell anatomy (top-to-bottom):**
1. **Crumb row** — 26px tall, 1px bottom border `--sb-line-soft`, background `--sb-bg-deep` (#050505). Padding `0 16px`. Monospace 10px, letter-spacing 0.06em. Crumbs separated by `›` in `--sb-fg-disabled`. Last crumb in `--sb-fg-muted`, others in `--sb-fg-faint`. Right-aligned `esc` hint in `--sb-fg-disabled`.
2. **Header** — padding `14px 16px 12px`, 1px bottom border `--sb-line-soft`, flex row gap 12px:
   - 40×40 glyph block, 4px radius, background `<accent>22`, 1px border `<accent>60`, glyph color `<accent>`, display font 22px (or mono for "md"-style glyphs).
   - Title: display font 18px, letter-spacing -0.01em, color `--sb-fg`.
   - Subtitle: 11.5px, `--sb-fg-faint`, marginTop 2px.
3. **Body** — flex 1, scroll-y, padding `14px 16px`. Sections separated by 18px bottom margin.
4. **Footer** (optional) — 1px top border `--sb-line-soft`, padding `10px 16px`, flex gap 8px, font 11.5px `--sb-fg-faint`.

**Section anatomy:**
- Header row: monospace 11px `--sb-fg-faint` "/// LABEL" left, optional 10px monospace action right.
- Section spacing below header: 8px.

**Row pattern (used heavily):**
- 5px vertical padding, 1px dotted bottom border `--sb-line-soft`.
- Left key: `--sb-fg-faint`, body or mono 11–12px.
- Right value: `--sb-fg` (or `--sb-fg-muted`), text-align right.

**Mode-specific glyph colors:**
- AgentConfig: agent's own color (mock uses Mercury blue `#7fb6d9`).
- FilesPanel: `#7fb6d9` (the file kind accent).
- ProfileEditor: `--sb-accent` (#d93b25) — only red glyph because this is a takeover state.

**ProfileEditor specifics:**
- Photo block: 96×96, 4px radius, dashed border `--sb-line`, centered "+ drop image" text, background `rgba(255,255,255,0.015)`. Below: 10.5px monospace hint "or pick a symbol below" in `--sb-fg-disabled`.
- Symbol picker: 7-column grid, 6px gap, square cells with 1px border. Selected cell has 1px accent border + `rgba(217,59,37,0.12)` background.
- Color picker: 10-column grid, 6px gap, circular swatches, selected has `2px solid #fff` border, others `1px solid rgba(255,255,255,0.15)`.
- Inputs: full-width, `rgba(255,255,255,0.03)` background, 1px border `--sb-line-soft`, padding `8px 10px`, 13px body font, 3px radius.
- Footer SAVE button: solid `--sb-accent` background, no border, white text, monospace 11px letter-spacing 0.04em, padding `5px 12px`, 3px radius. Cancel button is outlined transparent.

**FilesPanel specifics:**
- Search: padding `6px 10px`, 1px border `--sb-line-soft`, 3px radius, `rgba(255,255,255,0.02)` background. `/` glyph in mono `--sb-fg-faint`, placeholder `--sb-fg-muted`, `⌘F` hint right-aligned.
- File row: `4px 6px` padding, 2px radius, 12px font. Active row: `--sb-surface` background.
- File extension chip: 9px mono, fixed width 16px, color by kind: md→`#7fb6d9`, png→`#9bd1a4`, other→`--sb-fg-disabled`.
- Folder grouping: each subfolder gets a section with monospace label `/// CONCEPTS · 3` (label uppercase + count).

---

### 03 · Memory graph at two scales

**Purpose:** Same artifact at two zooms — sidebar mini and full middle-panel kind.

**Node rendering:**
- Default fill = kind color (see token diff). Override saved per-node.
- Index node: radius 10, larger than others.
- Hub / entity nodes: radius 7.
- All others: radius 5.
- Stroke: 0.5px `rgba(0,0,0,0.4)` default; focused node gets 1.5px white stroke + radial glow underlay (`url(#nodeGlow)` at radius +6).
- Hover: same glow without the white stroke.
- Dimmed nodes (focus active, not connected): opacity 0.35.

**Edge rendering:**
- Default: `rgba(255,255,255,0.09)` 0.6px.
- Connected to focused node: `--sb-accent` (#d93b25) 1.2px. **This is the only red on the canvas.**

**Labels:**
- Monospace 9px, `rgba(255,255,255,0.55)`, anchored center, positioned `r + 11` below node.
- Mini view: hide all labels except focused/hovered + always-on `index`.
- Full view: show all by default; user can toggle off.

**Mini view (in right sidebar shell):**
- 280px graph canvas, radial gradient background `radial-gradient(circle at 50% 50%, rgba(127,182,217,0.04), transparent 70%)`.
- Tooltip on hover: absolute, `rgba(10,10,10,0.95)` bg, kind-color border at 0.4 opacity, 6×9px padding, mono 11px, 3px radius, soft drop shadow.
- Bottom: collapsed legend (6 chips + "+4 more") in 10.5px mono.

**Full view (middle-panel kind):**
- Tab uses memory kind glyph + accent (`#a89be0`).
- Toolbar row in tab strip: filter chips ("all / concepts / sources / synthesis / assets") in mono 11px, active has 1px bottom border in `--sb-fg`.
- Right side of toolbar: stats `32 nodes · 36 edges`, zoom controls `−  1.0×  +  fit`.
- 280px right inspector panel, 1px left border `--sb-line`, padding `14px 16px`, flex column gap 16px:
  - Selected: marker + display 20px name + kind/path subtitle.
  - Color: marker + 22×22 swatches in flex-wrap, selected has 2px white border.
  - Backlinks: marker + list of 5 with kind-color dot + mono 11px filename + "+N more".
  - Preview: marker + monospace 11px excerpt with `[[wikilinks]]` styled inline, 10px padding, 1px border `--sb-line-soft`, max-height 160px.
  - Two outlined buttons at bottom: "open file", "focus subtree".

**Interactions:**
- Wheel zooms toward cursor (use `pointer.x/y` for the transform origin).
- Drag node to reposition (force layout pinned for that node after drag).
- Click node → focus + populate inspector.
- Click empty canvas → clear focus.
- Force layout: D3-force or manual; nodes have repulsion, edges have spring length proportional to edge type (entity↔entity short, source↔index long).

---

### 04 · Markdown editor + chat

**Editor layout:** Two columns — main editor flex 1 + 200px outline rail with 1px left border.

**Editor padding:** 32px top, 56px sides, 40px bottom.

**Save pill** (absolute, top: 14px, right: 24px):
- States: SAVING (yellow `#e6c068`), SAVED (green `#9bd1a4`), CONFLICT (red `--sb-accent`).
- Anatomy: 4px×10px padding, 999px radius, 1px border at 0.4 alpha of state color, background at 0.08 alpha, mono 10px, 0.06em letter-spacing, 5px dot left of text.
- SAVED state fades out after 4s; SAVING shows during in-flight write; CONFLICT stays until resolved.

**Breadcrumb above heading:** mono 10.5px `--sb-fg-faint`, 0.06em letter-spacing, format `ATLAS / CONCEPTS / Q3-ROADMAP.MD`.

**Typography in editor:**
- H1: display 32px, letter-spacing -0.02em, weight 500.
- H2: display 19px, letter-spacing -0.01em, weight 500, margin `24px 0 10px`.
- Body: 15px, line-height 1.7, color `--sb-fg`.
- Lists: padding-left 18px, font 14.5px, line-height 1.75.

**`[[wikilink]]` styling:**
- Color `#7fb6d9`.
- 1px dashed bottom border `rgba(127,182,217,0.5)`.
- Cursor pointer.
- Click: navigate to file in current tab, or open in new tab on cmd-click.

**File-link chip styling:**
- Inline-flex with 4px gap.
- Padding `0 5px`, 1px border `--sb-line-soft`, 3px radius.
- Mono 12px.
- Color by kind: md→`#7fb6d9`, png/asset→`#9bd1a4`.
- Inline 9px kind glyph (md/png) before the path.
- vertical-align: 1px (so it sits properly inline with body text).

**Caret:** 1.5px wide, 18px tall (matches body line-height at 15px), `--sb-accent`, blink animation `caretBlink 1s steps(2) infinite { to { opacity: 0; } }`.

**Outline rail:**
- Padding `32px 16px`, monospace 11px column.
- Active section: color `--sb-fg`, 2px left border `--sb-accent`, 10px left padding, -2px left margin.
- Inactive sections: 12px left padding only.
- Below outline: backlinks section (mono 11), then meta (`358 words`, `updated 2s ago`).

**Chat column anatomy (420px width artboard):**

Header pattern: same shared `crumb row + 14px-padded title block` from artboard 02. Live agent gets a 6px green dot with `0 0 6px` glow on the right.

**Bubbles:**
- User: align-end, max-width 85%, `--sb-surface` background, 1px `--sb-line-soft` border, 4px radius (top-right corner 0), padding `8px 12px`, 13px font line-height 1.5.
- Agent: align-start, max-width 90%, agent.color + 0F (transparent) background, agent.color + 30 border, 4px radius (top-left 0), padding `10px 12px`.

**Tool call card** (between bubbles):
- align-start, max-width 90%, `rgba(255,255,255,0.025)` bg, 1px `--sb-line-soft` border.
- Mono 11px row: kind glyph (gold ⚙) + tool name + ` · ` + duration in `--sb-fg-faint` + right-aligned status (`● done` green, `● failed` red).

**Markdown rendering:** use `marked` + DOMPurify, run `[[wikilink]]` post-pass. Code blocks use the monospace tool-card styling. Render inside the agent bubble.

**Typing indicator:**
- align-start, max-width 85%, agent.color + 12 bg, agent.color + 40 border, 4px radius (top-left 0), padding `10px 12px`.
- Three 5px dots, gap 5px, agent.color, animation:
  ```css
  @keyframes typingDot {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-2px); }
  }
  ```
  - Dot 1: no delay. Dot 2: 0.2s delay. Dot 3: 0.4s delay.

**Composer:**
- 1px top border `--sb-line-soft`, padding `10px 16px`, flex align-start gap 8px.
- Textarea: flex 1, min-height 36px, no resize, `rgba(255,255,255,0.025)` bg, 1px `--sb-line-soft` border, 12.5px body font, 3px radius.
- Right of textarea: mono 10px `⌘↵` hint in `--sb-fg-disabled`, align-self end.

---

### 05 · Left sidebar

**Purpose:** Replace the implicit sessions-only list with an explicit Sessions / Agents toggle. Solve the "have to chat with an agent to see what they're doing" pain by surfacing working state inline.

**Shell anatomy (320px wide):**
1. **Toggle bar** — 36px, `--sb-bg-deep` background, padding `0 8px`, gap 4px, 1px bottom border `--sb-line-soft`. Two equal-flex buttons.
   - Active button: `--sb-surface` bg, 1px `--sb-line` border, `--sb-fg`, mono 11px label, 0.04em letter-spacing, 24px tall, 3px radius. Shows ⌘1 / ⌘2 shortcut hint right of label in `--sb-fg-disabled` 9px when active.
   - Inactive: transparent, transparent border, `--sb-fg-faint`.
2. **Search** — padding `8px 10px`, 1px bottom `--sb-line-soft`, mono 11px row: `/` + placeholder + count.
3. **Body** — flex 1, scroll-y. Section markers with `/// SECTION · COUNT`.

**Session row anatomy:**
- Padding `10px 10px`, flex gap 8px, 1px bottom `--sb-line-soft`.
- 2px left border: transparent default, `--sb-accent` when active. Active row also gets `--sb-surface` background.
- Avatar: 26×26, 3px radius, agent.color + 22 bg, agent.color + 60 border, glyph display font 14px.
- Inter-agent (multi-avatar): same 26×26 frame, two 18×18 stacked avatars at `(0,0)` and `(8,4)` offsets, 30/70 alpha tints.
- Right column (flex 1, min-width 0):
  - Top row: name (12px, weight 500 if unread else 400) + working pip + spacer + time (mono 9.5px `--sb-fg-disabled`).
  - Body line: 11px line-height 1.4, 2-line clamp, color `--sb-fg-muted` if unread else `--sb-fg-faint`.
- Unread indicator (when not active): 5px red dot, absolute right: 8, top: 12.

**Agent row anatomy:**
- Same padding/border/avatar treatment as sessions.
- Right column:
  - Top row: name + working pip + optional draft tag (`draft` mono 9, 1px border `--sb-line`, padding `0 4px`) + time.
  - Subtitle: mono 10.5px `--sb-fg-faint`, current task copy (e.g. "Drafting roadmap.md", "Running test suite", "Walking → Onyx", "Idle").
- Active row shows mono 9px `↵ chat` hint absolute right: 10, bottom: 6.

**Working pip:** 6px circle, color by state (see tokens). Animations:
- thinking: solid, no animation.
- tool-running: `workPulse` 1.4s — scale 1↔1.5, opacity 1↔0.4 at 50%.
- awaiting-input: `workBlink` 0.9s — opacity 1↔0.25 at 50%. **This is the only red animation in the sidebar.**
- moving: solid, no animation.
- idle: pip not rendered.

**Glow on pips:**
- awaiting-input: `0 0 6px rgba(217,59,37,0.8)`.
- others: `0 0 4px <color>80`.

**Click behavior on agent rows:**
- **Single click → focus the agent on the hex grid** (no navigation). The grid scrolls to center on that agent's cell.
- **Enter (when row is keyboard-focused) → open chat tab** for that agent.
- **Double-click → open chat tab.**
- This split solves the existing problem where any click navigates away from where you were.

**3-agent edge case:** Show normal list, then a dashed-border empty-state card after the rows: display 14px "quiet world." + 11.5px copy "three agents — pick one of the empty cells on the grid to seed a fourth." + outlined accent button "+ NEW AGENT".

**Section grouping:**
- Sessions: `LIVE · N` then `ARCHIVED`. Archived rows use muted text throughout.
- Agents: `WORKING · N` (anything where state ≠ idle), `IDLE · N`, `DRAFT · N`.

---

### 06 · Tokens diff

See `boards/tokens-diff.jsx` and the rendered artboard for the canonical list. Summary:

**21 new tokens, zero replacements, zero new font sizes.** All new colors stay inside the existing palette. Red gains exactly two new uses (`--sb-kind-grid`, `--sb-work-awaiting-input`) — both semantically "demands attention" so the one-red-moment rule holds.

#### New tokens to add to `tokens.css`:

```css
/* tab kinds */
--sb-kind-grid: #d93b25;       /* alias to --sb-accent */
--sb-kind-file: #7fb6d9;
--sb-kind-memory: #a89be0;
--sb-kind-preview: #9bd1a4;
--sb-kind-settings: #737373;

/* working state */
--sb-work-thinking: #7fb6d9;
--sb-work-tool: #e6c068;
--sb-work-awaiting-input: #d93b25;
--sb-work-moving: #a89be0;

/* memory graph nodes */
--sb-graph-index: #e6c068;
--sb-graph-log: #9bd1a4;
--sb-graph-hub: #7fb6d9;
--sb-graph-entity: #a89be0;
--sb-graph-concept: #e89c7f;
--sb-graph-source: #88c4ce;
--sb-graph-synthesis: #d9a3c9;
--sb-graph-doc: #c8c8b8;
--sb-graph-asset: #7fa8a8;
--sb-graph-skill: #d4b896;

/* save pill */
--sb-pill-saved: #9bd1a4;
--sb-pill-saving: #e6c068;
--sb-pill-conflict: #d93b25;

/* type */
--sb-text-crumb: 10.5px / 1.4 / 0.06em;  /* breadcrumb row */

/* surface revisions */
--sb-line-soft: rgba(255,255,255,0.03);  /* up from 0.025 */
--sb-surface-hover: rgba(255,255,255,0.025);  /* extracted from inline */
```

## State management notes

- **Tab state**: persist `tabs[]`, `activeTabId`, `pinnedTabIds[]` to localStorage; hydrate on mount.
- **Left sidebar mode**: persist `mode: 'sessions' | 'agents'` and the search filter to localStorage.
- **Right sidebar mode**: ephemeral; driven by current selection (agent row → AgentConfig, file row → FilesPanel, profile click → ProfileEditor takeover).
- **Editor save state**: debounced autosave 800ms after last keystroke. Pill state machine: `idle → saving → saved (fade 4s)` or `saving → conflict (sticky)`.
- **Memory graph**: persist per-node color overrides + manual node positions to the vault as `.graph.json` adjacent to `index.md`.
- **Agent working state**: poll/subscribe to existing agent runtime; pip state derives from it.

## Animations & transitions

- Caret blink: 1s steps(2).
- Typing dots: 1.2s, staggered 0.2s/0.4s.
- Working pip (tool-running): 1.4s scale + opacity.
- Working pip (awaiting-input): 0.9s blink.
- Save pill SAVED → fade out: opacity 1 → 0 over 400ms after 4s hold.
- Tab drag ghost: rotate(-1.5deg) static (no animation; the tilt is just a "in-transit" visual cue).
- Drop indicator: appears instantly on dragover, no fade.
- Right sidebar mode swap: 120ms cross-fade between AgentConfig / FilesPanel / ProfileEditor.

## Assets

No new image or icon assets. Glyphs (G, md, ◉, ▦, ⚙, ◆, ✦, ♪, ☼, ☿, etc.) are unicode characters rendered in the existing display font. The profile photo upload uses native file input.

## Implementation order suggestion

1. Tokens — land the 21 new CSS variables first so subsequent work has them.
2. Tab strip taxonomy — affects every screen that shows tabs.
3. Left sidebar toggle + working pips — unblocks the agent-state visibility pain immediately.
4. Right sidebar shared shell — refactors three existing components onto one chrome.
5. Memory graph (full + mini) — biggest single feature.
6. Markdown editor save pill + wikilinks + file-link chips.
7. Chat typing indicator + agent-color tints.

Each can land independently behind a feature flag if needed.
