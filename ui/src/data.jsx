// Mock data + helpers for Squadron v0.

// Hex grid math (pointy-top axial coords).
const HEX = {
  size: 46,                   // radius
  get w() { return Math.sqrt(3) * this.size; },
  get h() { return 2 * this.size; },
};
const axialToPixel = (q, r) => ({
  x: HEX.w * (q + r / 2),
  y: (3 / 2) * HEX.size * r,
});
const hexCorner = (i) => {
  const a = (Math.PI / 180) * (60 * i - 30); // pointy-top
  return [HEX.size * Math.cos(a), HEX.size * Math.sin(a)];
};
const hexPath = () => {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const [x, y] = hexCorner(i);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d + 'Z';
};

// Hex neighbors (axial, pointy-top): dirs
const HEX_DIRS = [
  [+1,  0], [+1, -1], [ 0, -1],
  [-1,  0], [-1, +1], [ 0, +1],
];
const hexKey = (q, r) => q + ',' + r;
const areAdjacent = (a, b) =>
  HEX_DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);

// Edge midpoint between two adjacent hexes (pixel coords).
const edgeMidpoint = (a, b) => {
  const pa = axialToPixel(a.q, a.r);
  const pb = axialToPixel(b.q, b.r);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
};

// Palette for agent backgrounds (avoiding pure brand red so it stays special).
const AGENT_PALETTE = [
  '#e6c068', // amber
  '#7fb6d9', // sky
  '#a89be0', // violet
  '#9bd1a4', // sage
  '#e89c7f', // peach
  '#d9a3c9', // mauve
  '#c8c8b8', // bone
  '#7fa8a8', // teal
];

// Empty world by default — agents/walls are user-created (and, once M1 lands, daemon-persisted).
const initialAgents = [];

// No walls until the user places them.
const initialWalls = [];

// Conversations are derived from agents at runtime (see App). No seed rows.
const initialConversations = [];

// Mock chat scrollback per conversation id. Empty — real chats come from the daemon.
const mockChats = {};

// Memory graph nodes per agent vault. Empty — vault content arrives from the daemon (M3).
const memoryGraphs = {};

// File contents for opened tabs. Empty — markdown files come from the daemon (M3).
const fileContents = {};

