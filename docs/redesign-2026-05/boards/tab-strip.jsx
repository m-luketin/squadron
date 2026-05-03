// Artboard 1 — Tab strip taxonomy.
// Three artboards: current state, proposed taxonomy, drag/right-click affordances.

const { useState: useStateTab } = React;

// ---------- shared chrome bits ----------
function FrameTopbar() {
  return (
    <div className="topbar">
      <div className="brand"><span className="dot" /> squadron</div>
      <span className="sep" />
      <span className="marker">/// world: devshop · 1 of 1</span>
      <span className="sep" />
      <span className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>10 agents · 7 live</span>
    </div>
  );
}

function GlyphSquare({ children, accent, dim }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: 2,
      border: '1px solid ' + (accent || 'var(--sb-line)'),
      color: dim ? 'var(--sb-fg-faint)' : (accent || 'var(--sb-fg-muted)'),
      fontFamily: 'var(--sb-font-mono)', fontSize: 9, lineHeight: 1,
      flexShrink: 0,
    }}>{children}</span>
  );
}

// ---------- 01a · current ----------
function BoardTabsCurrent() {
  return (
    <div className="frame">
      <FrameTopbar />
      <div style={{
        display: 'flex', height: 36,
        borderBottom: '1px solid var(--sb-line)',
        overflowX: 'auto',
      }}>
        {[
          { id: 'grid',     title: 'hex grid',          active: true },
          { id: 'roadmap',  title: 'roadmap.md',        badge: 'atlas' },
          { id: 'authv3',   title: 'auth-v3.md',        badge: 'mercury' },
          { id: 'memory',   title: 'mercury · graph' },
          { id: 'preview',  title: 'wireframe.png',     badge: 'atlas' },
          { id: 'settings', title: 'settings' },
        ].map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0 14px',
            borderRight: '1px solid var(--sb-line)',
            background: t.active ? 'var(--sb-bg-elev)' : 'transparent',
            color: t.active ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
            fontSize: 12, position: 'relative', whiteSpace: 'nowrap',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6" />
            </svg>
            {t.title}
            {t.badge && (
              <span style={{
                fontFamily: 'var(--sb-font-mono)', fontSize: 9,
                padding: '1px 5px', border: '1px solid var(--sb-line)',
                borderRadius: 3, color: 'var(--sb-fg-faint)',
                letterSpacing: '0.05em',
              }}>{t.badge}</span>
            )}
            <span style={{ width: 14, height: 14, color: 'var(--sb-fg-disabled)', fontSize: 11 }}>×</span>
            {t.active && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 1, background: 'var(--sb-accent)' }} />}
          </div>
        ))}
      </div>

      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="marker" style={{ color: 'var(--sb-fg-faint)' }}>/// PROBLEM</div>
        <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 22, letterSpacing: '-0.01em', maxWidth: 720, lineHeight: 1.35 }}>
          all five tab kinds — grid, file, memory-graph, vault-preview, settings — render with the same generic file glyph. the strip flattens a meaningfully heterogeneous panel into a uniform list.
        </div>
        <div style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, maxWidth: 640, lineHeight: 1.55, marginTop: 6 }}>
          grid is the persistent home, but reads as a peer. files lose their vault context once you skim. memory-graph and vault-preview have no way to be told apart from a markdown file.
        </div>
      </div>

      {/* annotations */}
      <div className="anno" style={{ left: 16, top: 60 }}>
        <div className="anno-text"><span className="num">1</span>generic file glyph everywhere</div>
      </div>
      <div className="anno" style={{ left: 380, top: 60 }}>
        <div className="anno-text"><span className="num">2</span>grid feels equal to siblings</div>
      </div>
    </div>
  );
}

// ---------- 01b · proposed ----------
const KIND_DEFS = {
  grid:     { glyph: 'G',  hint: 'home',     color: '#d93b25' },
  file:     { glyph: 'md', hint: 'markdown', color: '#7fb6d9' },
  memory:   { glyph: '◉',  hint: 'graph',    color: '#a89be0' },
  preview:  { glyph: '▦',  hint: 'preview',  color: '#9bd1a4' },
  settings: { glyph: '⚙',  hint: 'settings', color: '#737373' },
};

