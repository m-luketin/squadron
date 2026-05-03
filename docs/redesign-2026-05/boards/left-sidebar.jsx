// Artboard 05 — Left sidebar Sessions/Agents toggle + working state.

function LSShell({ children, mode, onMode, count }) {
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* persistent top toggle */}
      <div style={{
        height: 36, padding: '0 8px',
        display: 'flex', alignItems: 'center', gap: 4,
        borderBottom: '1px solid var(--sb-line-soft)',
        background: 'var(--sb-bg-deep, #050505)',
      }}>
        {[
          { id: 'sessions', label: 'sessions', kbd: '⌘1' },
          { id: 'agents',   label: 'agents',   kbd: '⌘2' },
        ].map(t => (
          <button key={t.id} style={{
            flex: 1, height: 24, borderRadius: 3,
            background: mode === t.id ? 'var(--sb-surface)' : 'transparent',
            border: '1px solid ' + (mode === t.id ? 'var(--sb-line)' : 'transparent'),
            color: mode === t.id ? 'var(--sb-fg)' : 'var(--sb-fg-faint)',
            fontSize: 11, fontFamily: 'var(--sb-font-mono)', letterSpacing: '0.04em',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {t.label}
            {mode === t.id && <span style={{ color: 'var(--sb-fg-disabled)', fontSize: 9 }}>{t.kbd}</span>}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--sb-line-soft)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--sb-font-mono)', fontSize: 11,
      }}>
        <span style={{ color: 'var(--sb-fg-faint)' }}>/</span>
        <span style={{ color: 'var(--sb-fg-muted)', flex: 1 }}>filter {mode}…</span>
        <span style={{ color: 'var(--sb-fg-disabled)', fontSize: 10 }}>{count}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

// --- working state pip ---
const WORK_COLOR = {
  thinking:        '#7fb6d9',
  'tool-running':  '#e6c068',
  'awaiting-input':'#d93b25',
  moving:          '#a89be0',
  idle:            'transparent',
};

function WorkPip({ state }) {
  if (state === 'idle') return null;
  const c = WORK_COLOR[state];
  const isAwait = state === 'awaiting-input';
  return (
    <span title={state} style={{
      width: 6, height: 6, borderRadius: 999,
      background: c,
      boxShadow: isAwait ? '0 0 6px rgba(217,59,37,0.8)' : '0 0 4px ' + c + '80',
      animation: state === 'tool-running' ? 'workPulse 1.4s infinite' : isAwait ? 'workBlink 0.9s infinite' : 'none',
    }} />
  );
}

function WorkStyles() {
  return <style>{`
    @keyframes workPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.4; } }
    @keyframes workBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
  `}</style>;
}

// ---------- 05a · Sessions ----------
function SessionRow({ s, active }) {
  const a = s.kind === 'user' ? window.MOCK.AGENTS.find(x => x.id === s.agentId) : null;
  return (
    <div style={{
      padding: '10px 10px',
      display: 'flex', gap: 8, alignItems: 'flex-start',
      background: active ? 'var(--sb-surface)' : 'transparent',
      borderBottom: '1px solid var(--sb-line-soft)',
      borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
      cursor: 'pointer', position: 'relative',
    }}>
      {/* avatar */}
      {a ? (
        <div style={{
          width: 26, height: 26, borderRadius: 3,
          background: a.color + '22', border: '1px solid ' + a.color + '60',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: a.color, fontFamily: 'var(--sb-font-display)', fontSize: 14, flexShrink: 0,
        }}>{a.glyph}</div>
      ) : (
        <div style={{
          width: 26, height: 26, position: 'relative', flexShrink: 0,
        }}>
          {s.agentIds.map((id, i) => {
            const ag = window.MOCK.AGENTS.find(x => x.id === id);
            return (
              <div key={id} style={{
                position: 'absolute', left: i * 8, top: i * 4,
                width: 18, height: 18, borderRadius: 3,
                background: ag.color + '30', border: '1px solid ' + ag.color + '70',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ag.color, fontFamily: 'var(--sb-font-display)', fontSize: 10,
              }}>{ag.glyph}</div>
            );
          })}
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{
            color: s.unread ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
            fontWeight: s.unread ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>{s.label}</span>
          {s.working && <WorkPip state={s.working} />}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--sb-font-mono)', fontSize: 9.5, color: 'var(--sb-fg-disabled)' }}>{s.time}</span>
        </div>
        <div style={{
          fontSize: 11, lineHeight: 1.4,
          color: s.unread ? 'var(--sb-fg-muted)' : 'var(--sb-fg-faint)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          marginTop: 2,
        }}>{s.last}</div>
      </div>

      {s.unread && !active && (
        <span style={{
          width: 5, height: 5, borderRadius: 999,
          background: 'var(--sb-accent)',
          position: 'absolute', right: 8, top: 12,
        }} />
      )}
    </div>
  );
}

function BoardLSSessions() {
  return (
    <>
      <WorkStyles />
      <LSShell mode="sessions" count="9 · 3 unread">
        <div className="marker" style={{ padding: '10px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// LIVE · 7</div>
        {window.MOCK.SESSIONS.filter(s => s.status === 'live').map((s, i) => (
          <SessionRow key={s.id} s={s} active={i === 0} />
        ))}

        <div className="marker" style={{ padding: '12px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// ARCHIVED</div>
        {window.MOCK.SESSIONS.filter(s => s.status === 'archived').map(s => (
          <SessionRow key={s.id} s={s} />
        ))}
      </LSShell>

      <div className="anno" style={{ left: 8, top: 4 }}>
        <div className="anno-text"><span className="num">1</span>persistent toggle · ⌘1 / ⌘2</div>
      </div>
      <div className="anno" style={{ left: 8, top: 100 }}>
        <div className="anno-text"><span className="num">2</span>working pip — color = state, see legend</div>
      </div>
      <div className="anno" style={{ left: 8, top: 320 }}>
        <div className="anno-text"><span className="num">3</span>inter-agent session — stacked avatars</div>
      </div>
    </>
  );
}

// ---------- 05b · Agents ----------
function AgentRow({ a, active }) {
  return (
    <div style={{
      padding: '8px 10px',
      display: 'flex', gap: 8, alignItems: 'center',
      background: active ? 'var(--sb-surface)' : 'transparent',
      borderBottom: '1px solid var(--sb-line-soft)',
      borderLeft: active ? '2px solid var(--sb-accent)' : '2px solid transparent',
      cursor: 'pointer', position: 'relative',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 3,
        background: a.color + '22', border: '1px solid ' + a.color + '60',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: a.color, fontFamily: 'var(--sb-font-display)', fontSize: 14, flexShrink: 0,
      }}>{a.glyph}</div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--sb-fg)' }}>{a.name}</span>
          {a.state !== 'idle' && <WorkPip state={a.state} />}
          {a.status === 'Draft' && (
            <span style={{
              fontFamily: 'var(--sb-font-mono)', fontSize: 9,
              padding: '0 4px', border: '1px solid var(--sb-line)',
              color: 'var(--sb-fg-disabled)', borderRadius: 2,
            }}>draft</span>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--sb-font-mono)', fontSize: 9.5, color: 'var(--sb-fg-disabled)' }}>{a.lastAt}</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--sb-fg-faint)', marginTop: 2, fontFamily: 'var(--sb-font-mono)' }}>
          {a.task}
        </div>
      </div>

      {/* peek hint shown on hover — single click → focus, double → chat */}
      {active && (
        <span style={{
          fontFamily: 'var(--sb-font-mono)', fontSize: 9,
          color: 'var(--sb-fg-disabled)',
          position: 'absolute', right: 10, bottom: 6,
        }}>↵ chat</span>
      )}
    </div>
  );
}

function BoardLSAgents() {
  return (
    <>
      <WorkStyles />
      <LSShell mode="agents" count="10 · 7 working">
        <div className="marker" style={{ padding: '10px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// WORKING · 5</div>
        {window.MOCK.AGENTS.filter(a => a.state !== 'idle' && a.status === 'Live').map((a, i) => (
          <AgentRow key={a.id} a={a} active={i === 0} />
        ))}

        <div className="marker" style={{ padding: '12px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// IDLE · 4</div>
        {window.MOCK.AGENTS.filter(a => a.state === 'idle' && a.status === 'Live').map(a => (
          <AgentRow key={a.id} a={a} />
        ))}

        <div className="marker" style={{ padding: '12px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// DRAFT · 1</div>
        {window.MOCK.AGENTS.filter(a => a.status === 'Draft').map(a => (
          <AgentRow key={a.id} a={a} />
        ))}
      </LSShell>

      <div className="anno" style={{ left: 8, top: 4 }}>
        <div className="anno-text"><span className="num">1</span>same toggle, agents view</div>
      </div>
      <div className="anno" style={{ left: 8, top: 130 }}>
        <div className="anno-text"><span className="num">2</span>click → focus on grid · ↵ enter → chat</div>
      </div>
      <div className="anno" style={{ left: 8, top: 280 }}>
        <div className="anno-text"><span className="num">3</span>state pip + status text — fixes "have to chat to see what's happening"</div>
      </div>
    </>
  );
}

// ---------- 05c · 3-agent edge ----------
function BoardLSAgentsSmall() {
  return (
    <>
      <WorkStyles />
      <LSShell mode="agents" count="3">
        <div className="marker" style={{ padding: '10px 10px 6px', color: 'var(--sb-fg-faint)' }}>/// LIVE · 3</div>
        {window.MOCK.SMALL_AGENTS.map((a, i) => (
          <AgentRow key={a.id} a={a} active={i === 0} />
        ))}

        {/* empty-ish state encouragement */}
        <div style={{
          margin: 12, padding: 16,
          border: '1px dashed var(--sb-line)',
          borderRadius: 4,
          textAlign: 'center',
          fontSize: 11.5, color: 'var(--sb-fg-faint)',
          lineHeight: 1.5,
        }}>
          <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 14, color: 'var(--sb-fg-muted)', marginBottom: 6 }}>
            quiet world.
          </div>
          three agents — pick one of the empty cells on the grid to seed a fourth.
          <div style={{ marginTop: 10 }}>
            <button style={{
              background: 'transparent', border: '1px solid var(--sb-accent)',
              color: 'var(--sb-accent)', fontSize: 10, fontFamily: 'var(--sb-font-mono)',
              padding: '4px 10px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.06em',
            }}>+ NEW AGENT</button>
          </div>
        </div>
      </LSShell>

      <div className="anno" style={{ left: 8, top: 280 }}>
        <div className="anno-text"><span className="num">1</span>3-agent edge — soft empty-state instead of dead space</div>
      </div>
    </>
  );
}

window.BoardLSSessions = BoardLSSessions;
window.BoardLSAgents = BoardLSAgents;
window.BoardLSAgentsSmall = BoardLSAgentsSmall;