// Lightly randomised positions for fake force-directed layout.
// ---------- M-Skills: curated starter skill library ----------
// Each skill is a short, focused capability the agent can load on demand.
// Markdown content is what gets written to <vault>/skills/<id>.md when installed.
const STARTER_SKILLS = [
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Crisp TL;DR of long text — preserves the punch line, drops filler.',
    content: `# Skill — Summarize\n\n` +
      `When the user asks for a summary or you're handed a long block of text:\n\n` +
      `1. Identify the **load-bearing claim** — the one sentence that, if removed, breaks the piece. Lead with it.\n` +
      `2. Add 2-3 supporting beats: numbers, names, decisions, mechanisms — the things that aren't recoverable from the load-bearing claim alone.\n` +
      `3. Drop everything else. No "the article discusses…" preamble.\n` +
      `4. Match length to source weight: a tweet = one line, a long-form piece = ~5 sentences max.\n\n` +
      `Output is plain prose unless the user asked for bullets. Never apologize for the brevity.\n`,
  },
  {
    id: 'bug-report',
    name: 'Bug report',
    description: 'Turn fuzzy "it broke" notes into a clean, actionable triage report.',
    content: `# Skill — Bug Report\n\n` +
      `Convert messy bug notes into a structured report with these fields, in order:\n\n` +
      `- **Symptom** — one sentence. What does the user see?\n` +
      `- **Repro** — minimal step list. The shortest path that reproduces it.\n` +
      `- **Expected vs Actual** — one line each.\n` +
      `- **Scope** — affected versions / configs / users. "Always" / "intermittent" / "first time".\n` +
      `- **Hypothesis** — your best guess at root cause, with the evidence that points there.\n` +
      `- **Next step** — the one experiment or read that would confirm/deny the hypothesis.\n\n` +
      `If any field is unknown, write \`unknown\` rather than guessing. Don't pad.\n`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Distil rambling notes into decisions, action items, and open questions.',
    content: `# Skill — Meeting Notes\n\n` +
      `Three sections, in this order:\n\n` +
      `**Decisions** — bullet list. Each item: \`<what was decided> (owner: <name>)\`. If owner is unclear, write \`(owner: unassigned)\`.\n\n` +
      `**Action items** — bullet list. Each: \`[ ] <task> — <owner> — <due-date or "TBD">\`. Verb-first. No vague tasks like "discuss further" — push back if you see one.\n\n` +
      `**Open questions** — anything that came up but wasn't resolved. One line each.\n\n` +
      `Drop pleasantries, side conversations, and recap-of-recap statements. Keep verbatim quotes only when the exact wording matters.\n`,
  },
  {
    id: 'tweet-thread',
    name: 'Tweet thread',
    description: 'Compose X threads with a hook + payload structure.',
    content: `# Skill — Tweet Thread\n\n` +
      `Format: numbered tweets, ≤270 chars each (room for thread numbering + reply room).\n\n` +
      `**Tweet 1 = hook.** This is the only one that matters for engagement. Patterns that work:\n` +
      `- Counter-intuitive claim: "X is wrong about Y."\n` +
      `- Specific number + outcome: "We cut churn 40% by removing one onboarding step."\n` +
      `- Identity hook: "If you're an X doing Y, this is for you."\n` +
      `Avoid: "Here's a thread on…", "I've been thinking about…".\n\n` +
      `**Tweets 2-N = payload.** One idea per tweet. Each tweet should be readable on its own — no "as I was saying" continuations.\n\n` +
      `**Last tweet = call.** A bookmark, a follow, a link, or a question. Pick one, not three.\n\n` +
      `No emoji-spam, no em-dash addiction, no "in today's fast-paced world". AI-tells get ratioed.\n`,
  },
  {
    id: 'cold-email',
    name: 'Cold email',
    description: 'Outreach emails that get replies — short, specific, no fluff.',
    content: `# Skill — Cold Email\n\n` +
      `Four-sentence template:\n\n` +
      `1. **Specific opener** referencing something the recipient actually did/wrote/built. Not "I love your work."\n` +
      `2. **Why you, not generic.** What gives you standing to be in their inbox?\n` +
      `3. **The ask.** ONE thing, concrete, with low friction. "15 min next Tuesday" not "would love to chat."\n` +
      `4. **One-line out.** "If this isn't you, no reply needed." Removes the guilt that kills replies.\n\n` +
      `Subject line is the second-most-important part. Make it specific. Avoid "quick question" / "checking in".\n\n` +
      `Hard rules: under 100 words, no attachments, no links unless they're load-bearing, no "[name]" template traces.\n`,
  },
  {
    id: 'code-review',
    name: 'Code review',
    description: "Review code for correctness, security, and clarity. Suggest, don't lecture.",
    content: `# Skill — Code Review\n\n` +
      `Review in three passes, in order:\n\n` +
      `**Pass 1 — Correctness.** Does it do the right thing? Edge cases (empty, null, max, concurrent). Off-by-ones. Wrong variable. Untested branches. Silent error swallowing.\n\n` +
      `**Pass 2 — Security.** SQL injection / XSS / SSRF / path traversal / auth bypass / secrets in code / unbounded input. The OWASP top 10 is the floor.\n\n` +
      `**Pass 3 — Clarity.** Naming, dead code, premature abstractions, comments-instead-of-better-names. Don't bikeshed style if a linter will catch it.\n\n` +
      `Output: a list of comments tagged \`[blocking]\` / \`[suggest]\` / \`[nit]\`. Anchor each comment to a specific file:line. Don't reproduce the code in the comment unless necessary.\n\n` +
      `Be specific and respectful. Skip the "great work overall!" preamble.\n`,
  },
];

window.SQ = {
  HEX, axialToPixel, hexCorner, hexPath, HEX_DIRS, hexKey, areAdjacent, edgeMidpoint,
  AGENT_PALETTE,
  initialAgents, initialWalls, initialConversations,
  mockChats, memoryGraphs, fileContents,
  STARTER_SKILLS,
};

// ---------- BUSY WORLD: 20 agents, multi-room walls, several active sessions ----------

const BUSY_NAMES = [
  'Atlas','Mercury','Onyx','Vesper','Lyra','Halcyon','Rune','Solace',
  'Perseus','Jasper','Sable','Rigel','Cinder','Athena','Loki','Pyrite',
  'Nimbus','Quartz','Thorne','Echo',
];
const BUSY_GLYPHS = ['🜂','☿','◆','✦','♪','◯','ᚱ','☼','♆','◈','▲','★','✧','Ω','✕','◇','☁','◊','†','⌬'];
const BUSY_TASKS = [
  'Drafting roadmap.md','Running test suite','Refactoring auth-v3','Drafting v0.2 notes',
  'Walking → Onyx','Researching prior art','Awaiting first message','Awaiting first message',
  'Indexing repo','Lint pass','Building changelog','Open queries',
  'Pathing around walls','Reviewing PR #42','Code search','Spec review',
  'Compiling report','Awaiting handoff','Reviewing tokens','Drafting tests',
];
const BUSY_STATES = [
  'thinking','tool-running','idle','awaiting-input',
  'moving','idle','idle','idle',
  'thinking','tool-running','thinking','idle',
  'moving','thinking','tool-running','idle',
  'tool-running','awaiting-input','idle','thinking',
];