function ProposedTab({ kind, title, vault, active, pinned, dragging, dropBefore, dropAfter }) {
  const def = KIND_DEFS[kind];
  const isHome = kind === 'grid';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: isHome ? '0 16px 0 14px' : '0 12px 0 14px',
      borderRight: '1px solid var(--sb-line)',
      background: active ? (isHome
        ? 'linear-gradient(180deg, rgba(217,59,37,0.08), rgba(217,59,37,0) 70%), var(--sb-bg-elev)'
        : 'var(--sb-bg-elev)') : 'transparent',
      color: active ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
      fontSize: 12, position: 'relative', whiteSpace: 'nowrap',
      opacity: dragging ? 0.4 : 1,
      cursor: 'pointer',
    }}>
      {/* drop indicator before */}
      {dropBefore && <span style={{ position: 'absolute', left: -1, top: 4, bottom: 4, width: 2, background: 'var(--sb-accent)', boxShadow: '0 0 8px rgba(217,59,37,0.6)' }} />}

      {/* home/kind badge */}
      {isHome ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 3,
          background: 'rgba(217,59,37,0.18)',
          border: '1px solid rgba(217,59,37,0.5)',
          color: '#fff',
          fontFamily: 'var(--sb-font-display)', fontSize: 11, fontWeight: 600,
          letterSpacing: '-0.02em',
        }}>G</span>
      ) : (
        <GlyphSquare accent={active ? def.color : undefined}>{def.glyph}</GlyphSquare>
      )}

      {pinned && (
        <span style={{
          fontFamily: 'var(--sb-font-mono)', fontSize: 9,
          color: 'var(--sb-accent)',
          marginRight: -2,
        }}>◉</span>
      )}

      {title}

      {vault && (
        <span style={{
          fontFamily: 'var(--sb-font-mono)', fontSize: 9,
          padding: '1px 5px', border: '1px solid var(--sb-line)',
          borderRadius: 3, color: 'var(--sb-fg-faint)',
          letterSpacing: '0.05em',
        }}>{vault}</span>
      )}

      {!isHome && (
        <button style={{
          width: 14, height: 14, marginLeft: 2,
          color: 'var(--sb-fg-disabled)', fontSize: 12,
          background: 'transparent', border: 'none', cursor: 'pointer',
          borderRadius: 2,
        }}>×</button>
      )}

      {active && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 1, background: def.color }} />}
      {dropAfter && <span style={{ position: 'absolute', right: -1, top: 4, bottom: 4, width: 2, background: 'var(--sb-accent)', boxShadow: '0 0 8px rgba(217,59,37,0.6)' }} />}
    </div>
  );
}

function BoardTabsProposed() {
  return (
    <div className="frame">
      <FrameTopbar />
      <div style={{
        display: 'flex', height: 36,
        borderBottom: '1px solid var(--sb-line)',
        overflowX: 'auto',
      }}>
        <ProposedTab kind="grid"     title="hex grid"        active />
        <ProposedTab kind="file"     title="auth-v3.md"      vault="mercury" pinned />
        <ProposedTab kind="file"     title="roadmap.md"      vault="atlas" />
        <ProposedTab kind="memory"   title="mercury · graph" />
        <ProposedTab kind="preview"  title="wireframe.png"   vault="atlas" />
        <ProposedTab kind="settings" title="settings" />
      </div>

      <div style={{ padding: 40, display: 'flex', gap: 56 }}>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div className="marker" style={{ marginBottom: 8 }}>/// PROPOSAL</div>
          <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1.35, marginBottom: 14 }}>
            five distinct tab kinds, one consistent strip.
          </div>
          <div style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.6 }}>
            grid takes a special left-edge home badge with a faint red wash — unmistakably the root, not a peer. the other four kinds get monochrome glyph squares; the active tab borrows the kind's accent for the underline only. one red moment per viewport stays intact.
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 420 }}>
          <div className="marker" style={{ marginBottom: 12 }}>/// KIND LEGEND</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(KIND_DEFS).map(([k, d]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                {k === 'grid'
                  ? <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 18, height: 18, borderRadius: 3,
                      background: 'rgba(217,59,37,0.18)',
                      border: '1px solid rgba(217,59,37,0.5)',
                      color: '#fff', fontFamily: 'var(--sb-font-display)',
                      fontSize: 11, fontWeight: 600,
                    }}>G</span>
                  : <GlyphSquare accent={d.color}>{d.glyph}</GlyphSquare>}
                <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg)', minWidth: 80 }}>{k}</span>
                <span style={{ color: 'var(--sb-fg-faint)', fontSize: 11.5 }}>{d.hint}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>{d.color}</span>
              </div>
            ))}
          </div>

          <div className="marker" style={{ marginTop: 28, marginBottom: 8 }}>/// PIN</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--sb-fg-muted)' }}>
            <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 9, color: 'var(--sb-accent)' }}>◉</span>
            pinned tabs sort to position 1 (after grid). settings can't be pinned.
          </div>
        </div>
      </div>

      {/* callouts */}
      <div className="anno" style={{ left: 14, top: 60 }}>
        <div className="anno-text"><span className="num">1</span>red home badge — only red moment in the strip</div>
      </div>
      <div className="anno" style={{ left: 200, top: 60 }}>
        <div className="anno-text"><span className="num">2</span>kind glyph — md / ◉ / ▦ / ⚙</div>
      </div>
      <div className="anno" style={{ left: 200, top: 105 }}>
        <div className="anno-text"><span className="num">3</span>pin marker · sorts to slot 1</div>
      </div>
      <div className="anno" style={{ left: 540, top: 60 }}>
        <div className="anno-text"><span className="num">4</span>active underline borrows kind accent</div>
      </div>
    </div>
  );
}

