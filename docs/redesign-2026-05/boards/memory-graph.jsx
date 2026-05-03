// Artboard 03 — Memory graph at two scales.

const NODE_KIND_COLOR = {
  index: '#e6c068',
  log: '#9bd1a4',
  hub: '#7fb6d9',
  entity: '#a89be0',
  concept: '#e89c7f',
  source: '#88c4ce',
  synthesis: '#d9a3c9',
  doc: '#c8c8b8',
  asset: '#7fa8a8',
  skill: '#d4b896',
};

function nodeColor(n) { return n.color || NODE_KIND_COLOR[n.kind] || '#888'; }

function GraphSVG({ data, w, h, focusId, hoverId, showLabels = true, showAll = false, scale = 1 }) {
  const nodeById = Object.fromEntries(data.nodes.map(n => [n.id, n]));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* edges */}
      {data.edges.map(([a, b], i) => {
        const A = nodeById[a], B = nodeById[b];
        if (!A || !B) return null;
        const focused = focusId && (a === focusId || b === focusId);
        return (
          <line key={i}
            x1={A.x * w} y1={A.y * h}
            x2={B.x * w} y2={B.y * h}
            stroke={focused ? '#d93b25' : 'rgba(255,255,255,0.09)'}
            strokeWidth={focused ? 1.2 : 0.6}
          />
        );
      })}

      {/* nodes */}
      {data.nodes.map(n => {
        const c = nodeColor(n);
        const r = n.id === 'index' ? 10 * scale : (n.kind === 'hub' || n.kind === 'entity') ? 7 * scale : 5 * scale;
        const isFocus = focusId === n.id;
        const isHover = hoverId === n.id;
        return (
          <g key={n.id} style={{ cursor: 'pointer' }}>
            {(isFocus || isHover) && (
              <circle cx={n.x * w} cy={n.y * h} r={r + 6} fill="url(#nodeGlow)" />
            )}
            <circle
              cx={n.x * w} cy={n.y * h} r={r}
              fill={c}
              stroke={isFocus ? '#fff' : 'rgba(0,0,0,0.4)'}
              strokeWidth={isFocus ? 1.5 : 0.5}
              opacity={focusId && !isFocus && !data.edges.some(([a,b]) => (a === focusId && b === n.id) || (b === focusId && a === n.id)) ? 0.35 : 1}
            />
            {(showLabels || showAll || isFocus || isHover || n.id === 'index') && (
              <text
                x={n.x * w} y={n.y * h + r + 11 * scale}
                textAnchor="middle"
                fontFamily="var(--sb-font-mono)"
                fontSize={9 * scale}
                fill={isFocus ? '#fff' : 'rgba(255,255,255,0.55)'}
                style={{ pointerEvents: 'none' }}
              >{n.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- 03a · sidebar mini ----------
function BoardMGMini() {
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 26, padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--sb-font-mono)', fontSize: 10,
        color: 'var(--sb-fg-faint)', letterSpacing: '0.06em',
        borderBottom: '1px solid var(--sb-line-soft)',
      }}>
        <span>vault</span>
        <span style={{ color: 'var(--sb-fg-disabled)' }}>›</span>
        <span style={{ color: 'var(--sb-fg-muted)' }}>mercury</span>
        <span style={{ color: 'var(--sb-fg-disabled)' }}>›</span>
        <span style={{ color: 'var(--sb-fg-muted)' }}>graph</span>
        <span style={{ marginLeft: 'auto', color: 'var(--sb-fg-disabled)' }}>14 · 32</span>
      </div>

      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--sb-line-soft)',
      }}>
        <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 16, letterSpacing: '-0.01em' }}>memory</div>
        <div style={{ fontSize: 11, color: 'var(--sb-fg-faint)', marginTop: 2 }}>scroll-zoom · drag node · click expand</div>
      </div>

      <div style={{ position: 'relative', height: 280, background: 'radial-gradient(circle at 50% 50%, rgba(127,182,217,0.04), transparent 70%)' }}>
        <GraphSVG data={window.MOCK.MEMORY_GRAPH_MINI} w={388} h={280} focusId="q3road" scale={0.85} showLabels={false} />

        {/* tooltip on hover */}
        <div style={{
          position: 'absolute', left: 200, top: 56,
          background: 'rgba(10,10,10,0.95)',
          border: '1px solid rgba(232,156,127,0.4)',
          padding: '6px 9px', fontSize: 11, borderRadius: 3,
          fontFamily: 'var(--sb-font-mono)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          <div style={{ color: '#e89c7f' }}>q3-roadmap</div>
          <div style={{ color: 'var(--sb-fg-faint)', fontSize: 10, marginTop: 2 }}>concept · 7 backlinks</div>
        </div>
      </div>

      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--sb-line-soft)',
      }}>
        <div className="marker" style={{ marginBottom: 8 }}>/// LEGEND · COLLAPSED</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 10.5, fontFamily: 'var(--sb-font-mono)' }}>
          {Object.entries(NODE_KIND_COLOR).slice(0, 6).map(([k, c]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--sb-fg-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} /> {k}
            </span>
          ))}
          <span style={{ color: 'var(--sb-fg-disabled)' }}>+4 more</span>
        </div>
      </div>

      <div className="anno" style={{ left: 14, top: 60 }}>
        <div className="anno-text"><span className="num">1</span>focus ring + connected edges in red</div>
      </div>
      <div className="anno" style={{ left: 200, top: 100 }}>
        <div className="anno-text"><span className="num">2</span>per-node color via kind, override-able</div>
      </div>
    </div>
  );
}