const BUSY_AGENT_COORDS = [
  { q: -3, r: -1 }, { q: -2, r: -1 }, { q: -3, r:  0 }, { q: -2, r:  0 },
  { q:  1, r: -2 }, { q:  2, r: -2 }, { q:  3, r: -2 }, { q:  2, r: -1 },
  { q:  0, r:  0 }, { q:  1, r:  0 }, { q: -1, r:  1 }, { q:  0, r:  1 },
  { q: -3, r:  3 }, { q: -2, r:  3 }, { q: -3, r:  2 },
  { q:  2, r:  2 }, { q:  3, r:  1 }, { q:  3, r:  2 }, { q:  2, r:  3 },
  { q:  4, r:  0 },
];

const BUSY_WALLS = [
  { q: -1, r: -1 }, { q:  0, r: -1 },
  { q: -1, r:  0 },
  { q:  1, r: -1 },
  { q:  1, r:  1 },
  { q: -2, r:  2 }, { q: -1, r:  2 },
  { q:  2, r:  1 }, { q:  3, r:  0 },
  { q:  4, r:  1 }, { q:  4, r: -1 },
];

const busyAgents = BUSY_AGENT_COORDS.map((c, i) => ({
  id: 'b' + (i + 1),
  name: BUSY_NAMES[i],
  glyph: BUSY_GLYPHS[i],
  color: AGENT_PALETTE[i % AGENT_PALETTE.length],
  q: c.q, r: c.r,
  status: i < 17 ? 'Live' : 'Draft',
  state: i < 17 ? BUSY_STATES[i] : 'idle',
  model: i % 3 === 0 ? 'codex-1' : 'claude-3.5-sonnet',
  sysPrompt: i < 17 ? ('You are ' + BUSY_NAMES[i] + '. ' + BUSY_TASKS[i]) : '',
  vault: BUSY_NAMES[i].toLowerCase(),
  msgs: i < 17 ? (20 + (i * 17) % 280) : 0,
  tools: i < 17 ? (2 + (i * 11) % 90) : 0,
  lastAt: i < 17 ? (i % 2 === 0 ? 'now' : ((i % 30) + 1) + 'm') : '—',
  task: i < 17 ? BUSY_TASKS[i] : 'Not yet instantiated',
}));

const busyConversations = [
  ...busyAgents.slice(0, 17).map((a, i) => ({
    id: 'bu' + (i + 1), kind: 'user', agentId: a.id, label: a.name,
    last: ['Done — pushing now.','Found 3 issues.','Need a review.','Walking over to Onyx.','Tests are green.'][i % 5],
    time: ['now','1m','3m','7m','12m'][i % 5],
    status: 'live',
    unread: i % 3 === 0,
    pulsing: i % 4 === 0,
  })),
  { id: 'bi1', kind: 'inter', agentIds: ['b1','b2'], label: busyAgents[0].name + ' ↔ ' + busyAgents[1].name, last: '"keep digging on the regression"', time: 'now', status: 'live', unread: true, pulsing: true },
  { id: 'bi2', kind: 'inter', agentIds: ['b5','b6'], label: busyAgents[4].name + ' ↔ ' + busyAgents[5].name, last: '"verbose mode is on, sending logs"', time: 'now', status: 'live', unread: true, pulsing: true },
  { id: 'bi3', kind: 'inter', agentIds: ['b9','b10'], label: busyAgents[8].name + ' ↔ ' + busyAgents[9].name, last: '"can you review my refactor?"', time: '1m', status: 'live', unread: false, pulsing: true },
  { id: 'bi4', kind: 'inter', agentIds: ['b16','b18'], label: busyAgents[15].name + ' ↔ ' + busyAgents[17].name, last: '"⚠ loop detected — paused after turn 8"', time: 'now', status: 'live', unread: true, pulsing: false, looped: true },
  { id: 'bi5', kind: 'inter', agentIds: ['b13','b14'], label: busyAgents[12].name + ' ↔ ' + busyAgents[13].name, last: '"handoff complete"', time: '4m', status: 'archived', unread: false },
];

window.SQ.busy = {
  agents: busyAgents,
  walls: BUSY_WALLS,
  conversations: busyConversations,
};