// ---------- 01c · context menu + drag ----------
function BoardTabsContext() {
  return (
    <div className="frame">
      <FrameTopbar />
      <div style={{
        display: 'flex', height: 36,
        borderBottom: '1px solid var(--sb-line)',
        overflowX: 'auto', position: 'relative',
      }}>
        <ProposedTab kind="grid"     title="hex grid"        active />
        <ProposedTab kind="file"     title="auth-v3.md"      vault="mercury" pinned />
        <ProposedTab kind="file"     title="roadmap.md"      vault="atlas" dragging />
        <ProposedTab kind="memory"   title="mercury · graph" dropBefore />
        <ProposedTab kind="preview"  title="wireframe.png"   vault="atlas" />
        <ProposedTab kind="settings" title="settings" />
      </div>

      {/* drag ghost — replaces the default browser one */}
      <div style={{
        position: 'absolute', left: 380, top: 78,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        background: 'rgba(10,10,10,0.95)',
        border: '1px solid var(--sb-line)',
        borderRadius: 4,
        fontSize: 12, color: 'var(--sb-fg)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(217,59,37,0.3)',
        backdropFilter: 'blur(6px)',
        transform: 'rotate(-1.5deg)',
      }}>
        <GlyphSquare accent="#7fb6d9">md</GlyphSquare>
        roadmap.md
        <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 9, padding: '1px 5px', border: '1px solid var(--sb-line)', borderRadius: 3, color: 'var(--sb-fg-faint)' }}>atlas</span>
      </div>

      {/* right-click menu */}
      <div style={{
        position: 'absolute', left: 220, top: 78, zIndex: 30,
        background: 'rgba(10,10,10,0.97)',
        border: '1px solid var(--sb-line)',
        borderRadius: 4, padding: 4, minWidth: 200,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ padding: '6px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-faint)', letterSpacing: '0.06em', borderBottom: '1px solid var(--sb-line-soft)', marginBottom: 4 }}>
          /// ATLAS/ROADMAP.MD
        </div>
        {[
          { l: 'pin',           kbd: '⌘P',   accent: true },
          { l: 'duplicate',     kbd: '⌘D' },
          { l: 'rename file…',  kbd: 'F2' },
          { l: 'open vault folder' },
          { sep: true },
          { l: 'close',         kbd: '⌘W' },
          { l: 'close others' },
          { l: 'delete file',   kbd: '⌫', danger: true },
        ].map((it, i) => it.sep ? (
          <div key={i} style={{ height: 1, background: 'var(--sb-line-soft)', margin: '4px 6px' }} />
        ) : (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '7px 10px', fontSize: 12,
            color: it.danger ? '#d93b25' : 'var(--sb-fg)',
            borderRadius: 3, cursor: 'pointer',
            background: i === 0 ? 'var(--sb-surface)' : 'transparent',
          }}>
            <span>{it.l}</span>
            {it.kbd && <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>{it.kbd}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '120px 40px 40px', display: 'flex', gap: 48 }}>
        <div style={{ flex: 1, maxWidth: 460 }}>
          <div className="marker" style={{ marginBottom: 8 }}>/// DRAG</div>
          <div style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 }}>
            ghost replaces the browser default — the same chip the strip uses, with a soft red shadow and 1.5° tilt to read as "in transit". drop indicator is a 2px accent bar on the leading edge of the target slot, with a subtle glow.
          </div>
          <div className="marker" style={{ marginBottom: 8 }}>/// PIN BEHAVIOR</div>
          <div style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.6 }}>
            pin moves the tab to slot 1 (right after grid). re-pinning while already pinned simply unpins. settings disables pin in the menu — pinning settings feels weird and the brief flagged it.
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <div className="marker" style={{ marginBottom: 8 }}>/// MENU ITEMS</div>
          <div style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.7 }}>
            file kind: pin / duplicate / rename / open folder / close / close others / delete.<br/>
            memory & preview: pin / duplicate / close / close others.<br/>
            grid: no menu — it's the home tab.<br/>
            settings: close only.
          </div>
        </div>
      </div>

      <div className="anno" style={{ left: 230, top: 250 }}>
        <div className="anno-text"><span className="num">1</span>right-click menu</div>
      </div>
      <div className="anno" style={{ left: 380, top: 130 }}>
        <div className="anno-text"><span className="num">2</span>custom drag ghost</div>
      </div>
      <div className="anno" style={{ left: 540, top: 60 }}>
        <div className="anno-text"><span className="num">3</span>drop indicator with glow</div>
      </div>
    </div>
  );
}

window.BoardTabsCurrent = BoardTabsCurrent;
window.BoardTabsProposed = BoardTabsProposed;
window.BoardTabsContext = BoardTabsContext;