// ---------- 03b · full graph ----------
function BoardMGFull() {
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* top chrome — graph kind tab is active */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--sb-line)',
        paddingLeft: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 14px', height: '100%',
          background: 'var(--sb-bg-elev)',
          borderRight: '1px solid var(--sb-line)',
          position: 'relative',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: 2,
            border: '1px solid #a89be0', color: '#a89be0',
            fontFamily: 'var(--sb-font-mono)', fontSize: 9,
          }}>◉</span>
          <span style={{ fontSize: 12 }}>mercury · graph</span>
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 1, background: '#a89be0' }} />
        </div>

        {/* toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 20, fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg-muted)' }}>
          <span>filter:</span>
          {['all','concepts','sources','synthesis','assets'].map((f, i) => (
            <span key={f} style={{
              color: i === 0 ? 'var(--sb-fg)' : 'var(--sb-fg-faint)',
              borderBottom: i === 0 ? '1px solid var(--sb-fg)' : 'none',
              paddingBottom: 2, cursor: 'pointer',
            }}>{f}</span>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', marginRight: 14, display: 'flex', gap: 14, fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg-faint)' }}>
          <span>32 nodes · 36 edges</span>
          <span>−</span>
          <span style={{ color: 'var(--sb-fg)' }}>1.0×</span>
          <span>+</span>
          <span style={{ color: 'var(--sb-fg-disabled)' }}>fit</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* graph canvas */}
        <div style={{ flex: 1, position: 'relative', background: 'radial-gradient(circle at 50% 60%, rgba(168,155,224,0.04), transparent 70%)' }}>
          <GraphSVG data={window.MOCK.MEMORY_GRAPH_BIG} w={1000} h={680} focusId="q3road" scale={1.1} showLabels />
        </div>

        {/* inspector */}
        <div style={{
          width: 280, borderLeft: '1px solid var(--sb-line)',
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 16,
          background: 'rgba(255,255,255,0.012)',
        }}>
          <div>
            <div className="marker">/// SELECTED</div>
            <div style={{
              fontFamily: 'var(--sb-font-display)', fontSize: 20, marginTop: 8,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: '#e89c7f' }} />
              q3-roadmap
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--sb-fg-faint)', marginTop: 2 }}>concept · concepts/q3-roadmap.md</div>
          </div>

          <div>
            <div className="marker" style={{ marginBottom: 6 }}>/// COLOR</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {window.MOCK.PALETTE.map((c, i) => (
                <div key={i} style={{
                  width: 22, height: 22, borderRadius: 4, background: c,
                  border: i === 4 ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--sb-fg-disabled)', marginTop: 8, fontFamily: 'var(--sb-font-mono)' }}>
              override kind default · saves to vault
            </div>
          </div>

          <div>
            <div className="marker" style={{ marginBottom: 8 }}>/// BACKLINKS · 7</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
              {['index','risks','synQ','authv3','synA'].map(id => (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--sb-fg-muted)', cursor: 'pointer',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: '#e89c7f' }} />
                  <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 11 }}>{id}.md</span>
                </div>
              ))}
              <span style={{ color: 'var(--sb-fg-disabled)', fontSize: 10.5, fontFamily: 'var(--sb-font-mono)' }}>+2 more</span>
            </div>
          </div>

          <div>
            <div className="marker" style={{ marginBottom: 8 }}>/// PREVIEW</div>
            <div style={{
              fontFamily: 'var(--sb-font-mono)', fontSize: 11,
              color: 'var(--sb-fg-muted)', lineHeight: 1.55,
              padding: 10, border: '1px solid var(--sb-line-soft)',
              borderRadius: 3, maxHeight: 160, overflow: 'hidden',
              background: 'rgba(255,255,255,0.01)',
            }}>
              # q3 roadmap<br/><br/>
              the bet for q3 is to ship [[concepts/auth-v3]] before vendor lock-in<br/>
              with mercury and onyx. risk register in [[risks]].
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
            <button style={{
              flex: 1, background: 'transparent', border: '1px solid var(--sb-line)',
              color: 'var(--sb-fg-muted)', fontSize: 11, padding: '6px 10px',
              borderRadius: 3, fontFamily: 'var(--sb-font-mono)',
              cursor: 'pointer',
            }}>open file</button>
            <button style={{
              flex: 1, background: 'transparent', border: '1px solid var(--sb-line)',
              color: 'var(--sb-fg-muted)', fontSize: 11, padding: '6px 10px',
              borderRadius: 3, fontFamily: 'var(--sb-font-mono)',
              cursor: 'pointer',
            }}>focus subtree</button>
          </div>
        </div>
      </div>

      <div className="anno" style={{ left: 220, top: 50 }}>
        <div className="anno-text"><span className="num">1</span>filter chips — scope visible kinds</div>
      </div>
      <div className="anno" style={{ left: 1000, top: 50 }}>
        <div className="anno-text"><span className="num">2</span>zoom controls — wheel zooms toward cursor</div>
      </div>
      <div className="anno" style={{ left: 1040, top: 240 }}>
        <div className="anno-text"><span className="num">3</span>per-node color override · saves to vault</div>
      </div>
      <div className="anno" style={{ left: 380, top: 380 }}>
        <div className="anno-text"><span className="num">4</span>focused node + connected edges glow red — only red moment on the canvas</div>
      </div>
    </div>
  );
}

window.BoardMGMini = BoardMGMini;
window.BoardMGFull = BoardMGFull;
