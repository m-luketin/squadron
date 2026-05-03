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

