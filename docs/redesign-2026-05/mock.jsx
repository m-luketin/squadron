// Rich mock world for the redesign canvas.
// 25 agents (range from 3-agent edge case shown elsewhere), busy graphs, live sessions.

const PALETTE = [
  '#e6c068', '#7fb6d9', '#a89be0', '#9bd1a4',
  '#e89c7f', '#d9a3c9', '#c8c8b8', '#7fa8a8',
  '#d4b896', '#88c4ce',
];

const AGENTS = [
  { id: 'a1', name: 'Atlas',    glyph: '🜂', photo: null, color: PALETTE[0], status: 'Live', state: 'thinking',     model: 'claude-3.5-sonnet', vault: 'atlas',    msgs: 248, tools: 41, lastAt: '2m',  task: 'Drafting roadmap.md' },
  { id: 'a2', name: 'Mercury',  glyph: '☿', photo: null, color: PALETTE[1], status: 'Live', state: 'tool-running', model: 'claude-3.5-sonnet', vault: 'mercury',  msgs: 137, tools: 88, lastAt: 'now', task: 'Running test suite' },
  { id: 'a3', name: 'Onyx',     glyph: '◆', photo: null, color: PALETTE[2], status: 'Live', state: 'idle',         model: 'codex-1',           vault: 'onyx',     msgs: 64,  tools: 22, lastAt: '6m',  task: 'Awaiting handoff' },
  { id: 'a4', name: 'Vesper',   glyph: '✦', photo: null, color: PALETTE[3], status: 'Live', state: 'awaiting-input', model: 'claude-3.5-sonnet', vault: 'vesper', msgs: 19,  tools: 4,  lastAt: '1m',  task: 'Needs review' },
  { id: 'a5', name: 'Lyra',     glyph: '♪', photo: null, color: PALETTE[4], status: 'Live', state: 'moving',       model: 'claude-3.5-sonnet', vault: 'lyra',     msgs: 92,  tools: 17, lastAt: 'now', task: 'Walking → Onyx' },
  { id: 'a6', name: 'Halcyon',  glyph: '◯', photo: null, color: PALETTE[5], status: 'Live', state: 'idle',         model: 'codex-1',           vault: 'halcyon',  msgs: 71,  tools: 12, lastAt: '14m', task: 'Idle' },
  { id: 'a7', name: 'Rune',     glyph: 'ᚱ', photo: null, color: PALETTE[6], status: 'Live', state: 'thinking',     model: 'claude-3.5-sonnet', vault: 'rune',     msgs: 33,  tools: 8,  lastAt: '4m',  task: 'Spec review' },
  { id: 'a8', name: 'Solace',   glyph: '☼', photo: null, color: PALETTE[7], status: 'Draft', state: 'idle',        model: 'codex-1',           vault: 'solace',   msgs: 0,   tools: 0,  lastAt: '—',   task: 'Not yet instantiated' },
  { id: 'a9', name: 'Perseus',  glyph: '♆', photo: null, color: PALETTE[8], status: 'Live', state: 'tool-running', model: 'claude-3.5-sonnet', vault: 'perseus',  msgs: 188, tools: 54, lastAt: 'now', task: 'Indexing repo' },
  { id: 'a10', name: 'Jasper',  glyph: '◈', photo: null, color: PALETTE[9], status: 'Live', state: 'idle',         model: 'codex-1',           vault: 'jasper',   msgs: 45,  tools: 9,  lastAt: '8m',  task: 'Lint pass' },
];

// 3-agent edge case
const SMALL_AGENTS = AGENTS.slice(0, 3);

// Vault file tree, Karpathy-style
const VAULT_FILES_ATLAS = [
  'index.md',
  'log.md',
  'skills.md',
  'entities/team.md', 'entities/mercury.md', 'entities/onyx.md', 'entities/vesper.md',
  'concepts/auth-v3.md', 'concepts/q3-roadmap.md', 'concepts/risks.md',
  'sources/anthropic-blog.md', 'sources/karpathy-llm-os.md',
  'synthesis/q3-tight-rationale.md', 'synthesis/handoff-pattern.md',
  'raw/documents/prd-2026-04.md', 'raw/documents/customer-call-may2.md',
  'raw/assets/screenshot-1.png', 'raw/assets/wireframe.png',
];

