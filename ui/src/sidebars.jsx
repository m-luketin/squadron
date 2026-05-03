// Left + right sidebar components.

const { useState: useStateS, useMemo: useMemoS } = React;

// ---------- LEFT: conversations ----------

function ConvAvatar({ kind, agent, agents }) {
  if (kind === 'inter') {
    const a = agents.find(x => x.id === agent[0]);
    const b = agents.find(x => x.id === agent[1]);
    return (
      <div className="avatar dual">
        <span style={{ background: a?.color || '#444', color: 'rgba(0,0,0,0.85)' }}>{a?.glyph || '?'}</span>
        <span style={{ background: b?.color || '#444', color: 'rgba(0,0,0,0.85)' }}>{b?.glyph || '?'}</span>
      </div>
    );
  }
  return (
    <div className="avatar" style={{ background: agent?.color || '#444' }}>{agent?.glyph || '?'}</div>
  );
}

function LeftList({ conversations, agents, focusedAgentId, onOpen }) {
  const [filter, setFilter] = useStateS('all'); // all | live | archived | unread
  const [tab, setTab] = useStateS('all');       // all | yours | inter
  const [search, setSearch] = useStateS('');

  const filtered = useMemoS(() => conversations.filter(c => {
    if (filter === 'live'     && c.status !== 'live')     return false;
    if (filter === 'archived' && c.status !== 'archived') return false;
    if (filter === 'unread'   && !c.unread)               return false;
    if (tab === 'yours' && c.kind !== 'user')             return false;
    if (tab === 'inter' && c.kind !== 'inter')            return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(c.label || '').toLowerCase().includes(q) && !(c.last || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [conversations, filter, tab, search]);

  const yourChats  = filtered.filter(c => c.kind === 'user');
  const interChats = filtered.filter(c => c.kind === 'inter');

  return (
    <>
      <SearchBar value={search} onChange={setSearch} placeholder="search sessions…" />
      <div className="left-filters">
        {['all','live','archived','unread'].map(f => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? 'on' : ''}`}
            onClick={() => setFilter(f)}
          >{f}</button>
        ))}
        <span style={{ flex: 1 }}></span>
        <button className="filter-chip" title="Sort: newest">↓ new</button>
      </div>

      <div className="conv-list">
        {yourChats.length > 0 && tab !== 'inter' && (
          <>
            <div className="conv-section-head">your chats</div>
            {yourChats.map(c => {
              const ag = agents.find(a => a.id === c.agentId);
              return (
                <ConvRow key={c.id} c={c} agentParam={ag} agents={agents} focused={focusedAgentId === c.agentId} onOpen={() => onOpen(c)} />
              );
            })}
          </>
        )}
        {interChats.length > 0 && tab !== 'yours' && (
          <>
            <div className="conv-section-head">inter-agent sessions</div>
            {interChats.map(c => (
              <ConvRow key={c.id} c={c} agentParam={c.agentIds} agents={agents} focused={false} onOpen={() => onOpen(c)} />
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <div style={{ padding: '32px 18px', color: 'var(--sb-fg-faint)', fontSize: 11.5, textAlign: 'center' }}>
            <div className="marker" style={{ marginBottom: 8 }}>/// EMPTY</div>
            no sessions match this filter.
          </div>
        )}
      </div>
    </>
  );
}

function ConvRow({ c, agentParam, agents, focused, onOpen }) {
  return (
    <div className={`conv-row ${focused ? 'focused' : ''}`} onClick={onOpen}>
      <ConvAvatar kind={c.kind} agent={agentParam} agents={agents} />
      <div style={{ minWidth: 0 }}>
        <div className="conv-name">
          {c.label}
          {c.unread && <span className="status-dot unread" />}
        </div>
        <div className="conv-preview">{c.last}</div>
      </div>
      <div className="conv-meta">
        <span className="conv-time">{c.time}</span>
        {c.status === 'live'
          ? <span className={`status-dot live ${c.pulsing ? 'pulsing' : ''}`} />
          : <span className="status-dot archived" />}
      </div>
    </div>
  );
}

// Render markdown text safely. marked + DOMPurify both come from CDN scripts in
// Squadron.html — fall back to plaintext if either isn't available yet.
//
// Side feature: any code span ending in a recognized file extension becomes a
// clickable file-link, even when wrapped in URL/path noise the agent writes.
// We strip the noise and hand the App a resolvable name; handleOpenVaultFile
// suffix-matches against the agent's vaultFiles list.
const FILE_EXT_RE =
  /\.(md|markdown|html?|json|ya?ml|toml|txt|jpe?g|png|gif|webp|svg|mp4|webm|mov|mp3|wav|pdf|css|jsx?|tsx?|py|rs|go|sh|sql)$/i;

function extractFilename(rawText) {
  // Strip trailing punctuation that's commonly mis-included in code spans.
  let s = rawText.trim().replace(/[.,;:)\]}>'"`]+$/, '');
  if (!FILE_EXT_RE.test(s)) return null;
  // file:// URLs → drop the protocol; everything after vault/ is the rel path.
  s = s.replace(/^file:\/\//i, '');
  // http(s):// URLs → drop scheme + host[:port], keep the path.
  s = s.replace(/^https?:\/\/[^/]+/i, '');
  // Common Squadron prefix: …/agents/<UUID>/vault/<rel> — keep just <rel>.
  const vaultIdx = s.indexOf('/vault/');
  if (vaultIdx >= 0) s = s.slice(vaultIdx + '/vault/'.length);
  // If we still have an absolute filesystem path or a host-rooted path,
  // fall back to just the basename — handleOpenVaultFile suffix-matches.
  if (s.startsWith('/')) s = s.split('/').pop() || s;
  return s;
}

function markFileLinks(html) {
  // Auto-mark <code> spans whose contents resolve to a vault filename.
  return html.replace(
    /<code>([^<]+)<\/code>/g,
    (full, inner) => {
      const text = inner.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const filename = extractFilename(text);
      if (!filename) return full;
      const safe = filename.replace(/"/g, '&quot;');
      return `<code class="file-link" data-file="${safe}" title="open ${safe} in center panel">${inner}</code>`;
    }
  );
}

function MdBubble({ text, style, onOpenFile }) {
  const html = React.useMemo(() => {
    if (!text) return '';
    if (typeof window === 'undefined' || !window.marked || !window.DOMPurify) return null;
    const parsed = window.marked.parse(text, { gfm: true, breaks: true });
    const augmented = markFileLinks(parsed);
    return window.DOMPurify.sanitize(augmented, { ADD_ATTR: ['target', 'rel', 'class', 'data-file'] });
  }, [text]);

  if (html === null) {
    return <div className="bubble" style={style}>{text}</div>;
  }
  return (
    <div
      className="bubble md"
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        // 1. File-link code spans → open in center panel.
        const fl = e.target.closest && e.target.closest('code.file-link');
        if (fl && onOpenFile) {
          e.preventDefault();
          const f = fl.getAttribute('data-file');
          if (f) onOpenFile(f);
          return;
        }
        // 2. Regular external links → new tab.
        const a = e.target.closest && e.target.closest('a');
        if (a && a.href) { e.preventDefault(); window.open(a.href, '_blank', 'noopener,noreferrer'); }
      }}
    />
  );
}

// Typing-indicator row. Shown at the bottom of chat-body whenever the agent
// (or one of the inter-agent participants) is in `thinking` or `tool-running`.
function TypingDots({ name, state, color }) {
  const label = state === 'tool-running' ? 'using tools' : 'thinking';
  const accent = color || 'currentColor';
  return (
    <div className="msg them" style={{ animation: 'bubble-in 0.18s ease' }}>
      {name && <div className="who" style={{ color }}>{name}</div>}
      <div className="bubble" style={{
        display: 'inline-flex', gap: 6, alignItems: 'center',
        background: color ? color + '12' : undefined,
        borderColor: color ? color + '40' : undefined,
        opacity: 0.95,
      }}>
        <span style={{ fontSize: '0.85em', opacity: 0.75, marginRight: 2 }}>{label}</span>
        <span className="typing-dot" style={{ background: accent, animationDelay: '0s' }} />
        <span className="typing-dot" style={{ background: accent, animationDelay: '0.2s' }} />
        <span className="typing-dot" style={{ background: accent, animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

function ChatView({ conversation, agents, onBack, onSend, loopFlag, messages: realMessages, onOpenVaultFile }) {
  const [draft, setDraft] = useStateS('');
  const bodyRef = React.useRef(null);
  // Prefer real (daemon-streamed) messages if provided; fall back to mocked scrollback.
  const messages = (realMessages && realMessages.length > 0)
    ? realMessages
    : (window.SQ.mockChats[conversation.id] || [
        { who: 'system', side: 'sys', text: 'No messages yet. Say something — it will boot the agent.' },
      ]);

  // Auto-scroll to the latest message whenever the list grows, the last bubble's
  // text changes (streaming), the conversation switches, or the typing indicator
  // toggles (so users see "thinking…" appear without scrolling manually).
  const lastTextLen = messages.length > 0 ? (messages[messages.length - 1].text || '').length : 0;
  const cookingFingerprint = (() => {
    const cooking = new Set(['thinking', 'tool-running']);
    if (conversation.kind === 'user') {
      const ag = agents.find(a => a.id === conversation.agentId);
      return ag && cooking.has(ag.state) ? ag.state : '';
    }
    if (conversation.kind === 'inter' && Array.isArray(conversation.agentIds)) {
      return conversation.agentIds
        .map(id => agents.find(a => a.id === id))
        .filter(a => a && cooking.has(a.state))
        .map(a => a.id + ':' + a.state)
        .join(',');
    }
    return '';
  })();
  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastTextLen, conversation.id, cookingFingerprint]);

  const isInter = conversation.kind === 'inter';
  const showLoop = isInter && loopFlag && conversation.status === 'live';

  return (
    <>
      <div className="chat-head">
        <button className="chat-back" onClick={onBack}><I.arrowL /></button>
        <div className="chat-title">{conversation.label}</div>
        <div className="chat-sub">{conversation.status === 'live' ? '● live' : '◌ archived'}</div>
      </div>
      {showLoop && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(230,192,104,0.3)', background: 'rgba(230,192,104,0.06)', fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: '#e6c068', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚠ loop detector · turn budget 6/8 · auto-pause approaching
        </div>
      )}
      {conversation.status === 'archived' && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--sb-line-soft)', fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: 'var(--sb-fg-faint)', letterSpacing: '0.04em' }}>
          /// archived · agents no longer adjacent · read-only
        </div>
      )}
      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => {
          // Filter empty 'them' bubbles. These are legacy rows persisted before
          // the daemon started skipping tool-only turns; rendering them creates
          // ghost messages in the user's DM with no content.
          if (m.side === 'them' && (!m.text || !m.text.trim())) return null;
          if (m.side === 'sys') return (
            <div key={i} className="msg system">
              <div className="bubble">/// {m.text}</div>
              {m.createdAt && (
                <div className="ts" style={{
                  fontFamily: 'var(--sb-font-mono)', fontSize: 9.5, letterSpacing: '0.04em',
                  color: 'var(--sb-fg-faint)', marginTop: 2,
                }}>{window.SQ && window.SQ.fmtClock ? window.SQ.fmtClock(m.createdAt) : ''}</div>
              )}
            </div>
          );

          // Resolve the speaking agent (for color tint + inter-agent L/R alignment).
          const speaker = m.side === 'them' && m.who
            ? agents.find(a => a.name === m.who)
            : null;
          const color = speaker?.color || null;

          // For inter-agent (2-agent) chats: agentIds[0] = left, agentIds[1] = right.
          // 'you' (the human) always renders right (existing behavior).
          let alignSide = m.side; // 'you' | 'them'
          if (isInter && m.side === 'them' && Array.isArray(conversation.agentIds) && conversation.agentIds.length === 2 && speaker) {
            alignSide = speaker.id === conversation.agentIds[1] ? 'right' : 'left';
          }

          // Tint the bubble with the agent's color when known. 'you' keeps its
          // brand-red treatment from the existing CSS class.
          const bubbleStyle = (m.side === 'them' && color)
            ? { background: color + '0F', borderColor: color + '30' }
            : undefined;

          const cls = alignSide === 'right' || alignSide === 'left'
            ? 'msg them'
            : `msg ${m.side}`;
          // Inline right-alignment so we don't need new CSS classes in Squadron.html.
          const rowStyle = alignSide === 'right'
            ? { alignSelf: 'flex-end', textAlign: 'right' }
            : undefined;

          return (
            <div key={i} className={cls} style={rowStyle}>
              <div className="who" style={color ? { color } : undefined}>
                {m.who}
                {m.createdAt && (
                  <span style={{
                    marginLeft: 8, fontFamily: 'var(--sb-font-mono)', fontSize: 9.5,
                    letterSpacing: '0.04em', color: 'var(--sb-fg-faint)', fontWeight: 'normal',
                  }}>{window.SQ && window.SQ.fmtClock ? window.SQ.fmtClock(m.createdAt) : ''}</span>
                )}
              </div>
              <MdBubble
                text={m.text}
                style={bubbleStyle}
                onOpenFile={(filename) => {
                  if (!onOpenVaultFile) return;
                  // Resolve which agent's vault the file belongs to:
                  // - user chat → conversation.agentId
                  // - inter-agent chat → the speaker (m.who) by name
                  let aid = conversation.agentId;
                  if (!aid && conversation.kind === 'inter') {
                    const sp = agents.find(a => a.name === m.who);
                    aid = sp ? sp.id : (conversation.agentIds && conversation.agentIds[0]);
                  }
                  if (aid) onOpenVaultFile(aid, filename);
                }}
              />
            </div>
          );
        })}
        {(() => {
          // Typing-indicator: renders when the chat's agent (or any inter-agent
          // participant) is currently cooking. Pure render — driven by the live
          // agent.state field which the daemon broadcasts as it changes.
          const cookingStates = new Set(['thinking', 'tool-running']);
          if (conversation.kind === 'user') {
            const ag = agents.find(a => a.id === conversation.agentId);
            if (!ag || !cookingStates.has(ag.state)) return null;
            return <TypingDots key="typing" name={ag.name} state={ag.state} color={ag.color} />;
          }
          if (conversation.kind === 'inter' && Array.isArray(conversation.agentIds)) {
            const cooking = conversation.agentIds
              .map(id => agents.find(a => a.id === id))
              .filter(a => a && cookingStates.has(a.state));
            if (cooking.length === 0) return null;
            return cooking.map(ag => (
              <TypingDots key={'typing-' + ag.id} name={ag.name} state={ag.state} color={ag.color} />
            ));
          }
          return null;
        })()}
      </div>
      <div className="composer">
        <textarea
          placeholder={conversation.status === 'archived' ? 'archived — read only' : (isInter ? 'drop into the channel as a third participant…' : 'message ' + conversation.label.split(' ')[0].toLowerCase() + '…')}
          disabled={conversation.status === 'archived'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (draft.trim()) { onSend(draft); setDraft(''); } } }}
          rows={1}
        />
        <button className="send" disabled={conversation.status === 'archived' || !draft.trim()} onClick={() => { if (draft.trim()) { onSend(draft); setDraft(''); } }}>
          send
        </button>
      </div>
    </>
  );
}

