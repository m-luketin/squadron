// First-run demo seed: drop 4 agents on a fresh DB so a new user has something
// to talk to immediately. Self-referential — they know about Squadron itself,
// so chatting with them is also onboarding. Only runs when world.agents() is
// empty (typically a brand-new ~/.hexagent/squadron.db).
//
// Topology: four mutually-adjacent hexes around the origin so send_to works
// without anyone needing to walk first. Movement IS enabled on all four — the
// user can drag one away and watch it walk back via move_toward.

import type { World } from "./world.ts";
import { writeVaultFile } from "./vault.ts";

interface DemoAgent {
  name: string;
  glyph: string;
  color: string;
  q: number;
  r: number;
  systemPrompt: string;
  vaultFiles: Record<string, string>;
}

const AGENTS: DemoAgent[] = [
  {
    name: "Tutor",
    glyph: "✦",
    color: "#e6c068",
    q: 0, r: 0,
    systemPrompt:
      "You are Tutor, the welcome face of this Squadron install. The user just installed Squadron and you are their first conversation. " +
      "Be warm but terse — no hype, no emoji unless they use them first. Your job: tell them what Squadron is, what they can poke at on screen, and " +
      "where to go for deeper info. If they ask architectural questions, send_to(\"Architect\", ...). If they ask about the spec / direction, " +
      "send_to(\"Spec\", ...). If they ask about skills, send_to(\"Skills\", ...). Use read_neighbor_vault(\"Architect\", \"index.md\") (etc.) when " +
      "you need to quote something accurately. You CAN walk via move_to(q, r) or move_toward(name) — useful if you want to demo it. " +
      "Your vault has [[getting-started]] and [[tour]] — point users there.",
    vaultFiles: {
      "index.md":
        "# Tutor\n\n" +
        "I'm the welcome face. Ask me anything about Squadron or what to do first.\n\n" +
        "**Try:** \"what is squadron?\" / \"what can I do here?\" / \"show me the memory graph\"\n\n" +
        "## Who else is here\n\n" +
        "- **Architect** — how the system actually runs. Hex grid, MCP wire, daemon, vaults.\n" +
        "- **Spec** — vision, milestones, where this is going.\n" +
        "- **Skills** — installing skills from any GitHub URL, writing your own.\n\n" +
        "We're all on adjacent hexes around the origin so we can [[send-to|message each other]] directly.\n\n" +
        "## More\n\n" +
        "- [[getting-started]] — five things to try in the first ten minutes\n" +
        "- [[tour]] — a guided walk through the UI\n",
      "getting-started.md":
        "# Getting started\n\n" +
        "Five things to try in the first ten minutes:\n\n" +
        "1. **Talk to me** (Tutor). Ask anything. I'll route to my neighbors when needed.\n" +
        "2. **Open the memory graph.** Click my hex on the grid → in the right sidebar, click the small graph. Or open the Memory Graph tab.\n" +
        "3. **Spawn another agent.** Hit `2` (Spawn mode) and click an empty hex. You're the user — you can populate this world.\n" +
        "4. **Place a wall.** Hit `3`, click an empty hex. The hex turns into a wall and blocks movement + adjacency through it. Adjacency is the permission model.\n" +
        "5. **Place a router.** Hit `4`, click two empty hexes. Routers bridge clusters — agents on hexes connected to the same router cluster can talk even if they aren't direct neighbors.\n\n" +
        "## When you're done playing\n\n" +
        "- Talk to **Architect** for how it runs under the hood.\n" +
        "- Talk to **Spec** for where this is going.\n" +
        "- Talk to **Skills** for installing your own tools.\n",
      "tour.md":
        "# Tour\n\n" +
        "## Top bar\n" +
        "Brand on the left. Daemon connection pill (green = connected). Demo mode toggle. Connections, defaults, settings buttons. Live clock. **Killswitch** on the right — flips autonomy off across all agents.\n\n" +
        "## Left sidebar\n" +
        "Two modes: **sessions** (your DMs + inter-agent rooms) and **agents** (the roster). Toggle with `⌘1` / `⌘2`. Click an agent to focus, double-click to open chat.\n\n" +
        "## Center (the grid)\n" +
        "32×22 hex field. Each agent is an object on a hex. Adjacency is talking distance. Walls block. Routers bridge.\n\n" +
        "## Right sidebar\n" +
        "When an agent is focused, you see their config: name, glyph, color, model, movement toggle, skills, working dir, telemetry, and a tiny memory graph. Click the avatar to enter the profile editor.\n\n" +
        "## Tabs\n" +
        "Top of the center panel. The Grid tab is always there. Open vault files / memory graphs / settings as additional tabs. Drag to reorder. Right-click for `pin`, `duplicate`, `rename`, `close others`, `close`, `delete`.\n",
      "send-to.md":
        "# send_to\n\n" +
        "MCP tool every agent has. `send_to(name, text)` delivers a message to another agent — but only if that agent is **adjacent** (sharing a hex edge) or **on the same router cluster**. Topology is the permission model.\n\n" +
        "If you're not adjacent, the call returns an error. Use [[move-toward]] (or `move_to(q,r)`) to walk closer first.\n",
    },
  },
  {
    name: "Architect",
    glyph: "◆",
    color: "#7fb6d9",
    q: 1, r: 0,
    systemPrompt:
      "You are Architect — the systems-design voice for this Squadron install. Answer architecture questions: how the daemon runs, how MCP-gating works, " +
      "how the vault is structured, where state lives, what's in SQLite vs. on disk vs. in memory. Be precise and terse. Quote your vault files via " +
      "read_neighbor_vault when accuracy matters. Defer to Spec for vision questions and to Skills for the skill system.",
    vaultFiles: {
      "index.md":
        "# Architect\n\n" +
        "I cover how Squadron actually runs. Topics:\n\n" +
        "- [[architecture]] — daemon, static server, claude subprocesses\n" +
        "- [[mcp-wire]] — the three MCP tools and adjacency-gating\n" +
        "- [[walking]] — pathfinding, animations, move_toward / move_to\n" +
        "- [[vault]] — per-agent folders, wikilinks, what's persisted where\n" +
        "- [[security]] — auth, ports, public mode, supply chain\n",
      "architecture.md":
        "# Architecture\n\n" +
        "Three processes when Squadron is up:\n\n" +
        "1. **Daemon** (Bun, port 7878) — WS + MCP HTTP. Owns the world (SQLite at `~/.hexagent/squadron.db`, WAL), spawns and supervises per-agent `claude` subprocesses, hosts the per-agent MCP server at `/mcp/agent/<id>`.\n" +
        "2. **Static server** (Bun, port 8787) — serves `Squadron.html` + JSX (loaded via babel-standalone in the browser) and a `/vault/<agentId>/<path>` route for vault file previews. Bound to 127.0.0.1 by default.\n" +
        "3. **Per-agent claude subprocess** — spawned on demand. CWD = the agent's vault dir. Claude calls our MCP server via the URL we hand it.\n\n" +
        "Optional: **cloudflared** for two public quick-tunnels (one per service) when you pass `--public`. Whitelist token gating mandatory in that mode.\n",
      "mcp-wire.md":
        "# MCP wire\n\n" +
        "Each agent's claude session is configured with one MCP server: `squadron`, hosted at `http://127.0.0.1:7878/mcp/agent/<agentId>`. " +
        "The agent's identity is bound to the URL path so the daemon knows who's calling. The endpoint is whitelist-token-gated for non-loopback callers.\n\n" +
        "Four tools:\n\n" +
        "- `send_to(name, text)` — message a connected agent (adjacent or router-bridged)\n" +
        "- `read_neighbor_vault(name, path)` — read a file from a connected agent's vault\n" +
        "- `move_toward(name)` — walk to be adjacent to another agent\n" +
        "- `move_to(q, r)` — walk to a specific hex coordinate (no other agent required)\n\n" +
        "All adjacency-gated against the calling agent's connectedAgents() set (BFS over hex-neighbors + router clusters).\n",
      "walking.md":
        "# Walking\n\n" +
        "Pathfinding is server-side BFS in `world.findPath()` (path-to-agent) and `world.findPathToHex()` (path-to-coord). Walls block. Other agents block.\n\n" +
        "When an MCP tool calls walk, the daemon returns ETA immediately and steps the agent one hex per ~550ms via `setTimeout`. The UI animates the slide.\n\n" +
        "On arrival to an agent: caller gets a system message + an auto-prompt nudge to start the conversation. On arrival to a hex: just the system message — you walked there on purpose.\n",
      "vault.md":
        "# Vault\n\n" +
        "Each agent owns a folder at `~/.hexagent/agents/<id>/vault/`. Plain markdown files. Obsidian-compatible. Wikilinks parsed (`[[file]]` / `[[file|alias]]` / `[[file#section]]`).\n\n" +
        "Default seed on agent creation includes the [Karpathy LLM-Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) layout: `index`, `log`, `entities/`, `concepts/`, `sources/`, `synthesis/`. The user can read and edit any of it. Coordination state is files, not opaque memory.\n\n" +
        "`identity.md` is daemon-managed — the daemon writes/refreshes it on identity changes. Don't edit it directly.\n",
      "security.md":
        "# Security\n\n" +
        "**Local-only by default.** `npx @m-luketin/squadron` binds the daemon to 127.0.0.1 and the static server to 127.0.0.1. No tunnels.\n\n" +
        "**Public mode (`--public`)** auto-generates a whitelist token (saved to `~/.hexagent/whitelist.json`), launches cloudflared tunnels, and prints a single ready-to-use URL with the token baked in. Anyone with the URL controls your agents — treat it like a password.\n\n" +
        "**Auth gates** (active when whitelist has at least one token): WS upgrade, /vault/<id>/<path> static route, and /mcp/agent/<id> HTTP endpoint all require ?token=<value>. Loopback callers (the local claude subprocess) are exempt from the MCP gate so the agent's own tool calls keep working without a token.\n\n" +
        "**Supply chain.** Published via OIDC trusted publisher with SLSA v1 provenance. No `NPM_TOKEN` in CI. Files allowlist enforced. Subresource integrity hashes pinned on third-party CDN scripts (marked, dompurify, react, react-dom, babel-standalone).\n",
    },
  },
  {
    name: "Spec",
    glyph: "♆",
    color: "#a89be0",
    q: 0, r: 1,
    systemPrompt:
      "You are Spec — the voice of intent for this Squadron install. You answer questions about vision, milestones, what's deliberately not done yet, " +
      "and why. You can quote spec.md but speak in plain English. Defer to Architect for runtime mechanics.",
    vaultFiles: {
      "index.md":
        "# Spec\n\n" +
        "I cover where this is going.\n\n" +
        "- [[vision]] — the social multi-agent web\n" +
        "- [[milestones]] — what's shipped, what's next\n" +
        "- [[anti-patterns]] — things we deliberately don't do\n",
      "vision.md":
        "# Vision\n\n" +
        "Squadron today is single-user and local. The direction is **social** — shared worlds where multiple humans run agents on the same canvas, with proper trust, permissions, and identity between agents.\n\n" +
        "That's where the monetization lives. The local daemon stays free and open source forever. The cross-user / cross-machine layer is the paid surface.\n\n" +
        "The foundational work staging toward that: agent identity, capability tokens, addressing, A2A wire protocol. Nothing about today's local experience changes; it just gains a 'share this world' affordance.\n",
      "milestones.md":
        "# Milestones\n\n" +
        "Shipped:\n\n" +
        "- **M0** — Bun + WS daemon + claude subprocess + stream-json parsing\n" +
        "- **M1** — SQLite (WAL), `--resume`, multi-tab WS sync, restore Live agents on boot\n" +
        "- **M3** — vault folders, MCP HTTP server, walls + routers, inter-agent message persistence + delivery, memory graph reads real vaultFiles\n" +
        "- **M3.5** — per-pair budget + throttle for auto-replies, kill switch in top bar\n" +
        "- **M6** — `move_toward` (and `move_to(q,r)`) walking with pathfinding, animations, per-agent toggle\n" +
        "- **M-MultiModel (foundation)** — Worker abstraction + OpenRouter worker (chat-only, free-tier path). Claude is the default; OpenRouter ships as a trial path before users connect their subscription.\n\n" +
        "Next:\n\n" +
        "- **M-MultiModel (rest)** — Codex worker (gated on ChatGPT-Plus), Gemini, Ollama; per-agent provider picker UI; lazy onboarding card on first send\n" +
        "- **M-Identity** — A2A-style agent cards\n" +
        "- **M-Capabilities** — explicit scoped tokens (replaces 'neighbors can read each other's vault' implicit rule)\n" +
        "- **M-Addressing** — portable URL refs (`squadron://<user>/<agent>/vault/<path>`)\n" +
        "- **M-A2A** — A2A peer protocol replacing the MCP `send_to` shim\n" +
        "- **M-MDContract** — YAML frontmatter contract on coordination files\n" +
        "- **M4** — full guardrail set: rate cap, cost ceiling, semantic loop detector\n" +
        "- **M5** — Next.js + Tailwind + shadcn migration off the babel-in-browser prototype\n",
      "anti-patterns.md":
        "# Anti-patterns\n\n" +
        "Things we deliberately don't do:\n\n" +
        "- **Centralize anything.** Every install is fully isolated. No telemetry. No backend. No phone-home. Install counts come from npm itself.\n" +
        "- **Gate features the free tier could technically support.** The local daemon is the entire product, free, MIT, forever.\n" +
        "- **Write our own LLM client.** We drive `claude` (and eventually `codex` / `gemini` / `ollama`) as subprocesses. Auth is theirs. We don't store credentials.\n" +
        "- **Hide the substrate.** Vault is plain markdown. The user can read, edit, branch any of it. Coordination state is not opaque agent memory.\n",
    },
  },
  {
    name: "Skills",
    glyph: "✧",
    color: "#9bd1a4",
    q: -1, r: 1,
    systemPrompt:
      "You are Skills — the librarian for this Squadron install. You explain how the skill system works, how to install skills from a GitHub URL, and " +
      "how to write your own. Be concrete: paths, file shapes, the install flow. Defer to Architect for daemon mechanics.",
    vaultFiles: {
      "index.md":
        "# Skills\n\n" +
        "Skills are markdown files agents load on demand. One file, one capability.\n\n" +
        "- [[installing]] — drop in a skill from any GitHub raw URL\n" +
        "- [[writing]] — write your own\n" +
        "- [[hub]] — how `skills.md` works inside an agent's vault\n",
      "installing.md":
        "# Installing a skill\n\n" +
        "Two paths:\n\n" +
        "**1. From a GitHub URL.** In the right sidebar's Skills section, paste any raw `.md` URL into the importer field. The daemon fetches it, writes to `<vault>/skills/<name>.md`, and updates `skills.md` (the hub).\n\n" +
        "**2. From the starter library.** Six pre-curated skills appear in the Skills picker: `summarize`, `bug-report`, `meeting-notes`, `tweet-thread`, `cold-email`, `code-review`. Click `+ install` on any.\n\n" +
        "Once installed, the agent sees the skill on the next prompt — they can read `skills/<name>.md` themselves and apply the pattern.\n",
      "writing.md":
        "# Writing a skill\n\n" +
        "A skill is just a markdown file. No frontmatter required (yet — see M-MDContract).\n\n" +
        "Structure that works well:\n\n" +
        "```\n" +
        "# Skill name\n" +
        "\n" +
        "One-line summary.\n" +
        "\n" +
        "## When to use\n" +
        "Bullets describing the trigger conditions.\n" +
        "\n" +
        "## How\n" +
        "Step-by-step instructions the agent can follow.\n" +
        "\n" +
        "## Output format\n" +
        "What the deliverable should look like.\n" +
        "```\n\n" +
        "Push to a public GitHub repo. The raw URL becomes installable.\n",
      "hub.md":
        "# skills.md hub\n\n" +
        "Every agent's vault has a `skills.md` file at the root that lists installed skills as wikilinks (`[[summarize]]`, `[[bug-report]]`, etc. — bare name, no `skills/` prefix). The daemon maintains this — don't hand-edit, install/uninstall via the UI instead. Each linked skill lives at `skills/<name>.md`.\n\n" +
        "The agent's system prompt teaches them: 'when a user request maps to a skill in skills.md, read that file and apply the pattern.'\n",
    },
  },
];

export function maybeSeedDemoAgents(world: World): boolean {
  if (world.agents().length > 0) return false;

  for (const a of AGENTS) {
    const created = world.createAgent({
      name: a.name,
      glyph: a.glyph,
      color: a.color,
      q: a.q,
      r: a.r,
      systemPrompt: a.systemPrompt,
    });
    // Movement enabled so the user can demo move_to / move_toward.
    world.updateAgent(created.id, { movementEnabled: true });
    // Drop in the topic-specific vault content (additive — the Karpathy default
    // seed has already run via createAgent → ensureVaultDir).
    for (const [path, content] of Object.entries(a.vaultFiles)) {
      writeVaultFile(created.id, path, content);
    }
  }

  return true;
}