// Memory graph — 32 nodes, force-laid (precomputed positions in unit square)
const MEMORY_GRAPH_BIG = {
  nodes: [
    { id: 'index',     x: 0.50, y: 0.50, label: 'index',         kind: 'index', color: '#e6c068' },
    { id: 'log',       x: 0.50, y: 0.85, label: 'log',           kind: 'log' },
    { id: 'skills',    x: 0.20, y: 0.55, label: 'skills',        kind: 'hub', color: '#7fb6d9' },

    { id: 'team',      x: 0.72, y: 0.30, label: 'team',          kind: 'entity' },
    { id: 'mercury',   x: 0.85, y: 0.18, label: 'mercury',       kind: 'entity', color: '#7fb6d9' },
    { id: 'onyx',      x: 0.92, y: 0.42, label: 'onyx',          kind: 'entity', color: '#a89be0' },
    { id: 'vesper',    x: 0.78, y: 0.50, label: 'vesper',        kind: 'entity', color: '#9bd1a4' },

    { id: 'authv3',    x: 0.30, y: 0.20, label: 'auth-v3',       kind: 'concept', color: '#d93b25' },
    { id: 'q3road',    x: 0.50, y: 0.18, label: 'q3-roadmap',    kind: 'concept' },
    { id: 'risks',     x: 0.60, y: 0.07, label: 'risks',         kind: 'concept' },
    { id: 'pattern',   x: 0.10, y: 0.25, label: 'handoff-pattern', kind: 'concept' },

    { id: 'srcA',      x: 0.08, y: 0.42, label: 'anthropic-blog', kind: 'source' },
    { id: 'srcK',      x: 0.05, y: 0.62, label: 'karpathy-llm-os', kind: 'source' },
    { id: 'srcW',      x: 0.13, y: 0.78, label: 'wired-2024',     kind: 'source' },

    { id: 'synQ',      x: 0.42, y: 0.32, label: 'q3-tight-rat',   kind: 'synthesis', color: '#e89c7f' },
    { id: 'synH',      x: 0.30, y: 0.40, label: 'handoff-pattern', kind: 'synthesis', color: '#e89c7f' },
    { id: 'synA',      x: 0.55, y: 0.38, label: 'auth-rationale', kind: 'synthesis', color: '#e89c7f' },

    { id: 'docPRD',    x: 0.78, y: 0.74, label: 'prd-2026-04',    kind: 'doc' },
    { id: 'docCall',   x: 0.65, y: 0.78, label: 'customer-call',  kind: 'doc' },
    { id: 'asset1',    x: 0.88, y: 0.65, label: 'screenshot-1',   kind: 'asset' },
    { id: 'asset2',    x: 0.92, y: 0.82, label: 'wireframe',      kind: 'asset' },

    { id: 'tweetA',    x: 0.32, y: 0.72, label: 'tweet-thread',   kind: 'skill' },
    { id: 'colde',     x: 0.20, y: 0.78, label: 'cold-email',     kind: 'skill' },
    { id: 'review',    x: 0.38, y: 0.85, label: 'code-review',    kind: 'skill' },
    { id: 'meet',      x: 0.28, y: 0.90, label: 'meeting-notes',  kind: 'skill' },

    { id: 'changelog', x: 0.62, y: 0.62, label: 'changelog',      kind: 'concept' },
    { id: 'voice',     x: 0.48, y: 0.65, label: 'voice-guide',    kind: 'concept' },
    { id: 'archive',   x: 0.72, y: 0.92, label: 'archive',        kind: 'doc' },
  ],
  edges: [
    ['index','log'],['index','skills'],['index','team'],['index','q3road'],['index','synQ'],['index','synH'],['index','synA'],
    ['team','mercury'],['team','onyx'],['team','vesper'],
    ['q3road','risks'],['q3road','authv3'],['q3road','synQ'],
    ['authv3','synA'],['authv3','mercury'],['authv3','onyx'],
    ['pattern','synH'],['pattern','onyx'],
    ['synQ','srcK'],['synH','srcA'],['synA','srcW'],
    ['srcK','docPRD'],['srcA','docCall'],
    ['docPRD','asset1'],['docPRD','asset2'],
    ['skills','tweetA'],['skills','colde'],['skills','review'],['skills','meet'],
    ['changelog','vesper'],['voice','vesper'],['archive','docCall'],
    ['log','tweetA'],['log','review'],
  ],
};