// ---------- Force-directed memory graph (Obsidian-flavored) ----------
// Light continuous force simulation in normalized [0,100] coords. Repulsion +
// springs + weak center-pull, runs on rAF with high damping so it settles fast.
// Drag a node to grab/move it. Click to open the file in the center-tab editor.
//
// Props:
//   nodeColors        optional { [filename]: '#hex' } — per-node override colors
//   expandedView      if true: render bigger labels + spread layout for the center-tab variant
//   onBackgroundClick optional () => void — fired on click of empty space (no node, no pan-drag).
//                     Used by the sidebar variant to expand into a center-tab.
//   onNodeContextMenu optional (file, screenX, screenY) => void — right-click on a node
// Heuristic file-kind classifier for memory graph styling. Maps a vault path
// to one of the kinds the May 2026 redesign tokens cover. Per the Karpathy
// LLM-Wiki default seed structure (index.md / log.md / entities/ / concepts/ /
// sources/ / synthesis/ / raw/documents/ / raw/assets/ / skills/).
function classifyFileKind(file) {
  if (!file) return 'doc';
  const f = file.toLowerCase();
  const base = f.split('/').pop() || f;
  if (base === 'index.md' || base === 'index') return 'index';
  if (base === 'log.md' || base === 'log') return 'log';
  if (base === 'skills.md') return 'hub';
  if (base === 'identity.md') return 'hub';
  if (f.startsWith('skills/'))     return 'skill';
  if (f.startsWith('entities/'))   return 'entity';
  if (f.startsWith('concepts/'))   return 'concept';
  if (f.startsWith('sources/'))    return 'source';
  if (f.startsWith('synthesis/'))  return 'synthesis';
  if (f.startsWith('raw/assets/')) return 'asset';
  if (f.startsWith('raw/'))        return 'doc';
  // Anything else: treat as a hub (a top-level file linking out to others).
  if (!f.includes('/')) return 'hub';
  return 'doc';
}

// Render-friendly radius per kind, in the SVG coord system used by MemoryGraph.
function radiusForKind(kind, expandedView) {
  const scale = expandedView ? 1 : 0.85;
  const r = ({ index: 4.5, hub: 3.4, entity: 3.4 })[kind] || 2.4;
  return r * scale;
}

// Compute effective node colors with graph-traversal inheritance:
//   1. Manually-colored files keep their color (no traversal needed).
//   2. Other files BFS backwards through incoming wikilinks; if any ancestor
//      has a manual color, the file inherits the closest one (BFS depth wins).
//   3. Files with no manually-colored ancestor fall back to the agent's color.
// Returns a Map<file, color>.
function computeEffectiveColors(files, vaultEdges, manualColors, agentColor) {
  const result = new Map();
  // index incoming edges: child -> [parents...]
  const incoming = new Map();
  for (const [from, to] of vaultEdges) {
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to).push(from);
  }
  for (const f of files) {
    if (manualColors[f]) { result.set(f, manualColors[f]); continue; }
    // BFS up
    const seen = new Set([f]);
    const queue = [...(incoming.get(f) || [])];
    let found = null;
    while (queue.length) {
      const cur = queue.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (manualColors[cur]) { found = manualColors[cur]; break; }
      const parents = incoming.get(cur) || [];
      for (const p of parents) if (!seen.has(p)) queue.push(p);
    }
    result.set(f, found || agentColor);
  }
  return result;
}