// Smaller sidebar-mini graph — same shape, just first ~14 nodes
const MEMORY_GRAPH_MINI = {
  nodes: MEMORY_GRAPH_BIG.nodes.filter(n =>
    ['index','log','skills','team','q3road','authv3','risks','synQ','synH','srcK','docPRD','tweetA','review','changelog'].includes(n.id)
  ),
  edges: MEMORY_GRAPH_BIG.edges.filter(([a, b]) => {
    const keep = new Set(['index','log','skills','team','q3road','authv3','risks','synQ','synH','srcK','docPRD','tweetA','review','changelog']);
    return keep.has(a) && keep.has(b);
  }),
};

// Open tabs for the canvas
const OPEN_TABS = [
  { id: 'grid',     kind: 'grid',     title: 'hex grid' },
  { id: 'roadmap',  kind: 'file',     title: 'roadmap.md',     vault: 'atlas',   pinned: false },
  { id: 'authv3',   kind: 'file',     title: 'auth-v3.md',     vault: 'mercury', pinned: true },
  { id: 'memory',   kind: 'memory',   title: 'mercury · graph', vault: 'mercury' },
  { id: 'preview',  kind: 'preview',  title: 'wireframe.png',  vault: 'atlas' },
  { id: 'settings', kind: 'settings', title: 'settings' },
];

const SESSIONS = [
  { id: 's1', kind: 'user',  agentId: 'a1', label: 'Atlas',        last: 'pulled three options into the doc — pick one.', time: '2m',  status: 'live', unread: true,  pulsing: true },
  { id: 's2', kind: 'user',  agentId: 'a2', label: 'Mercury',      last: 'tests are green. want me to ship?',             time: 'now', status: 'live', unread: true,  pulsing: true, working: 'tool-running' },
  { id: 's3', kind: 'user',  agentId: 'a3', label: 'Onyx',         last: 'refactor done. 14 files touched.',              time: '6m',  status: 'live', unread: false },
  { id: 's4', kind: 'user',  agentId: 'a4', label: 'Vesper',       last: 'i drafted v0.2 release notes — review?',        time: '1m',  status: 'live', unread: true,  working: 'awaiting-input' },
  { id: 's5', kind: 'user',  agentId: 'a5', label: 'Lyra',         last: 'walking over to Onyx for the review.',          time: 'now', status: 'live', unread: false, working: 'moving' },
  { id: 's6', kind: 'user',  agentId: 'a7', label: 'Rune',         last: 'reading [[concepts/auth-v3.md]]',               time: '4m',  status: 'live', unread: false, working: 'thinking' },
  { id: 's7', kind: 'inter', agentIds: ['a1','a2'], label: 'Atlas ↔ Mercury', last: '"…can you re-run with the verbose flag?"', time: 'now', status: 'live', unread: true,  pulsing: true },
  { id: 's8', kind: 'inter', agentIds: ['a2','a3'], label: 'Mercury ↔ Onyx',  last: '"handoff: branch refactor/auth-v3"',        time: '4m',  status: 'live', unread: false },
  { id: 's9', kind: 'inter', agentIds: ['a1','a4'], label: 'Atlas ↔ Vesper',  last: 'session archived',                          time: '22m', status: 'archived', unread: false },
];

window.MOCK = {
  PALETTE, AGENTS, SMALL_AGENTS, VAULT_FILES_ATLAS,
  MEMORY_GRAPH_BIG, MEMORY_GRAPH_MINI, OPEN_TABS, SESSIONS,
};