function MemoryGraph({ agent, onOpenFile, nodeColors, expandedView, onBackgroundClick, onNodeContextMenu }) {
  const files = agent.vaultFiles || [];
  const colorOverrides = nodeColors || {};

  const vaultEdges = agent.vaultEdges || [];

  const { nodes, edges } = React.useMemo(() => {
    // id is the full path (stable, used for edge resolution + open-file).
    // label is just the basename so subdir entries don't blow out the graph.
    const ns = files.map(f => {
      const stem = f.replace(/\.md$/, '');
      const label = stem.split('/').pop();
      return { id: stem, label, file: f, fullPath: stem };
    });
    if (ns.length === 0) ns.push({ id: 'index', label: 'index', file: 'index.md' });
    const fileToId = new Map();
    ns.forEach(n => fileToId.set(n.file, n.id));

    // Prefer real wikilink edges from the daemon. Fall back to a radial layout
    // (index → others) only when the vault has no parsed links — otherwise
    // a rich vault with a few unlinked files would still get phantom radii.
    const realEdges = [];
    for (const [from, to] of vaultEdges) {
      const a = fileToId.get(from);
      const b = fileToId.get(to);
      if (a && b && a !== b) realEdges.push([a, b]);
    }

    let es;
    if (realEdges.length > 0) {
      es = realEdges;
    } else {
      es = [];
      const indexId = ns.find(n => n.id === 'index')?.id;
      if (indexId) {
        for (const n of ns) if (n.id !== indexId) es.push([indexId, n.id]);
      }
    }
    return { nodes: ns, edges: es };
  }, [files.join('|'), vaultEdges.map(e => e[0] + '>' + e[1]).join('|')]);

  // Sim state lives in a ref (mutated each frame) — never stored in React state to avoid
  // re-render thrash. We bump `tickRender` to trigger renders.
  const simRef = React.useRef({});
  const [tickRender, setTickRender] = React.useState(0);
  const [hoverId, setHoverId] = React.useState(null);
  const [dragState, setDragState] = React.useState(null); // { id }
  const svgRef = React.useRef(null);
  // View pan (in normalized [0,100] units, applied as a translate to the inner <g>).
  // Empty-space drag pans the view; click without movement triggers onBackgroundClick.
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [bgDrag, setBgDrag] = React.useState(false);

  // Mirror pan/zoom into refs so the native wheel handler (registered with
  // { passive: false }) reads up-to-date values without re-binding every state change.
  const panRef = React.useRef(pan);
  const zoomRef = React.useRef(zoom);
  React.useEffect(() => { panRef.current = pan; }, [pan]);
  React.useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Sync sim entries with the current node set (preserve positions on file add/remove).
  React.useEffect(() => {
    const cur = simRef.current;
    const next = {};
    nodes.forEach((n) => {
      const existing = cur[n.id];
      if (existing) {
        next[n.id] = existing;
      } else {
        // New node: scatter randomly inside the playable area. Random scatter
        // lets the simulation untangle naturally for any N — a tight ring of
        // 30+ nodes overlaps so badly the sim spends seconds escaping itself.
        next[n.id] = {
          x: 15 + Math.random() * 70,
          y: 15 + Math.random() * 70,
          vx: 0, vy: 0,
        };
      }
    });
    simRef.current = next;
  }, [nodes.map(n => n.id).join('|')]);

  // Animation loop.
  React.useEffect(() => {
    let raf;
    // Constants that scale with node count. The original tuning assumed ~10
    // nodes; at 30+ the per-pair repulsion and per-edge springs dominate and
    // nodes ricochet off the bounds. These curves keep the layout legible
    // from 1 file up to ~80.
    const N = Math.max(1, nodes.length);
    const REPEL = Math.max(50, 100 + 1300 / N);   // softer per-pair as N grows
    const SPRING = N > 25 ? 0.025 : 0.04;          // gentler edges in dense graphs
    const REST = N > 25 ? 14 : 22;                 // tighter rest length when crowded
    const DAMP = 0.82;
    const CENTER_PULL = 0.005 + 0.0004 * N;        // stronger gravity helps with crowding
    const BOUND_MARGIN = 6;                         // start pushing back inside this band
    const BOUND_K = 0.12;                           // restoring force strength
    const VMAX = 2.5;                               // per-frame velocity cap (prevents jitter)

    const step = () => {
      const sim = simRef.current;
      // Pairwise repulsion
      for (let i = 0; i < nodes.length; i++) {
        const a = sim[nodes[i].id]; if (!a) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = sim[nodes[j].id]; if (!b) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(d2);
          const f = REPEL / d2;
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      // Springs (edges)
      for (const [aId, bId] of edges) {
        const a = sim[aId], b = sim[bId];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = (dist - REST) * SPRING;
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Pull toward center
      for (const id in sim) {
        const n = sim[id];
        n.vx += (50 - n.x) * CENTER_PULL;
        n.vy += (50 - n.y) * CENTER_PULL;
      }
      // Soft bounds: a restoring force when inside the margin, instead of a
      // hard clamp + zero-velocity wall (which causes the ricochet jitter).
      for (const id in sim) {
        const n = sim[id];
        if (n.x < BOUND_MARGIN)        n.vx += (BOUND_MARGIN - n.x) * BOUND_K;
        if (n.x > 100 - BOUND_MARGIN)  n.vx -= (n.x - (100 - BOUND_MARGIN)) * BOUND_K;
        if (n.y < BOUND_MARGIN)        n.vy += (BOUND_MARGIN - n.y) * BOUND_K;
        if (n.y > 100 - BOUND_MARGIN)  n.vy -= (n.y - (100 - BOUND_MARGIN)) * BOUND_K;
      }
      // Integrate (skip the dragged node) with velocity cap to kill ringing.
      const draggedId = dragState && dragState.id;
      for (const id in sim) {
        if (id === draggedId) continue;
        const n = sim[id];
        n.vx *= DAMP; n.vy *= DAMP;
        if (n.vx >  VMAX) n.vx =  VMAX;
        if (n.vx < -VMAX) n.vx = -VMAX;
        if (n.vy >  VMAX) n.vy =  VMAX;
        if (n.vy < -VMAX) n.vy = -VMAX;
        n.x += n.vx; n.y += n.vy;
      }
      setTickRender(t => (t + 1) % 1000000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, dragState]);

  // Convert client (px) → simulation coords. Uses getScreenCTM so we honor
  // preserveAspectRatio="xMidYMid meet" letterboxing exactly (a naive width/height
  // ratio gives a different mapping when the SVG is non-square — that's the
  // "drag is offset from cursor" symptom). Then undo pan and zoom so the
  // node lands precisely under the cursor in inner-<g> coords.
  const svgToNormalized = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const ctm = svg.getScreenCTM && svg.getScreenCTM();
    if (!ctm) {
      const r = svg.getBoundingClientRect();
      return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const z = zoomRef.current || 1;
    return { x: (local.x - panRef.current.x) / z, y: (local.y - panRef.current.y) / z };
  };

  // Wheel-to-zoom around the cursor. Native listener with passive: false so we
  // can preventDefault and not bubble the wheel into the right-sidebar scroll.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const ctm = svg.getScreenCTM && svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      const curPan = panRef.current;
      const curZoom = zoomRef.current || 1;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newZoom = Math.max(0.4, Math.min(4, curZoom * factor));
      // Anchor: the logical point under the cursor stays under the cursor.
      const logicalX = (local.x - curPan.x) / curZoom;
      const logicalY = (local.y - curPan.y) / curZoom;
      const newPanX = local.x - logicalX * newZoom;
      const newPanY = local.y - logicalY * newZoom;
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Drag handlers (declared outside JSX for clarity). Tracks ONE node at a time.
  // The handler distinguishes click-vs-drag itself: if the mouse moved more
  // than the threshold between down and up, the node was dragged and the
  // file should NOT open. If movement stayed under threshold, it's a click —
  // fire onOpenFile from the up handler. The synthetic React `onClick` is
  // removed from the <g> below so we don't double-fire.
  const onMouseDownNode = (id, e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    setDragState({ id });
    const moveHandler = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && (dx * dx + dy * dy) > 9) moved = true;
      if (moved) {
        const { x, y } = svgToNormalized(ev.clientX, ev.clientY);
        const n = simRef.current[id];
        if (n) { n.x = x; n.y = y; n.vx = 0; n.vy = 0; }
      }
    };
    const upHandler = () => {
      setDragState(null);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
      if (!moved && onOpenFile) {
        const node = nodes.find(n => n.id === id);
        if (node) onOpenFile(agent.id, node.file);
      }
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  // Pan/click handler for the SVG background (fires on empty space — node groups
  // stop propagation in onMouseDownNode). If movement stays under threshold, treat
  // as a click and fire onBackgroundClick. Otherwise it's a pan.
  const onSvgMouseDown = (e) => {
    if (e.button !== 0) return;
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const meet = Math.min(r.width, r.height);  // matches xMidYMid meet scale
    const startX = e.clientX, startY = e.clientY;
    const startPan = pan;
    let moved = false;
    setBgDrag(true);
    const moveHandler = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && (dx * dx + dy * dy) > 9) moved = true;
      setPan({
        x: startPan.x + (dx / meet) * 100,
        y: startPan.y + (dy / meet) * 100,
      });
    };
    const upHandler = () => {
      setBgDrag(false);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
      if (!moved && onBackgroundClick) onBackgroundClick();
    };
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(1); };

  const sim = simRef.current;
  const accent = agent.color || 'rgba(127,182,217,0.65)';
  // Inherited color per file — manually-set takes precedence; otherwise BFS
  // upstream through wikilinks to the nearest manually-colored ancestor.
  const effectiveColors = React.useMemo(
    () => computeEffectiveColors(files, vaultEdges, colorOverrides, accent),
    [files.join('|'), vaultEdges.map(e => e[0] + '>' + e[1]).join('|'), JSON.stringify(colorOverrides), accent]
  );

  return (
    <div className="memory-graph" style={{
      position: 'relative',
      // In expanded (center-tab) view we live inside a flex column and need to
      // fill it. In the sidebar we leave the CSS class default (height: 200px)
      // alone — overriding it would collapse the panel-body-sticky chrome.
      ...(expandedView ? { width: '100%', height: '100%' } : {}),
    }}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%', height: '100%', display: 'block',
          cursor: bgDrag ? 'grabbing' : (onBackgroundClick ? 'pointer' : 'grab'),
        }}
        onMouseDown={onSvgMouseDown}
      >
       <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
        {/* edges */}
        {edges.map(([aId, bId], i) => {
          const a = sim[aId]; const b = sim[bId];
          if (!a || !b) return null;
          return (
            <line key={'e' + i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={0.4}
            />
          );
        })}
        {/* nodes */}
        {nodes.map(n => {
          const p = sim[n.id];
          if (!p) return null;
          const isHover = hoverId === n.id;
          const isDragging = dragState && dragState.id === n.id;
          const nodeColor = effectiveColors.get(n.file) || colorOverrides[n.file] || accent;
          // Radius varies by file kind — index biggest, hub/entity medium,
          // everything else small. Hover bumps the node up by a fixed delta.
          const kind = classifyFileKind(n.file);
          const baseR = radiusForKind(kind, expandedView);
          const hoverR = baseR + (expandedView ? 0.6 : 0.5);
          const labelSize = expandedView ? 2.2 : 2.6;
          const labelY = expandedView ? (baseR + labelSize + 0.6) : (baseR + 3);
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`}
               style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
               onMouseDown={(e) => onMouseDownNode(n.id, e)}
               onMouseEnter={() => setHoverId(n.id)}
               onMouseLeave={() => setHoverId(prev => (prev === n.id ? null : prev))}
               onContextMenu={(e) => {
                 // Always preventDefault — even when no handler is wired,
                 // the browser's native menu over a graph node is wrong.
                 e.preventDefault();
                 e.stopPropagation();
                 if (onNodeContextMenu) onNodeContextMenu(n.file, e.clientX, e.clientY);
               }}
            >
              <circle r={isHover ? hoverR : baseR} fill={nodeColor} stroke="#fff" strokeWidth={isHover ? 0.5 : 0.2} />
              <text
                x={0} y={labelY}
                textAnchor="middle"
                fontSize={labelSize}
                fontFamily="var(--sb-font-mono)"
                fill={isHover ? 'var(--sb-fg)' : 'var(--sb-fg-muted)'}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >{n.label}</text>
            </g>
          );
        })}
       </g>
      </svg>
      {(Math.abs(pan.x) > 0.001 || Math.abs(pan.y) > 0.001 || Math.abs(zoom - 1) > 0.001) && (
        <button
          onClick={(e) => { e.stopPropagation(); resetView(); }}
          style={{
            position: 'absolute', right: 8, top: 6, zIndex: 2,
            fontFamily: 'var(--sb-font-mono)', fontSize: 9.5, padding: '2px 6px',
            background: 'rgba(10,10,10,0.85)', color: 'var(--sb-fg-muted)',
            border: '1px solid var(--sb-line)', borderRadius: 3, cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
          title="recenter + reset zoom"
        >⌖ {Math.abs(zoom - 1) > 0.001 ? `${zoom.toFixed(1)}×` : 'center'}</button>
      )}
      <div style={{
        position: 'absolute', left: 8, bottom: 6,
        fontFamily: 'var(--sb-font-mono)', fontSize: 9.5, color: 'var(--sb-fg-disabled)', letterSpacing: '0.06em',
        pointerEvents: 'none',
      }}>
        {expandedView ? 'drag node · drag bg · scroll = zoom · right-click node = color' : 'drag node · drag bg · scroll = zoom · click bg to expand'}
      </div>
    </div>
  );
}

// ---------- RIGHT: agent config + memory graph ----------

const GLYPH_QUICKPICKS = ['◇','◆','●','○','■','▲','★','✦','✧','♪','◯','☼','☽','🜂','☿','ᚱ','♆','♥','✺','⌬'];

const EMOJI_QUICKPICKS = [
  // faces / vibes
  '🤖','👾','🧠','😀','😎','🤠','🥷','🧙','🧚','🧛','🧜','🧝','🦸','🦹','👹','👺','👻','💀','☠️','👽',
  // body / motion
  '🦾','🦿','🤘','✌️','👊','🫶','💪','🫦','👁️','🦴','🫀','🦷','🦠',
  // creatures
  '🦊','🐺','🦅','🦉','🐉','🐢','🐧','🦋','🐝','🦕','🦖','🐙','🦑','🦀','🐡','🐠','🐳','🦈','🦇','🦄',
  '🐝','🐞','🦂','🕷️','🐍','🦎','🦖','🦝','🐈','🐈‍⬛','🐕','🦮','🐇','🐿️','🦔','🦫','🐦','🦜','🦤','🦩',
  // celestial / weather
  '🌙','☀️','⭐','🌟','✨','⚡','🔥','❄️','☄️','🌌','🪐','🛰️','🛸','🚀','🌠','☁️','🌧️','🌪️','🌈','💫',
  // nature / plants
  '🌿','🍃','🌱','🌳','🌲','🌴','🌵','🌷','🌸','🌼','🌻','🌺','🍀','🍁','🍂','🌾','🪴','🌊','🗻','🏔️',
  // gems / objects
  '💎','🔮','💠','🔷','🔶','🟣','🟠','🟢','🔵','🟡','🔴','⚫','⚪','🟤','🪞','🪨','💿','📀','🧿','🪬',
  // tools / weapons
  '⚙️','🛠️','🔧','🔨','⚒️','🪛','🪚','🗡️','⚔️','🛡️','🏹','🔫','🪓','🔩','⛓️','🧲','🪝','📐','📏','🧰',
  // tech / signal
  '📡','🛰️','💡','🔋','🪫','🔌','🖥️','⌨️','🖱️','🎙️','📟','📠','📺','📻','💾','📀','🎛️','🎚️','🪪','🔭',
  // marks / arrows / status
  '✅','❌','⛔','🚫','✔️','🔆','🔅','♻️','⚜️','☢️','☣️','⚛️','🕳️','🎯','🪧','🚩','🏁','🏳️','🏴','🎌',
  // arts / fun
  '🎨','🎭','🎪','🎲','🎰','🎮','🃏','🀄','♠️','♥️','♦️','♣️','🎼','🎵','🎶','🎤','🎧','🥁','🎷','🎺',
  // sports / activity
  '🏀','⚽','🏈','⚾','🎾','🥏','🥊','🥋','🎯','🪁','🪂','⛷️','🏂','🛹','🛼','🤺','🏇','🏆','🥇','🎽',
  // food / brew
  '☕','🍵','🍺','🍻','🥃','🍷','🍶','🥂','🧊','🍓','🍇','🍒','🍑','🥭','🍌','🍎','🥑','🌶️','🍯','🍩',
];

const photoKey = (id) => 'sq.agentPhoto.' + id;
function loadAgentPhoto(agentId) {
  if (!agentId) return null;
  try { return localStorage.getItem(photoKey(agentId)); } catch { return null; }
}
function saveAgentPhoto(agentId, dataUrl) {
  if (!agentId) return;
  try {
    if (dataUrl) localStorage.setItem(photoKey(agentId), dataUrl);
    else localStorage.removeItem(photoKey(agentId));
  } catch {}
}
// Resize to 96×96 JPEG on upload — keeps localStorage budget reasonable across
// many agents and avoids shipping multi-megabyte data URLs around.
function readPhotoFile(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 96;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => callback(null);
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ---------- Skills section in the agent config (right sidebar) ----------
function SkillsSection({ agent, onInstallSkill, onUninstallSkill }) {
  const [query, setQuery] = React.useState('');
  const [urlInput, setUrlInput] = React.useState('');
  const [urlBusy, setUrlBusy] = React.useState(false);
  const [urlError, setUrlError] = React.useState('');
  const starter = (window.SQ && window.SQ.STARTER_SKILLS) || [];

  const installed = React.useMemo(() => {
    const files = agent.vaultFiles || [];
    return files
      .filter(f => f.startsWith('skills/') && f.endsWith('.md'))
      .map(f => ({ name: f.replace(/^skills\//, '').replace(/\.md$/, ''), path: f }));
  }, [(agent.vaultFiles || []).join('|')]);

  const installedNames = new Set(installed.map(s => s.name.toLowerCase()));
  const q = query.trim().toLowerCase();
  const matches = q
    ? starter.filter(s =>
        !installedNames.has(s.id.toLowerCase()) &&
        (s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)))
    : [];

  const onUrlAdd = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlError('');
    if (!/^https?:\/\//i.test(url)) { setUrlError('must be a full http(s) URL'); return; }
    setUrlBusy(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      // Derive a name from the URL (last path segment, minus .md).
      const last = url.split('/').pop() || 'skill';
      const name = last.replace(/\.md$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 64) || 'skill';
      onInstallSkill(name, text);
      setUrlInput('');
    } catch (e) {
      setUrlError('fetch failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUrlBusy(false);
    }
  };

  return (
    <div className="field">
      <label>skills</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Installed list */}
        {installed.length > 0 ? (
          <div style={{
            border: '1px solid var(--sb-line)', borderRadius: 4, padding: '6px 8px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {installed.map(s => (
              <div key={s.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--sb-font-mono)', fontSize: 11,
              }}>
                <span style={{ flex: 1, color: 'var(--sb-fg)' }}>{s.name}</span>
                <button
                  onClick={() => onUninstallSkill(s.name)}
                  title={'uninstall ' + s.name}
                  style={{
                    background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 3,
                    color: 'var(--sb-fg-faint)', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
                    padding: '2px 8px', cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                >remove</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            fontFamily: 'var(--sb-font-mono)', fontSize: 10.5,
            color: 'var(--sb-fg-faint)', padding: '4px 0',
          }}>no skills installed — search below to add some</div>
        )}

        {/* Search */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search starter skills…"
          style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 11 }}
        />

        {/* Search results */}
        {matches.length > 0 && (
          <div style={{
            border: '1px solid var(--sb-line)', borderRadius: 4,
            display: 'flex', flexDirection: 'column',
            maxHeight: 220, overflowY: 'auto',
          }}>
            {matches.map(s => (
              <div key={s.id} style={{
                padding: '6px 8px', borderBottom: '1px solid var(--sb-line-soft)',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg)' }}>{s.name}</span>
                  <button
                    onClick={() => onInstallSkill(s.id, s.content)}
                    style={{
                      background: 'rgba(127,182,217,0.10)', border: '1px solid rgba(127,182,217,0.45)', borderRadius: 3,
                      color: 'var(--sb-accent, #7fb6d9)', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
                      padding: '2px 9px', cursor: 'pointer', letterSpacing: '0.04em',
                    }}
                  >install</button>
                </div>
                <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-faint)', lineHeight: 1.45 }}>
                  {s.description}
                </div>
              </div>
            ))}
          </div>
        )}
        {q && matches.length === 0 && (
          <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: 'var(--sb-fg-faint)' }}>
            no starter skill matches "{query}". paste a raw URL below to install from anywhere.
          </div>
        )}

        {/* URL importer */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
            placeholder="raw URL (e.g. github raw .md)"
            style={{ flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 11 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !urlBusy) { e.preventDefault(); onUrlAdd(); } }}
          />
          <button
            disabled={urlBusy || !urlInput.trim()}
            onClick={onUrlAdd}
            style={{
              padding: '5px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
              background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 3,
              color: urlBusy ? 'var(--sb-fg-faint)' : 'var(--sb-fg-muted)',
              cursor: urlBusy || !urlInput.trim() ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
            }}
          >{urlBusy ? '…' : 'fetch'}</button>
        </div>
        {urlError && (
          <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: '#d93b25' }}>{urlError}</div>
        )}
      </div>
    </div>
  );
}

// Shared chrome row at the top of every right-sidebar panel. Renders a breadcrumb
// trail like `AGENTS › Mercury › PROFILE` so the user always knows what surface
// they're looking at and how to back out. Per the May 2026 redesign brief — the
// three panels (AgentConfig / ProfileEditor / MemoryGraphFilesPanel) all wear
// this same crumb row to feel like one shell at different depths.
function CrumbRow({ crumbs, escHint }) {
  return (
    <div style={{
      height: 26, flexShrink: 0,
      borderBottom: '1px solid var(--sb-line-soft)',
      background: 'rgba(0,0,0,0.4)',
      padding: '0 16px',
      display: 'flex', alignItems: 'center',
      fontFamily: 'var(--sb-font-mono)', fontSize: 10, letterSpacing: '0.06em',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: 'var(--sb-fg-disabled)' }}>›</span>}
            <span style={{
              color: i === crumbs.length - 1 ? 'var(--sb-fg-muted)' : 'var(--sb-fg-faint)',
              textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {escHint && (
        <span style={{ color: 'var(--sb-fg-disabled)', flexShrink: 0, marginLeft: 8 }}>{escHint}</span>
      )}
    </div>
  );
}

// Shared panel header: 40×40 colored glyph block on the left, display-font
// title + faint mono subtitle on the right. Per the May 2026 redesign spec —
// every right-sidebar panel uses this shape so navigating between them feels
// like one shell at different depths.
function PanelHeader({ glyph, glyphMono, accent, title, subtitle, action }) {
  const a = accent || 'var(--sb-fg-muted)';
  return (
    <div style={{
      padding: '14px 16px 12px',
      borderBottom: '1px solid var(--sb-line-soft)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 4, flexShrink: 0,
        background: `color-mix(in srgb, ${a} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${a} 38%, transparent)`,
        color: a,
        fontFamily: glyphMono ? 'var(--sb-font-mono)' : 'var(--sb-font-display)',
        fontWeight: glyphMono ? 600 : 500,
        fontSize: glyphMono ? 12 : 22,
        letterSpacing: glyphMono ? '0.04em' : '-0.01em',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textTransform: glyphMono ? 'uppercase' : undefined,
      }}>{glyph}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--sb-font-display)', fontSize: 18,
          letterSpacing: '-0.01em', color: 'var(--sb-fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: 'var(--sb-font-mono)', fontSize: 11.5,
            color: 'var(--sb-fg-faint)', letterSpacing: '0.04em',
            marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</div>
        )}
      </div>
      {action}
    </div>
  );
}

function AgentConfig({ agent, onChange, onOpenFile, onOpenMemoryGraph, nodeColors = {}, connections = [], openWizard, onInstallSkill, onUninstallSkill }) {
  const [profileMode, setProfileMode] = React.useState(false);
  const [photo, setPhoto] = React.useState(() => loadAgentPhoto(agent && agent.id));
  React.useEffect(() => {
    setProfileMode(false);
    setPhoto(loadAgentPhoto(agent && agent.id));
  }, [agent && agent.id]);
  // Local draft state for typing-heavy fields. Committed to the daemon on blur or
  // Enter (whichever fires first). Reset when the focused agent changes so we
  // don't carry stale drafts across selections.
  const [draftName, setDraftName] = React.useState('');
  const [draftSys, setDraftSys] = React.useState('');
  const [draftGlyph, setDraftGlyph] = React.useState('');
  const [draftHex, setDraftHex] = React.useState('');

  React.useEffect(() => {
    if (!agent) return;
    setDraftName(agent.name || '');
    setDraftSys(agent.sysPrompt || '');
    setDraftGlyph(agent.glyph || '');
    setDraftHex(agent.color || '');
    // intentionally only on agent.id change — we don't want a daemon broadcast
    // mid-edit to overwrite what the user is typing
  }, [agent && agent.id]);

  if (!agent) {
    return (
      <div className="empty-state">
        <div className="marker-x">/// NO SELECTION</div>
        <div className="ttl">click an agent on the grid to configure</div>
      </div>
    );
  }

  const commitName = () => {
    if (draftName !== agent.name && draftName.trim()) onChange({ ...agent, name: draftName.trim() });
  };
  const commitSys = () => {
    if (draftSys !== (agent.sysPrompt || '')) onChange({ ...agent, sysPrompt: draftSys });
  };
  const commitGlyph = () => {
    if (draftGlyph !== agent.glyph && draftGlyph.length > 0) onChange({ ...agent, glyph: draftGlyph });
  };
  const commitHex = () => {
    if (draftHex !== agent.color && /^#[0-9a-fA-F]{6}$/.test(draftHex)) {
      onChange({ ...agent, color: draftHex });
    } else if (draftHex !== agent.color) {
      // invalid hex — revert
      setDraftHex(agent.color || '');
    }
  };
  if (profileMode) {
    return (
      <div key="profile" style={{
        animation: 'panel-fade 120ms ease',
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%',
      }}>
        <ProfileEditor
          agent={agent}
          photo={photo}
          onPhotoChange={(dataUrl) => { saveAgentPhoto(agent.id, dataUrl); setPhoto(dataUrl); }}
          onChange={onChange}
          onBack={() => setProfileMode(false)}
        />
      </div>
    );
  }

  return (
    <>
      <CrumbRow crumbs={['agents', agent.name || 'unnamed']} />
      <PanelHeader
        glyph={agent.glyph || agent.name?.[0] || '?'}
        accent={agent.color}
        title={agent.name}
        subtitle={`agent · ${agent.id.slice(0, 8)}`}
      />
      <div className="panel-body">
        <div className="panel-body-scroll">

        {agent.status === 'Draft'
          ? <div className="draft-banner"><span className="status-dot archived" /> Draft · no LLM call yet</div>
          : <div className="live-banner"><span className="status-dot live pulsing" /> Live · subprocess attached</div>}

        <div className="agent-id">
          <button
            className="av"
            onClick={() => setProfileMode(true)}
            title="edit profile (symbol, emoji, photo)"
            style={{
              background: photo ? 'transparent' : agent.color,
              padding: 0, overflow: 'hidden',
              border: 'none', cursor: 'pointer',
            }}
          >
            {photo
              ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : agent.glyph}
          </button>
          <div>
            <div className="name">{agent.name}</div>
            <div className="pos">q={agent.q} · r={agent.r} · {agent.state}</div>
          </div>
        </div>

        <div className="field">
          <label>name</label>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); e.target.blur(); } }}
          />
        </div>
        <div className="field">
          <label>color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={agent.color || '#888888'}
              onChange={(e) => { setDraftHex(e.target.value); onChange({ ...agent, color: e.target.value }); }}
              style={{
                width: 36, height: 28, padding: 0, border: '1px solid var(--sb-line)',
                borderRadius: 4, background: 'transparent', cursor: 'pointer',
              }}
              title="pick agent color"
            />
            <input
              value={draftHex}
              onChange={(e) => setDraftHex(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex(); e.target.blur(); } }}
              placeholder="#rrggbb"
              style={{ flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
        <div className="field">
          <label>model</label>
          {(() => {
            // Locked once the agent has actually been instantiated — claude/codex
            // sessions can't change model mid-session, so the select would be a lie.
            const locked = agent.status !== 'Draft' || (agent.msgs && agent.msgs > 0);
            return (
              <>
                <select value={agent.model || ''} disabled={locked}
                  onChange={(e) => onChange({ ...agent, model: e.target.value })}
                  style={locked ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                  title={locked ? 'locked: model cannot change mid-session — kill and respawn to switch' : 'pick model'}>
                  <option value="">claude default · subscription (opus 4.7)</option>
                  <option value="claude-opus-4-7">claude-opus-4.7 · subscription</option>
                  <option value="claude-sonnet-4-6">claude-sonnet-4.6 · subscription</option>
                  <option value="claude-haiku-4-5">claude-haiku-4.5 · subscription</option>
                  <option value="codex-1">codex-1 · subscription</option>
                  <option value="codex-mini">codex-mini · subscription</option>
                </select>
                {locked && (
                  <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>
                    locked · session active. kill the agent and respawn to switch models.
                  </div>
                )}
              </>
            );
          })()}
        </div>
        <div className="field">
          <label>movement</label>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              fontFamily: 'var(--sb-font-mono)', fontSize: 12, color: 'var(--sb-fg-muted)',
              padding: '6px 8px', border: '1px solid var(--sb-line)', borderRadius: 4,
              userSelect: 'none',
            }}
            title="when on, this agent can call move_toward(name) to walk across the grid"
          >
            <input
              type="checkbox"
              checked={!!agent.movementEnabled}
              onChange={(e) => onChange({ ...agent, movementEnabled: e.target.checked })}
              style={{ accentColor: 'var(--sb-accent, #7fb6d9)' }}
            />
            <span style={{ flex: 1 }}>
              {agent.movementEnabled ? 'enabled · agent can walk' : 'disabled · agent stays put'}
            </span>
          </label>
        </div>
        <SkillsSection
          agent={agent}
          onInstallSkill={(name, content) => onInstallSkill && onInstallSkill(agent.id, name, content)}
          onUninstallSkill={(name) => onUninstallSkill && onUninstallSkill(agent.id, name)}
        />
        <div className="field">
          <label>working directory</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input readOnly value={`~/.hexagent/agents/${agent.id}/vault/`} style={{ flex: 1 }} />
            {/* Disabled until M-Workdir lands — daemon currently always runs
                agents in their vault dir regardless of this field. */}
            <button
              disabled
              title="custom workdirs not wired yet — agents always run in their vault (M-Workdir milestone)"
              style={{
                padding: '6px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 11,
                background: 'transparent', border: '1px solid var(--sb-line-soft)', borderRadius: 4,
                color: 'var(--sb-fg-disabled)', cursor: 'not-allowed', letterSpacing: '0.04em',
              }}
            >change</button>
          </div>
          <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>
            daemon-fixed · agents always run in their vault
          </div>
        </div>

        <div className="telemetry">
          <div className="cell"><div className="lbl">status</div><div className="val">{agent.status === 'Draft' ? 'draft' : agent.state}</div></div>
          <div className="cell"><div className="lbl">last</div><div className="val">{agent.lastAt || '—'}</div></div>
          <div className="cell"><div className="lbl">messages</div><div className="val">{agent.msgs ?? 0}</div></div>
          <div className="cell"><div className="lbl">tool calls</div><div className="val">{agent.tools ?? 0}</div></div>
        </div>

        </div>

        <div className="panel-body-sticky">
        <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>/// MEMORY GRAPH · {agent.vault}/</span>
          <span style={{ flex: 1 }} />
          {onOpenMemoryGraph && (
            <button
              onClick={() => onOpenMemoryGraph(agent.id)}
              title="expand to center tab — edit node colors"
              style={{
                background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 3,
                color: 'var(--sb-fg-muted)', fontFamily: 'var(--sb-font-mono)', fontSize: 9,
                padding: '2px 6px', cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >⤢ expand</button>
          )}
        </div>
        <MemoryGraph
          agent={agent}
          onOpenFile={onOpenFile}
          nodeColors={nodeColors[agent.id]}
          onBackgroundClick={onOpenMemoryGraph ? () => onOpenMemoryGraph(agent.id) : undefined}
        />
        </div>

      </div>
    </>
  );
}

// ---------- Right sidebar: profile editor (avatar / symbols / emojis / photo) ----------

function ProfileEditor({ agent, photo, onPhotoChange, onChange, onBack }) {
  const [draftGlyph, setDraftGlyph] = React.useState(agent.glyph || '');
  React.useEffect(() => { setDraftGlyph(agent.glyph || ''); }, [agent.id]);
  const fileInputRef = React.useRef(null);

  // Esc closes the profile editor (matches the "esc" hint in the crumb row).
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onBack && onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const commitGlyph = () => {
    if (draftGlyph !== agent.glyph && draftGlyph.length > 0) onChange({ ...agent, glyph: draftGlyph });
  };

  const onPickPhoto = () => fileInputRef.current && fileInputRef.current.click();
  const onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    readPhotoFile(file, (dataUrl) => {
      if (dataUrl) onPhotoChange(dataUrl);
    });
    // reset so the same file can be chosen twice in a row
    e.target.value = '';
  };
  const onClearPhoto = () => onPhotoChange(null);

  const PickerGrid = ({ items, current, onPick, fontSize = 18 }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, marginTop: 6,
    }}>
      {items.map(g => (
        <button
          key={g}
          onClick={() => { setDraftGlyph(g); onChange({ ...agent, glyph: g }); }}
          style={{
            aspectRatio: '1 / 1', padding: 0, border: '1px solid var(--sb-line)',
            background: current === g ? 'var(--sb-surface)' : 'transparent',
            borderRadius: 4, cursor: 'pointer', fontSize,
            color: current === g ? agent.color : 'var(--sb-fg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={`use ${g}`}
        >{g}</button>
      ))}
    </div>
  );

  return (
    <>
      <CrumbRow crumbs={['agents', agent.name || 'unnamed', 'profile']} escHint="esc" />
      <PanelHeader
        glyph={agent.glyph || agent.name?.[0] || '?'}
        accent="var(--sb-accent)"
        title="edit profile"
        subtitle={agent.name}
        action={
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 3,
              color: 'var(--sb-fg-muted)', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
              padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.06em', flexShrink: 0,
            }}
            title="back to agent config (esc)"
          >← back</button>
        }
      />
      <div className="panel-body">
        <div className="panel-body-scroll">
          {/* Big preview */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 22px' }}>
            <div style={{
              width: 96, height: 96, borderRadius: 12,
              background: photo ? 'transparent' : agent.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--sb-font-display)', fontSize: 44, color: 'rgba(0,0,0,0.85)',
              overflow: 'hidden',
              border: '1px solid var(--sb-line)',
            }}>
              {photo
                ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : agent.glyph}
            </div>
          </div>

          {/* Photo */}
          <div className="field">
            <label>photo</label>
            <input
              ref={fileInputRef} type="file" accept="image/*"
              onChange={onFileChange} style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onPickPhoto} style={pillBtnStyle}>{photo ? 'replace' : 'choose photo'}</button>
              {photo && (
                <button onClick={onClearPhoto} style={{ ...pillBtnStyle, color: '#d93b25' }}>remove</button>
              )}
            </div>
            <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>
              resized to 96×96 jpeg, stored locally per agent.
            </div>
          </div>

          {/* Symbol input */}
          <div className="field">
            <label>symbol or emoji</label>
            <input
              value={draftGlyph}
              onChange={(e) => setDraftGlyph(e.target.value.slice(0, 4))}
              onBlur={commitGlyph}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitGlyph(); e.target.blur(); } }}
              maxLength={4}
              placeholder="◇ or 🤖"
              style={{ width: '100%', textAlign: 'center', fontSize: 22, padding: '8px' }}
              title="any character or emoji"
            />
          </div>

          <div className="field">
            <label>symbols</label>
            <PickerGrid items={GLYPH_QUICKPICKS} current={agent.glyph} fontSize={16} />
          </div>

          <div className="field">
            <label>emojis</label>
            <PickerGrid items={EMOJI_QUICKPICKS} current={agent.glyph} fontSize={18} />
          </div>
        </div>
      </div>
    </>
  );
}

const pillBtnStyle = {
  padding: '6px 12px', fontFamily: 'var(--sb-font-mono)', fontSize: 11,
  background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 4,
  color: 'var(--sb-fg-muted)', cursor: 'pointer', letterSpacing: '0.04em',
};

// ---------- Center-panel tab: expanded memory graph + per-node color editing ----------

function MemoryGraphTab({ agent, nodeColors = {}, setNodeColor, onOpenFile, focusedFileFromSidebar }) {
  if (!agent) {
    return (
      <div className="md-editor" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div className="marker-x">/// NO AGENT</div>
          <div className="ttl">focus an agent to inspect its memory graph</div>
        </div>
      </div>
    );
  }
  const colors = nodeColors[agent.id] || {};
  const files = (agent.vaultFiles || []);
  const vaultEdges = agent.vaultEdges || [];

  return (
    <div className="md-editor" style={{ flexDirection: 'row' }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <div style={{
          position: 'absolute', top: 12, left: 16, zIndex: 2,
          fontFamily: 'var(--sb-font-mono)', fontSize: 10.5,
          color: 'var(--sb-fg-faint)', letterSpacing: '0.1em',
          pointerEvents: 'none',
        }}>
          /// MEMORY GRAPH · {agent.name} · {files.length} {files.length === 1 ? 'file' : 'files'} · {vaultEdges.length} {vaultEdges.length === 1 ? 'link' : 'links'}
        </div>
        <MemoryGraph
          agent={agent}
          onOpenFile={onOpenFile}
          nodeColors={colors}
          expandedView={true}
        />
      </div>
    </div>
  );
}

// ---------- Right sidebar: file panel (used while a memory-graph tab is active) ----------

function MemoryGraphFilesPanel({ agent, nodeColors = {}, setNodeColor, onOpenFile, onDeleteFile, onRenameFile, onRemoveLink }) {
  const [openFile, setOpenFile] = React.useState(null);
  const [search, setSearch] = React.useState('');
  React.useEffect(() => { setOpenFile(null); setSearch(''); }, [agent && agent.id]);

  // All hooks must run on every render — even when there's no agent. Computing
  // these unconditionally (and falling back to safe defaults) keeps the hook
  // count stable across null↔value transitions of the focused agent. Earlier
  // versions had an early return above the useMemo calls and crashed React with
  // "Rendered more hooks than during the previous render."
  const colors = (agent && nodeColors[agent.id]) || {};
  const allFiles = (agent && agent.vaultFiles && agent.vaultFiles.length > 0)
    ? [...agent.vaultFiles].sort()
    : ['index.md'];
  const accent = (agent && agent.color) || '#7fb6d9';
  const vaultEdges = (agent && agent.vaultEdges) || [];

  const { outgoing, incoming } = React.useMemo(() => {
    const out = {}; const inc = {};
    for (const [from, to] of vaultEdges) {
      (out[from] = out[from] || []).push(to);
      (inc[to]  = inc[to]  || []).push(from);
    }
    return { outgoing: out, incoming: inc };
  }, [vaultEdges]);

  const files = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allFiles;
    return allFiles.filter(f => f.toLowerCase().includes(q));
  }, [allFiles, search]);

  // Inherited colors so the file row's small swatch reflects the same color
  // the node has in the graph (manually-colored ancestor cascades down).
  const effectiveColors = React.useMemo(
    () => computeEffectiveColors(allFiles, vaultEdges, colors, accent),
    [allFiles.join('|'), vaultEdges.map(e => e[0] + '>' + e[1]).join('|'), JSON.stringify(colors), accent]
  );

  if (!agent) {
    return (
      <div className="empty-state">
        <div className="marker-x">/// NO AGENT</div>
        <div className="ttl">focus an agent to inspect its memory graph</div>
      </div>
    );
  }

  return (
    <>
      <CrumbRow crumbs={['memory', agent.name || 'unnamed', 'files']} />
      <PanelHeader
        glyph="md"
        glyphMono
        accent="var(--sb-kind-file)"
        title={`${agent.name}'s vault`}
        subtitle={`${allFiles.length} ${allFiles.length === 1 ? 'file' : 'files'}${search ? ` · ${files.length} match` : ''}`}
      />
      <div className="panel-body">
        <SearchBar value={search} onChange={setSearch} placeholder="search files…" />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{
            padding: '8px 14px',
            fontFamily: 'var(--sb-font-mono)', fontSize: 10,
            color: 'var(--sb-fg-disabled)', letterSpacing: '0.04em',
            borderBottom: '1px solid var(--sb-line-soft)',
          }}>
            {agent.name}'s vault · click a row for properties + open
          </div>
          {files.map(f => {
            const cur = colors[f] || '';
            // Effective swatch: manual color OR inherited from upstream
            // wikilink ancestor OR agent default. Lets a "concepts" parent
            // node colored once paint all its descendants at render time.
            const inherited = effectiveColors.get(f);
            const swatch = cur || inherited || accent;
            const isOpen = openFile === f;
            return (
              <FileRow
                key={f}
                file={f}
                swatch={swatch}
                hasCustomColor={!!cur}
                isOpen={isOpen}
                isImmutable={f === 'identity.md'}
                onOpenProps={() => setOpenFile(isOpen ? null : f)}
                onOpenFile={() => onOpenFile && onOpenFile(agent.id, f)}
                onSetColor={(c) => setNodeColor && setNodeColor(agent.id, f, c)}
                onResetColor={() => setNodeColor && setNodeColor(agent.id, f, null)}
                onDelete={() => onDeleteFile && onDeleteFile(agent.id, f)}
                onRename={(newName) => onRenameFile && onRenameFile(agent.id, f, newName)}
                outgoing={outgoing[f] || []}
                incoming={incoming[f] || []}
                onJump={(target) => { setOpenFile(target); }}
                onOpenTarget={(target) => onOpenFile && onOpenFile(agent.id, target)}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

function FileRow({
  file, swatch, hasCustomColor, isOpen, isImmutable,
  onOpenProps, onOpenFile, onSetColor, onResetColor, onDelete, onRename,
  outgoing, incoming, onJump, onOpenTarget,
}) {
  const [draftName, setDraftName] = React.useState(file.replace(/\.md$/, ''));
  React.useEffect(() => { setDraftName(file.replace(/\.md$/, '')); }, [file, isOpen]);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (!trimmed || isImmutable) return;
    const target = trimmed.endsWith('.md') ? trimmed : trimmed + '.md';
    if (target === file) return;
    onRename && onRename(target);
  };

  return (
    <div style={{ borderBottom: '1px solid var(--sb-line-soft)' }}>
      {/* Row — clicking ANYWHERE on the row opens the properties pane (the
          three-dots glyph is a visual affordance only; row + glyph both fire
          the same handler). The explicit "open file" action lives at the top
          of the expanded pane below. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        cursor: 'pointer',
        background: isOpen ? 'var(--sb-surface)' : 'transparent',
      }}
        onClick={onOpenProps}
        title={isOpen ? 'close properties' : `properties for ${file}`}
      >
        <span style={{
          width: 10, height: 10, borderRadius: 99, flexShrink: 0,
          background: swatch,
          border: hasCustomColor ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--sb-line)',
        }} />
        <span style={{
          flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 11.5,
          color: 'var(--sb-fg)', letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{file.replace(/\.md$/, '')}</span>
        <span
          aria-hidden="true"
          style={{
            color: isOpen ? 'var(--sb-fg)' : 'var(--sb-fg-faint)',
            fontFamily: 'var(--sb-font-mono)', fontSize: 14, lineHeight: '12px',
            padding: '0 4px', letterSpacing: '0.05em',
          }}
        >{isOpen ? '⌃' : '⋯'}</span>
      </div>

      {/* Properties pane */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ padding: '4px 14px 14px', background: 'var(--sb-surface)' }}
        >
          {/* open-file action at the top — replaces the row's previous click
              behavior so the path to opening the file is still one click from
              this expanded view. */}
          <button
            onClick={onOpenFile}
            style={{
              width: '100%', marginTop: 4, marginBottom: 12,
              padding: '7px 10px', borderRadius: 4,
              background: 'transparent', border: '1px solid var(--sb-line)',
              color: 'var(--sb-fg)',
              fontFamily: 'var(--sb-font-mono)', fontSize: 11, letterSpacing: '0.06em',
              cursor: 'pointer', textTransform: 'lowercase',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sb-bg-elev)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >open file</button>

          {/* filename */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>filename</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } }}
                disabled={isImmutable}
                style={{ flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 11.5 }}
              />
              <span style={{
                fontFamily: 'var(--sb-font-mono)', fontSize: 10,
                color: 'var(--sb-fg-disabled)', padding: '0 4px',
              }}>.md</span>
            </div>
            {!isImmutable && draftName !== file.replace(/\.md$/, '') && (
              <button
                onClick={commitRename}
                style={{ ...rowBtn, marginTop: 6, color: 'var(--sb-fg)' }}
              >save rename</button>
            )}
            {isImmutable && (
              <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>
                identity.md is daemon-managed · cannot rename
              </div>
            )}
          </div>

          {/* color — swatch picker (12 curated colors) + custom color input as fallback */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {['#7fb6d9','#a89be0','#9bd1a4','#e6c068','#e89c7f','#88c4ce','#d9a3c9','#c8c8b8','#7fa8a8','#d4b896','#d93b25','#737373'].map(c => {
                const isCur = hasCustomColor && swatch.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    onClick={() => onSetColor(c)}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', padding: 0,
                      background: c,
                      border: isCur ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                    }}
                    title={c}
                  />
                );
              })}
              <input
                type="color"
                value={swatch}
                onChange={(e) => onSetColor(e.target.value)}
                style={{
                  width: 28, height: 22, padding: 0, border: '1px solid var(--sb-line)',
                  borderRadius: 4, background: 'transparent', cursor: 'pointer',
                }}
                title="custom color"
              />
              {hasCustomColor && (
                <button onClick={onResetColor} style={rowBtn}>reset</button>
              )}
            </div>
            <div style={{
              marginTop: 4, fontFamily: 'var(--sb-font-mono)', fontSize: 10,
              color: 'var(--sb-fg-disabled)',
            }}>
              {hasCustomColor ? 'custom' : 'agent default'}
            </div>
          </div>

          {/* outgoing links */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>links → ({outgoing.length})</label>
            {outgoing.length === 0
              ? <div className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>no outbound wikilinks</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {outgoing.map(t => (
                    <LinkChip key={'o-' + t} label={t.replace(/\.md$/, '')}
                      onClick={() => onJump(t)} onOpen={() => onOpenTarget(t)} />
                  ))}
                </div>}
          </div>

          {/* backlinks */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label>← linked by ({incoming.length})</label>
            {incoming.length === 0
              ? <div className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>no inbound links</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {incoming.map(t => (
                    <LinkChip key={'i-' + t} label={t.replace(/\.md$/, '')}
                      onClick={() => onJump(t)} onOpen={() => onOpenTarget(t)} />
                  ))}
                </div>}
          </div>

          {/* destructive action */}
          {!isImmutable && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--sb-line)' }}>
              <button onClick={onDelete} style={{ ...rowBtn, color: '#d93b25', borderColor: 'rgba(217,59,37,0.4)' }}>delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const rowBtn = {
  padding: '4px 8px', fontFamily: 'var(--sb-font-mono)', fontSize: 10.5,
  background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 3,
  color: 'var(--sb-fg-muted)', cursor: 'pointer', letterSpacing: '0.04em',
};

function LinkChip({ label, onClick, onOpen }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--sb-line)', borderRadius: 99 }}>
      <button onClick={onClick} title={`focus ${label}`} style={{
        background: 'transparent', border: 'none',
        color: 'var(--sb-fg-muted)', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
        padding: '2px 6px 2px 8px', cursor: 'pointer', letterSpacing: '0.04em',
      }}>{label}</button>
      <button onClick={onOpen} title={`open ${label}`} style={{
        background: 'transparent', border: 'none',
        color: 'var(--sb-fg-faint)', fontSize: 10, lineHeight: '10px',
        padding: '2px 6px 2px 4px', cursor: 'pointer',
      }}>↗</button>
    </span>
  );
}

// ---------- LEFT: agent list (used both as default view and while a graph tab is active) ----------

// Working-state pip rendered next to an agent's name. Color + animation per
// state, per the May 2026 redesign spec. Returns null when state is idle/unknown
// so we don't dot up rows that have nothing happening.
function WorkingPip({ state }) {
  const cfg = ({
    'thinking':        { color: 'var(--sb-work-thinking)',       anim: null,                            glow: 'rgba(127,182,217,0.5)' },
    'tool-running':    { color: 'var(--sb-work-tool)',           anim: 'workPulse 1.4s infinite',       glow: 'rgba(230,192,104,0.5)' },
    'awaiting-input':  { color: 'var(--sb-work-awaiting-input)', anim: 'workBlink 0.9s infinite',       glow: 'rgba(217,59,37,0.8)'   },
    'moving':          { color: 'var(--sb-work-moving)',         anim: null,                            glow: 'rgba(168,155,224,0.5)' },
  })[state];
  if (!cfg) return null;
  return (
    <span title={state} style={{
      display: 'inline-block',
      width: 6, height: 6, borderRadius: '50%',
      background: cfg.color,
      boxShadow: `0 0 ${state === 'awaiting-input' ? 6 : 4}px ${cfg.glow}`,
      animation: cfg.anim || 'none',
      flexShrink: 0,
    }} />
  );
}

function AgentsList({ agents, selectedId, onPick, onOpen, modeBadge, onSpawnNew }) {
  // Loaded photos per agent — read once + whenever the agent set changes.
  const [photos, setPhotos] = React.useState(() => {
    const m = {};
    for (const a of agents) m[a.id] = loadAgentPhoto(a.id);
    return m;
  });
  React.useEffect(() => {
    const m = {};
    for (const a of agents) m[a.id] = loadAgentPhoto(a.id);
    setPhotos(m);
  }, [agents.map(a => a.id).join('|')]);

  const [search, setSearch] = React.useState('');
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a => a.name.toLowerCase().includes(q));
  }, [agents, search]);

  // Bucket the filtered agents into WORKING / IDLE / DRAFT for section grouping.
  // "Working" = anything live with a non-idle state (thinking / tool-running /
  // awaiting-input / moving). Drafts always group last regardless of state.
  const groups = React.useMemo(() => {
    const working = [];
    const idle = [];
    const draft = [];
    for (const a of filtered) {
      if (a.status === 'Draft') { draft.push(a); continue; }
      if (a.state && a.state !== 'idle' && a.state !== 'paused') working.push(a);
      else idle.push(a);
    }
    return { working, idle, draft };
  }, [filtered]);

  const renderRow = (a) => {
    const isActive = a.id === selectedId;
    const photo = photos[a.id];
    const fileCount = (a.vaultFiles || []).length;
    const edgeCount = (a.vaultEdges || []).length;
    return (
      <div key={a.id}
           className={`conv-row ${isActive ? 'focused' : ''}`}
           tabIndex={0}
           onClick={() => onPick && onPick(a.id)}
           onDoubleClick={() => (onOpen || onPick) && (onOpen || onPick)(a.id)}
           onKeyDown={(e) => {
             if (e.key === 'Enter') {
               e.preventDefault();
               (onOpen || onPick) && (onOpen || onPick)(a.id);
             }
           }}
           title={onOpen ? `${a.name} — click to focus, double-click or Enter to open chat` : a.name}>
        <div className="avatar" style={{
          background: photo ? 'transparent' : a.color,
          padding: 0, overflow: 'hidden',
        }}>
          {photo
            ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : a.glyph}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="conv-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            <WorkingPip state={a.state} />
            {isActive && modeBadge && <span style={{
              fontFamily: 'var(--sb-font-mono)', fontSize: 9,
              color: 'var(--sb-accent)', letterSpacing: '0.08em',
            }}>{modeBadge}</span>}
          </div>
          <div className="conv-preview">
            {fileCount} {fileCount === 1 ? 'file' : 'files'} · {edgeCount} {edgeCount === 1 ? 'link' : 'links'} · {a.status === 'Live' ? 'live' : 'draft'}
          </div>
        </div>
        <div className="conv-meta">
          <span className="conv-time" style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 9 }}>
            q={a.q} r={a.r}
          </span>
          {a.status === 'Live'
            ? <span className="status-dot live" />
            : <span className="status-dot archived" />}
        </div>
      </div>
    );
  };

  // "Quiet world" empty-state card surfaces when ≤3 agents in total — nudges the
  // user to spawn another. Specifically called out in the redesign brief.
  const showQuietWorld = !search && agents.length > 0 && agents.length <= 3;

  return (
    <>
      <SearchBar value={search} onChange={setSearch} placeholder="search agents…" />
      <div className="conv-list">
        {filtered.length === 0 && (
          <div style={{ padding: '32px 18px', color: 'var(--sb-fg-faint)', fontSize: 11.5, textAlign: 'center' }}>
            <div className="marker" style={{ marginBottom: 8 }}>/// EMPTY</div>
            {agents.length === 0 ? 'no agents on the grid yet.' : 'no agents match this filter.'}
          </div>
        )}

        {groups.working.length > 0 && (
          <SectionHeader label="WORKING" count={groups.working.length} />
        )}
        {groups.working.map(renderRow)}

        {groups.idle.length > 0 && (
          <SectionHeader label="IDLE" count={groups.idle.length} />
        )}
        {groups.idle.map(renderRow)}

        {groups.draft.length > 0 && (
          <SectionHeader label="DRAFT" count={groups.draft.length} />
        )}
        {groups.draft.map(renderRow)}

        {showQuietWorld && (
          <div style={{
            margin: '14px 12px',
            padding: '14px 14px 12px',
            border: '1px dashed var(--sb-line)',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.01)',
          }}>
            <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 14, color: 'var(--sb-fg)', letterSpacing: '-0.01em', marginBottom: 4 }}>
              quiet world.
            </div>
            <div style={{ fontFamily: 'var(--sb-font-body)', fontSize: 11.5, color: 'var(--sb-fg-faint)', lineHeight: 1.45, marginBottom: 10 }}>
              {agents.length === 1 ? 'one agent — pick an empty cell on the grid to seed another.'
                : agents.length === 2 ? 'two agents — pick an empty cell on the grid to seed a third.'
                : 'three agents — pick an empty cell on the grid to seed a fourth.'}
            </div>
            <button style={{
              fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, letterSpacing: '0.06em',
              padding: '5px 12px', borderRadius: 3,
              background: 'transparent', border: '1px solid var(--sb-accent)',
              color: 'var(--sb-accent)', cursor: 'pointer', textTransform: 'lowercase',
            }}
              onClick={(e) => { e.stopPropagation(); onSpawnNew && onSpawnNew(); }}
              title="switch the grid into Spawn mode — then click an empty hex to drop a new agent"
            >+ new agent</button>
          </div>
        )}
      </div>
    </>
  );
}

// Sticky-ish section divider between agent groups in the AgentsList.
function SectionHeader({ label, count }) {
  return (
    <div style={{
      padding: '10px 14px 6px',
      fontFamily: 'var(--sb-font-mono)', fontSize: 10,
      color: 'var(--sb-fg-faint)', letterSpacing: '0.08em',
      borderBottom: '1px solid var(--sb-line-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span>/// {label}</span>
      <span style={{ color: 'var(--sb-fg-disabled)' }}>· {count}</span>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--sb-line-soft)',
      background: 'var(--sb-bg)',
      flexShrink: 0,
    }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'search…'}
        style={{
          width: '100%', padding: '5px 8px',
          fontFamily: 'var(--sb-font-mono)', fontSize: 11.5,
          background: 'var(--sb-surface)',
          border: '1px solid var(--sb-line)', borderRadius: 3,
          color: 'var(--sb-fg)',
          outline: 'none',
        }}
      />
    </div>
  );
}

window.LeftList = LeftList;
window.ChatView = ChatView;
window.AgentConfig = AgentConfig;
window.MemoryGraphTab = MemoryGraphTab;
window.MemoryGraphFilesPanel = MemoryGraphFilesPanel;
