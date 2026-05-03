// Hex grid canvas. Pan/zoom, agents, walls, comms affordances, minimap, modebar.

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const { HEX, axialToPixel, hexPath, HEX_DIRS, hexKey, areAdjacent } = window.SQ;

// Pointy-top axial: producing a *visually* rectangular field.
// For axialToPixel(q, r) = (size·√3·(q + r/2), size·1.5·r), screen-x depends on
// (q + r/2). We pick q = col − floor(r/2) so each row (constant r) lays its
// hexes on a regular column ladder with the standard half-step row offset —
// i.e. the field reads as a wide rectangle on screen, not as a hex blob.
function generateHexFieldRect(cols, rows) {
  const out = [];
  const halfCols = Math.floor(cols / 2);
  const halfRows = Math.floor(rows / 2);
  for (let row = -halfRows; row < rows - halfRows; row++) {
    const qOffset = Math.floor(row / 2);
    for (let col = -halfCols; col < cols - halfCols; col++) {
      out.push({ q: col - qOffset, r: row });
    }
  }
  return out;
}
const HEX_FIELD = generateHexFieldRect(32, 22);

function useActiveComms(agents) {
  return useMemo(() => {
    const live = agents.filter(a => a.status === 'Live');
    const pairs = [];
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++)
        if (areAdjacent(live[i], live[j])) pairs.push([live[i], live[j]]);
    return pairs;
  }, [agents]);
}

/**
 * For each router cluster touched by 2+ Live agents, return all hex-edges that
 * make up the "active wire": every router↔router edge inside the cluster, plus
 * every Live-agent↔router edge where the router is in the cluster. These get
 * rendered as cyan dotted lines with bouncing dots so router-bridged pairs
 * have a visible "you're connected" affordance, just like direct neighbors.
 */
function useActiveRouterSegments(agents, routers) {
  return useMemo(() => {
    if (!routers || routers.length === 0) return [];
    const live = agents.filter(a => a.status === 'Live');
    if (live.length < 2) return [];

    const routerKeys = new Set(routers.map(rt => hexKey(rt.q, rt.r)));
    // Cluster routers via BFS over router-router adjacency.
    const clusterOf = new Map();
    let cid = 0;
    for (const rt of routers) {
      const start = hexKey(rt.q, rt.r);
      if (clusterOf.has(start)) continue;
      const queue = [rt];
      while (queue.length > 0) {
        const cur = queue.shift();
        const ck = hexKey(cur.q, cur.r);
        if (clusterOf.has(ck)) continue;
        clusterOf.set(ck, cid);
        for (const [dq, dr] of HEX_DIRS) {
          const nk = hexKey(cur.q + dq, cur.r + dr);
          if (routerKeys.has(nk) && !clusterOf.has(nk)) {
            queue.push({ q: cur.q + dq, r: cur.r + dr });
          }
        }
      }
      cid += 1;
    }

    // Group routers by cluster + collect Live agents touching each cluster.
    const routersByCluster = new Map();
    for (const rt of routers) {
      const c = clusterOf.get(hexKey(rt.q, rt.r));
      if (c === undefined) continue;
      if (!routersByCluster.has(c)) routersByCluster.set(c, []);
      routersByCluster.get(c).push(rt);
    }
    const agentsByCluster = new Map();
    for (const a of live) {
      const seen = new Set();
      for (const rt of routers) {
        if (areAdjacent(a, rt)) {
          const c = clusterOf.get(hexKey(rt.q, rt.r));
          if (c !== undefined && !seen.has(c)) {
            seen.add(c);
            if (!agentsByCluster.has(c)) agentsByCluster.set(c, []);
            agentsByCluster.get(c).push(a);
          }
        }
      }
    }

    const segments = [];
    for (const [c, agList] of agentsByCluster) {
      if (agList.length < 2) continue; // single agent doesn't activate the wire
      const rts = routersByCluster.get(c) || [];
      // router ↔ router edges in this cluster
      for (let i = 0; i < rts.length; i++) {
        for (let j = i + 1; j < rts.length; j++) {
          if (areAdjacent(rts[i], rts[j])) segments.push({ a: rts[i], b: rts[j] });
        }
      }
      // agent ↔ router edges (only for the Live agents in this cluster)
      for (const ag of agList) {
        for (const rt of rts) {
          if (areAdjacent(ag, rt)) segments.push({ a: ag, b: rt });
        }
      }
    }
    return segments;
  }, [agents, routers]);
}

function RouterWire({ a, b, t }) {
  const pa = axialToPixel(a.q, a.r);
  const pb = axialToPixel(b.q, b.r);
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  const px = -dy / len, py = dx / len;
  const half = HEX.size * 0.5;
  const x1 = mx + px * half, y1 = my + py * half;
  const x2 = mx - px * half, y2 = my - py * half;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(127,182,217,0.45)" strokeWidth="1" strokeDasharray="2 4" />
      {Array.from({ length: 2 }).map((_, i) => {
        const phase = ((t / 80) + i / 2) % 1;
        const x = x1 + (x2 - x1) * phase;
        const y = y1 + (y2 - y1) * phase;
        return <circle key={i} cx={x} cy={y} r="1.6" fill="#7fb6d9" />;
      })}
    </g>
  );
}

// ---------- HexCell ----------
function HexCell({ q, r, agent, isWall, isRouter, focused, hovered, mode, onClick, onAgentMouseDown, onAgentContextMenu, onAgentEnter, onAgentLeave, isFarZoom, displayPos }) {
  const basePos = axialToPixel(q, r);
  const x = displayPos ? displayPos.x : basePos.x;
  const y = displayPos ? displayPos.y : basePos.y;
  const breathe = agent && (agent.state === 'thinking' || agent.state === 'tool-running' || agent.state === 'awaiting-input');
  const justSpawned = agent && agent._spawnedAt && (Date.now() - agent._spawnedAt) < 600;

  // hover preview tint per-mode
  let hoverFill = null;
  if (hovered && !agent && !isWall && !isRouter) {
    if (mode === 'spawn')       hoverFill = 'rgba(217,59,37,0.10)';
    else if (mode === 'wall')   hoverFill = 'rgba(255,255,255,0.06)';
    else if (mode === 'router') hoverFill = 'rgba(127,182,217,0.10)';
  }
  if (hovered && isWall   && mode === 'wall')   hoverFill = 'rgba(217,59,37,0.10)';
  if (hovered && isRouter && mode === 'router') hoverFill = 'rgba(217,59,37,0.10)';
  if (hovered && (agent || isWall || isRouter) && mode === 'erase') hoverFill = 'rgba(217,59,37,0.15)';
  // Mutual-exclusion previews — placing a wall on a router (or vice versa) replaces.
  if (hovered && isRouter && mode === 'wall') hoverFill = 'rgba(255,255,255,0.10)';
  if (hovered && isWall   && mode === 'router') hoverFill = 'rgba(127,182,217,0.10)';

  const cursor = (mode === 'select' && agent) ? 'grab'
    : (mode === 'spawn'  && !agent && !isWall && !isRouter) ? 'cell'
    : (mode === 'wall')   ? 'crosshair'
    : (mode === 'router') ? 'crosshair'
    : (mode === 'erase' && (agent || isWall || isRouter)) ? 'not-allowed'
    : 'pointer';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseDown={(e) => { if (agent) onAgentMouseDown(e, agent); }}
      onContextMenu={(e) => { if (agent) { e.preventDefault(); e.stopPropagation(); onAgentContextMenu(e, agent); } }}
      onMouseEnter={() => agent && onAgentEnter && onAgentEnter(agent)}
      onMouseLeave={() => agent && onAgentLeave && onAgentLeave()}
      onClick={(e) => { e.stopPropagation(); onClick({ q, r }); }}
      style={{ cursor, opacity: justSpawned ? 0 : 1, transition: 'opacity 400ms ease-out' }}
    >
      {isWall ? (
        <>
          <path d={hexPath()} fill="#1a1a1a" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <path d={hexPath()} fill="url(#wallHatch)" />
          {hoverFill && <path d={hexPath()} fill={hoverFill} />}
        </>
      ) : isRouter ? (
        <>
          {/* router: light woven pattern + soft cyan ring + slow pulse */}
          <path d={hexPath()} fill="rgba(127,182,217,0.06)" stroke="rgba(127,182,217,0.55)" strokeWidth="1.4" strokeDasharray="3 2" />
          <path d={hexPath()} fill="url(#routerDots)" />
          <path d={hexPath()} fill="none" stroke="rgba(127,182,217,0.35)" strokeWidth="1" style={{ animation: 'breathe 3s ease-in-out infinite' }} />
          {hoverFill && <path d={hexPath()} fill={hoverFill} />}
        </>
      ) : agent ? (
        <>
          {breathe && (
            <path d={hexPath()} fill="none" stroke={agent.color} strokeWidth="1" opacity="0.5" style={{ animation: 'breathe 2.4s ease-in-out infinite' }} />
          )}
          <path
            d={hexPath()}
            fill={agent.status === 'Draft' ? 'transparent' : agent.color + '22'}
            stroke={focused ? '#d93b25' : (agent.status === 'Draft' ? 'rgba(255,255,255,0.2)' : agent.color)}
            strokeWidth={focused ? 2 : 1.2}
            strokeDasharray={agent.status === 'Draft' ? '4 4' : ''}
          />
          {agent.state === 'moving' && (
            <path d={hexPath()} fill="none" stroke={agent.color} strokeWidth="2" style={{ animation: 'hexring-pulse 1.4s ease-out infinite' }} />
          )}
          {/* boot flash */}
          {agent._bootedAt && (Date.now() - agent._bootedAt) < 1000 && (
            <path d={hexPath()} fill="none" stroke="#2a8c4a" strokeWidth="2.5" style={{ animation: 'bootflash 1s ease-out forwards' }} />
          )}
          <foreignObject x={-HEX.size} y={-HEX.size} width={HEX.size * 2} height={HEX.size * 2} style={{ pointerEvents: 'none' }}>
            <div xmlns="http://www.w3.org/1999/xhtml" style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--sb-font-display)',
              fontSize: agent.status === 'Draft' ? 22 : 26,
              lineHeight: 1,
              color: agent.status === 'Draft' ? 'rgba(255,255,255,0.55)' : agent.color,
              userSelect: 'none',
            }}>{agent.glyph}</div>
          </foreignObject>
          {!isFarZoom && (
            <text x="0" y={HEX.size * 0.62}
              fontFamily="var(--sb-font-mono)"
              fontSize="10"
              fill="rgba(255,255,255,0.85)"
              textAnchor="middle"
              style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: '0.04em' }}
            >{agent.name.toUpperCase()}</text>
          )}
          <circle cx={HEX.size * 0.55} cy={-HEX.size * 0.55} r="3.5"
            fill={agent.status === 'Draft' ? '#525252' : (agent.state === 'errored' ? '#d93b25' : agent.state === 'awaiting-input' ? '#e6c068' : '#2a8c4a')}
          />
        </>
      ) : (
        <>
          <path d={hexPath()} fill={hoverFill || 'transparent'} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        </>
      )}
    </g>
  );
}

// Comm edge with toggle dot at midpoint.
function CommEdge({ a, b, t, edgeState, onClickEdge }) {
  const pa = axialToPixel(a.q, a.r);
  const pb = axialToPixel(b.q, b.r);
  const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  const px = -dy / len, py = dx / len;
  const half = HEX.size * 0.5;
  const x1 = mx + px * half, y1 = my + py * half;
  const x2 = mx - px * half, y2 = my - py * half;
  const enabled = !edgeState || edgeState.commsEnabled !== false;
  const stroke = enabled ? 'rgba(217,59,37,0.4)' : 'rgba(255,255,255,0.18)';
  const dotColor = enabled ? '#d93b25' : 'rgba(255,255,255,0.3)';

  // Two parallel lanes offset perpendicular to the edge for bidirectional dot traffic.
  const laneOffset = 3.5;
  const lane = (sign) => ({
    x1: x1 + (dx / len) * sign * laneOffset,
    y1: y1 + (dy / len) * sign * laneOffset,
    x2: x2 + (dx / len) * sign * laneOffset,
    y2: y2 + (dy / len) * sign * laneOffset,
  });
  const laneA = lane(+1);
  const laneB = lane(-1);

  return (
    <g>
      {enabled && (
        <>
          <line x1={laneA.x1} y1={laneA.y1} x2={laneA.x2} y2={laneA.y2} stroke={stroke} strokeWidth="1" strokeDasharray="2 4" />
          <line x1={laneB.x1} y1={laneB.y1} x2={laneB.x2} y2={laneB.y2} stroke={stroke} strokeWidth="1" strokeDasharray="2 4" />
        </>
      )}
      {!enabled && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.2" strokeDasharray="3 4" />
      )}
      {enabled && Array.from({ length: 2 }).map((_, i) => {
        // Lane A: forward (a → b)
        const phase = ((t / 60) + i / 2) % 1;
        const x = laneA.x1 + (laneA.x2 - laneA.x1) * phase;
        const y = laneA.y1 + (laneA.y2 - laneA.y1) * phase;
        return <circle key={'a' + i} cx={x} cy={y} r="2" fill={dotColor} />;
      })}
      {enabled && Array.from({ length: 2 }).map((_, i) => {
        // Lane B: reverse (b → a)
        const phase = ((t / 60) + i / 2) % 1;
        const x = laneB.x2 + (laneB.x1 - laneB.x2) * phase;
        const y = laneB.y2 + (laneB.y1 - laneB.y2) * phase;
        return <circle key={'b' + i} cx={x} cy={y} r="2" fill={dotColor} />;
      })}
      {/* edge-toggle dot at midpoint */}
      <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onClickEdge(e, a, b); }}>
        <circle cx={mx} cy={my} r="9" fill="rgba(10,10,10,0.85)" stroke="rgba(255,255,255,0.2)" />
        <text x={mx} y={my + 3} textAnchor="middle" fontFamily="var(--sb-font-mono)" fontSize="9" fill="rgba(255,255,255,0.7)">⋯</text>
      </g>
    </g>
  );
}

function ModeBar({ mode, setMode, shortcuts }) {
  const sc = shortcuts || { select: '1', spawn: '2', wall: '3', router: '4', erase: '5' };
  const items = [
    { id: 'select', label: 'Select', icon: I.cursor },
    { id: 'spawn',  label: 'Spawn',  icon: I.spawn  },
    { id: 'wall',   label: 'Wall',   icon: I.wall   },
    { id: 'router', label: 'Router', icon: I.router },
    { id: 'erase',  label: 'Erase',  icon: I.erase  },
  ];
  return (
    <div className="modebar">
      {items.map(it => {
        const Ico = it.icon || null;
        return (
          <button key={it.id} className={mode === it.id ? `active ${it.id}` : ''} onClick={() => setMode(it.id)}>
            {Ico ? <Ico /> : <span style={{ width: 14, display: 'inline-block' }} />} {it.label} <span className="kbd">{sc[it.id] || ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Minimap({ agents, walls, routers, viewport, fieldBounds }) {
  const W = 180, H = 130 - 22;
  const pad = 6;
  const minX = fieldBounds.minX - 60, maxX = fieldBounds.maxX + 60;
  const minY = fieldBounds.minY - 60, maxY = fieldBounds.maxY + 60;
  const sx = (W - pad * 2) / (maxX - minX);
  const sy = (H - pad * 2) / (maxY - minY);
  const s = Math.min(sx, sy);
  const ox = pad + ((W - pad * 2) - (maxX - minX) * s) / 2;
  const oy = pad + ((H - pad * 2) - (maxY - minY) * s) / 2;
  const proj = (x, y) => ({ x: ox + (x - minX) * s, y: oy + (y - minY) * s });
  const vw = viewport.width / viewport.zoom;
  const vh = viewport.height / viewport.zoom;
  const cx = -viewport.panX / viewport.zoom + viewport.width / (2 * viewport.zoom);
  const cy = -viewport.panY / viewport.zoom + viewport.height / (2 * viewport.zoom);
  const tl = proj(cx - vw / 2, cy - vh / 2);
  const tr = proj(cx + vw / 2, cy - vh / 2);
  const bl = proj(cx - vw / 2, cy + vh / 2);

  // Each tile renders as a scaled-down hex path, centered at the projected
  // hex center. Reusing `hexPath()` (which draws a pointy-top hex around 0,0
  // with radius HEX.size) and applying scale(s) gives us tiles whose edges
  // align with their neighbors — adjacent walls/routers read as a continuous
  // shape rather than dotted clusters.
  const tileTransform = (q, r) => {
    const { x, y } = axialToPixel(q, r);
    const p = proj(x, y);
    return `translate(${p.x}, ${p.y}) scale(${s})`;
  };

  const safeRouters = routers || [];
  return (
    <div className="minimap">
      <div className="mm-head">
        <span>/// MAP</span>
        <span>
          {agents.length}a · {walls.length}w
          {safeRouters.length > 0 ? ` · ${safeRouters.length}r` : ''}
        </span>
      </div>
      <div className="mm-body">
        <svg width={W} height={H}>
          {walls.map(w => (
            <g key={'w-' + hexKey(w.q, w.r)} transform={tileTransform(w.q, w.r)}>
              <path d={hexPath()} fill="rgba(255,255,255,0.32)" />
            </g>
          ))}
          {safeRouters.map(rt => (
            <g key={'r-' + hexKey(rt.q, rt.r)} transform={tileTransform(rt.q, rt.r)}>
              <path d={hexPath()} fill="rgba(127,182,217,0.55)" />
            </g>
          ))}
          {agents.map(a => (
            <g key={a.id} transform={tileTransform(a.q, a.r)}>
              <path d={hexPath()}
                fill={a.color}
                opacity={a.status === 'Draft' ? 0.45 : 0.9}
                stroke={a.status === 'Live' ? a.color : 'rgba(255,255,255,0.4)'}
                strokeWidth={1 / s}
              />
            </g>
          ))}
          {/* viewport rectangle */}
          <rect x={tl.x} y={tl.y} width={Math.max(0, tr.x - tl.x)} height={Math.max(0, bl.y - tl.y)}
            fill="rgba(217,59,37,0.08)" stroke="rgba(217,59,37,0.7)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

// ---------- Edge popover ----------
function EdgePopover({ pos, edgeState, onChange, onClose }) {
  if (!pos) return null;
  return (
    <div style={{
      position: 'absolute', left: pos.x, top: pos.y, transform: 'translate(-50%, -110%)',
      background: 'rgba(10,10,10,0.95)', border: '1px solid var(--sb-line)', borderRadius: 6,
      padding: 12, width: 240, zIndex: 50, backdropFilter: 'blur(8px)',
    }} onClick={(e) => e.stopPropagation()}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>/// EDGE · {edgeState.aName} ↔ {edgeState.bName}</div>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12, color: 'var(--sb-fg-muted)', cursor: 'pointer' }}>
        <span>autonomous comms</span>
        <input type="checkbox" checked={edgeState.commsEnabled !== false} onChange={(e) => onChange({ commsEnabled: e.target.checked })} />
      </label>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12, color: 'var(--sb-fg-muted)', cursor: 'pointer' }}>
        <span>cross-vault read</span>
        <input type="checkbox" checked={edgeState.vaultRead !== false} onChange={(e) => onChange({ vaultRead: e.target.checked })} />
      </label>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--sb-line-soft)', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>
        per-edge · sticks while adjacent
      </div>
      <button onClick={onClose} style={{ position: 'absolute', top: 6, right: 6, background: 'transparent', border: 'none', color: 'var(--sb-fg-faint)', cursor: 'pointer' }}>×</button>
    </div>
  );
}

// ---------- Context menu ----------
function ContextMenu({ pos, agent, onAction, onClose }) {
  if (!pos || !agent) return null;
  const items = [
    { id: 'focus', label: 'focus' },
    { id: 'message', label: 'message…' },
    { id: 'walk',  label: 'walk to random free hex' },
    { id: 'pause', label: 'pause / resume' },
    { id: 'rename', label: 'rename' },
    { id: 'duplicate', label: 'duplicate' },
    { id: 'kill', label: 'kill agent', danger: true },
  ];
  return (
    <div style={{
      position: 'absolute', left: pos.x, top: pos.y, zIndex: 60,
      background: 'rgba(10,10,10,0.97)', border: '1px solid var(--sb-line)',
      borderRadius: 4, padding: 4, minWidth: 160, backdropFilter: 'blur(8px)',
    }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: '6px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-faint)', letterSpacing: '0.06em', borderBottom: '1px solid var(--sb-line-soft)', marginBottom: 4 }}>
        /// {agent.name.toUpperCase()}
      </div>
      {items.map(it => (
        <button key={it.id}
          onClick={() => { onAction(it.id); onClose(); }}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: 'transparent', border: 'none',
            color: it.danger ? '#d93b25' : 'var(--sb-fg)',
            padding: '7px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 3,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sb-surface)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >{it.label}</button>
      ))}
    </div>
  );
}

// ---------- Tooltip ----------
function AgentTooltip({ agent, pos }) {
  if (!agent || !pos) return null;
  return (
    <div style={{
      position: 'absolute', left: pos.x + 14, top: pos.y + 14, zIndex: 40,
      pointerEvents: 'none',
      background: 'rgba(10,10,10,0.95)', border: '1px solid var(--sb-line)',
      borderRadius: 4, padding: '8px 10px', backdropFilter: 'blur(6px)',
      minWidth: 180,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: agent.color, display: 'inline-block' }}></span>
        <span style={{ fontFamily: 'var(--sb-font-display)', fontSize: 13, letterSpacing: '-0.01em' }}>{agent.name}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--sb-font-mono)', fontSize: 9, color: agent.status === 'Draft' ? 'var(--sb-fg-faint)' : '#2a8c4a', letterSpacing: '0.06em' }}>
          {agent.status === 'Draft' ? 'DRAFT' : agent.state.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--sb-fg-muted)', marginBottom: 3 }}>{agent.task}</div>
      <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-faint)', letterSpacing: '0.04em' }}>
        q={agent.q} r={agent.r} · {agent.model} · {agent.msgs}m / {agent.tools}t
      </div>
    </div>
  );
}

// ---------- HexGrid ----------

// Phrases agents say while working — keyed by state, with name-substitutions for variety.
const AGENT_UTTERANCES = {
  thinking: [
    'mm let me think…', 'reading the diff', 'checking my notes',
    'one sec', 'what was that…', 'looking at the trace',
    'got it — almost', 'planning the steps',
  ],
  'tool-running': [
    'running tests…', 'grep -r in repo', 'reading the file',
    'opening pr...', 'piping to jq', 'wc -l on output',
    'curl-ing the api', 'parsing json',
  ],
  moving: [
    'walking over to ya', 'on my way', 'coming around the wall',
    'two hexes out', 'hold up — moving',
  ],
  'awaiting-input': [
    'waiting on you', 'need a yes/no', 'should i proceed?',
    'paused — your call', 'blocked on review',
  ],
  paused: ['paused', '— zzz —', 'standing by'],
  errored: ['something broke', '⚠ stack trace', '⚠ retry pending'],
  idle: [],
};

// Stable random-pick: hash agentId + state + slot → choose a phrase deterministically per slot.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function utteranceFor(agent, slot, recentText) {
  // Prefer the agent's actual recent assistant text when we have it — much more
  // alive than the canned per-state phrases.
  if (recentText && typeof recentText === 'string' && recentText.trim().length > 0) {
    const cleaned = recentText.replace(/\s+/g, ' ').trim();
    const SPAN = 48;            // narrower window
    const STRIDE = 22;
    if (cleaned.length <= SPAN) return cleaned;

    const max = cleaned.length - SPAN;
    let start = Math.min(max, (slot * STRIDE) % (max + STRIDE));
    let end = start + SPAN;

    // Snap start forward to the next whitespace (so we don't begin mid-word).
    if (start > 0) {
      const nextSpace = cleaned.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace - start < 12) start = nextSpace + 1;
    }
    // Snap end backward to the previous whitespace inside the window.
    if (end < cleaned.length) {
      const prevSpace = cleaned.lastIndexOf(' ', end);
      if (prevSpace > start + 12) end = prevSpace;
    }

    const lead = start > 0 ? '…' : '';
    const tail = end < cleaned.length ? '…' : '';
    return lead + cleaned.slice(start, end).trim() + tail;
  }
  const list = AGENT_UTTERANCES[agent.state] || [];
  if (!list.length) return null;
  const idx = hashStr(agent.id + ':' + agent.state + ':' + slot) % list.length;
  return list[idx];
}

// Tiny hook: ticks every 4s so utterances rotate while agents work.
function useUtteranceSlot() {
  const [slot, setSlot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlot(s => s + 1), 4000);
    return () => clearInterval(id);
  }, []);
  return slot;
}

// SVG-positioned speech bubble. Width auto-sizes via measured text.
function SpeechBubble({ x, y, text, accent }) {
  const [w, setW] = useState(0);
  const textRef = useRef(null);
  useEffect(() => {
    if (textRef.current) setW(Math.ceil(textRef.current.getComputedTextLength()) + 18);
  }, [text]);
  if (!text) return null;
  const h = 22;
  const bx = x - w / 2;
  const by = y - HEX.size - 6 - h;
  return (
    <g style={{ pointerEvents: 'none', animation: 'bubble-in 240ms var(--sb-ease) both' }}>
      <rect x={bx} y={by} width={w} height={h} rx="4" ry="4"
        fill="rgba(10,10,10,0.92)" stroke={accent || 'rgba(255,255,255,0.18)'} strokeWidth="1" />
      {/* tail pointing down to the agent */}
      <path d={`M ${x - 4} ${by + h} L ${x} ${by + h + 5} L ${x + 4} ${by + h} Z`}
        fill="rgba(10,10,10,0.92)" stroke={accent || 'rgba(255,255,255,0.18)'} strokeWidth="1" />
      <text ref={textRef} x={x} y={by + h / 2 + 1}
        fontFamily="var(--sb-font-mono)" fontSize="10.5"
        fill="rgba(255,255,255,0.92)" textAnchor="middle" dominantBaseline="central"
        style={{ letterSpacing: '0.02em' }}
      >{text}</text>
    </g>
  );
}

function HexGrid({
  agents, setAgents,
  walls, setWalls,
  routers, setRouters,
  focusedAgentId, setFocusedAgentId,
  mode, setMode,
  killed,
  edgeStates, setEdgeStates,
  loopFlag,
  shortcuts,         // { [actionId]: keyString }
  onSpawnAt,         // (q, r) → daemon create-agent
  onMoveAgent,       // (id, q, r) → daemon update-agent
  onDeleteAgent,     // (id) → daemon delete-agent
  onPlaceFeature,    // (q, r, kind) → daemon place-feature
  onRemoveFeature,   // (q, r) → daemon remove-feature
  agentRecentText,   // { [agentId]: string } — last assistant text for speech bubbles
}) {
  const wrapRef = useRef(null);
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1, width: 0, height: 0 });
  const [t, setT] = useState(0);
  const [drag, setDrag] = useState(null);
  const [hoverHex, setHoverHex] = useState(null);
  const [hoverAgent, setHoverAgent] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [edgePop, setEdgePop] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  /** During a paint-drag, hex keys we've already acted on this stroke. */
  const paintedRef = useRef(new Set());

  // Animation tick.
  useEffect(() => {
    let raf;
    const loop = () => { setT(p => p + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const utteranceSlot = useUtteranceSlot();

  // Resize observer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setViewport(v => ({ ...v, width: r.width, height: r.height,
        panX: v.panX || r.width / 2, panY: v.panY || r.height / 2 }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wallSet   = useMemo(() => new Set(walls.map(w => hexKey(w.q, w.r))), [walls]);
  const routerSet = useMemo(() => new Set((routers || []).map(rt => hexKey(rt.q, rt.r))), [routers]);
  const agentByHex = useMemo(() => {
    const m = new Map();
    agents.forEach(a => m.set(hexKey(a.q, a.r), a));
    return m;
  }, [agents]);

  const activePairs = useActiveComms(agents);
  const activeRouterSegments = useActiveRouterSegments(agents, routers);
  const fieldBounds = useMemo(() => {
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    HEX_FIELD.forEach(({q, r}) => {
      const { x, y } = axialToPixel(q, r);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    return { minX, maxX, minY, maxY };
  }, []);

  const isFarZoom = viewport.zoom < 0.7;

  // Animate moving agents — interpolate display position per frame.
  // Duration must finish a few ms before the next daemon step arrives, otherwise
  // adjacent steps interrupt mid-ease and the slide judders. Daemon's WALK_STEP_MS
  // is currently 550ms, so 520ms here leaves a 30ms settle.
  const displayPositions = useMemo(() => {
    const map = new Map();
    agents.forEach(a => {
      if (a._walkFrom && a._walkAt) {
        const elapsed = Date.now() - a._walkAt;
        const dur = a.state === 'moving' ? 520 : 800;
        const k = Math.min(1, elapsed / dur);
        // Cubic ease-in-out for a smoother glide than quadratic.
        const ease = k < 0.5
          ? 4 * k * k * k
          : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const from = axialToPixel(a._walkFrom.q, a._walkFrom.r);
        const to = axialToPixel(a.q, a.r);
        map.set(a.id, { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease });
      }
    });
    return map;
    // eslint-disable-next-line
  }, [agents, t]);

  const onWheel = (e) => {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setViewport(v => {
      const newZoom = Math.max(0.4, Math.min(2.2, v.zoom * factor));
      const wx = (mx - v.panX) / v.zoom;
      const wy = (my - v.panY) / v.zoom;
      return { ...v, zoom: newZoom, panX: mx - wx * newZoom, panY: my - wy * newZoom };
    });
  };

  /** Paint a single hex according to the current mode. Idempotent within a stroke. */
  const paintHex = (hex) => {
    const k = hexKey(hex.q, hex.r);
    if (paintedRef.current.has(k)) return;
    paintedRef.current.add(k);

    const agent = agentByHex.get(k);
    const isWall = wallSet.has(k);
    const isRouter = routerSet.has(k);

    if (mode === 'wall') {
      if (agent) return;            // never paint over an agent
      if (isWall) return;           // already a wall — drag-over is a no-op (don't toggle off)
      if (onPlaceFeature) onPlaceFeature(hex.q, hex.r, 'wall');
    } else if (mode === 'router') {
      if (agent) return;
      if (isRouter) return;
      if (onPlaceFeature) onPlaceFeature(hex.q, hex.r, 'router');
    } else if (mode === 'erase') {
      // Drag-erase only removes features, never agents — too easy to lose them otherwise.
      if (!agent && (isWall || isRouter) && onRemoveFeature) onRemoveFeature(hex.q, hex.r);
    }
  };

  const onCanvasMouseDown = (e) => {
    setEdgePop(null); setCtxMenu(null);
    if (mode === 'wall' || mode === 'router' || mode === 'erase') {
      // Paint stroke. mouseDown paints the starting hex; mouseMove paints subsequent hexes.
      paintedRef.current = new Set();
      setDrag({ type: 'paint', kind: mode, startX: e.clientX, startY: e.clientY });
      const hex = pixelToHex(e.clientX, e.clientY);
      if (hex) paintHex(hex);
      return;
    }
    setDrag({ type: 'pan', startX: e.clientX, startY: e.clientY, panX: viewport.panX, panY: viewport.panY });
  };

  const onMouseMove = (e) => {
    // hover hex tracking for previews
    const hex = pixelToHex(e.clientX, e.clientY);
    setHoverHex(hex);
    if (hoverAgent) {
      const r = wrapRef.current.getBoundingClientRect();
      setHoverPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
    if (!drag) return;
    if (drag.type === 'pan') {
      setViewport(v => ({ ...v, panX: drag.panX + (e.clientX - drag.startX), panY: drag.panY + (e.clientY - drag.startY) }));
    } else if (drag.type === 'agent') {
      setDrag(d => ({ ...d, mouseX: e.clientX, mouseY: e.clientY }));
    } else if (drag.type === 'paint') {
      const hex2 = pixelToHex(e.clientX, e.clientY);
      if (hex2) paintHex(hex2);
    }
  };

  const onMouseUp = (e) => {
    if (drag && drag.type === 'agent') {
      const dx = (e.clientX - drag.startX), dy = (e.clientY - drag.startY);
      const moved2 = dx*dx + dy*dy;
      // Treat as a click (focus agent) if barely any movement occurred.
      if (moved2 < 16) {
        const a = agents.find(x => x.id === drag.agentId);
        if (a) handleHexClick({ q: a.q, r: a.r });
        setDrag(null);
        return;
      }
      const hex = pixelToHex(e.clientX, e.clientY);
      if (hex) {
        const occupied = agents.some(a => a.id !== drag.agentId && a.q === hex.q && a.r === hex.r);
        const isWall   = wallSet.has(hexKey(hex.q, hex.r));
        const isRouter = routerSet.has(hexKey(hex.q, hex.r));
        const moved = !(occupied || isWall || isRouter) && (hex.q !== drag.fromQ || hex.r !== drag.fromR);
        if (moved) {
          // Optimistic walk animation locally, then daemon update + rebroadcast.
          setAgents(prev => prev.map(a => a.id === drag.agentId
            ? { ...a, _walkFrom: { q: a.q, r: a.r }, _walkAt: Date.now(), q: hex.q, r: hex.r, state: 'idle' }
            : a));
          if (onMoveAgent) onMoveAgent(drag.agentId, hex.q, hex.r);
        }
      }
    }
    setDrag(null);
  };

  const pixelToHex = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = (clientX - r.left - viewport.panX) / viewport.zoom;
    const y = (clientY - r.top - viewport.panY) / viewport.zoom;
    const q = (Math.sqrt(3)/3 * x - 1/3 * y) / HEX.size;
    const rr = (2/3 * y) / HEX.size;
    let xq = q, xr = rr, xs = -q - rr;
    let rq = Math.round(xq), rr2 = Math.round(xr), rs = Math.round(xs);
    const dq = Math.abs(rq - xq), dr = Math.abs(rr2 - xr), ds = Math.abs(rs - xs);
    if (dq > dr && dq > ds) rq = -rr2 - rs;
    else if (dr > ds) rr2 = -rq - rs;
    return { q: rq, r: rr2 };
  };

  const handleHexClick = (hex) => {
    const k = hexKey(hex.q, hex.r);
    const agent = agentByHex.get(k);
    const isWall   = wallSet.has(k);
    const isRouter = routerSet.has(k);
    // Wall / Router / Erase are paint-driven now (mouseDown places, drag continues).
    // Skip the click path so a no-movement click doesn't double-fire.
    if (mode === 'wall' || mode === 'router' || mode === 'erase') {
      // One exception: click on an agent in Erase mode still deletes the agent
      // (drag-erase intentionally never touches agents — too risky).
      if (mode === 'erase' && agent) {
        if (onDeleteAgent) onDeleteAgent(agent.id);
        else setAgents(prev => prev.filter(a => a.id !== agent.id));
        if (focusedAgentId === agent.id) setFocusedAgentId(null);
      }
      return;
    }
    if (mode === 'select') { if (agent) setFocusedAgentId(agent.id); return; }
    if (mode === 'spawn') {
      if (agent || isWall || isRouter) { if (agent) setFocusedAgentId(agent.id); return; }
      // Daemon owns id/name/color/glyph assignment + persistence. Server broadcasts
      // agent-created back to all clients which appends to local state.
      if (onSpawnAt) {
        onSpawnAt(hex.q, hex.r);
      } else {
        // Fallback (e.g., daemon disconnected): client-only Draft so the UI isn't frozen.
        const usedColors = new Set(agents.map(a => a.color));
        const color = window.SQ.AGENT_PALETTE.find(c => !usedColors.has(c)) || window.SQ.AGENT_PALETTE[0];
        const id = 'local-' + Math.random().toString(36).slice(2, 7);
        setAgents(prev => [...prev, {
          id, name: 'Untitled', glyph: '◇', color, q: hex.q, r: hex.r,
          status: 'Draft', state: 'idle', model: '', sysPrompt: '', vault: 'untitled',
          msgs: 0, tools: 0, lastAt: '—', task: 'offline draft',
          _spawnedAt: Date.now(),
        }]);
        setFocusedAgentId(id);
      }
      return;
    }
    if (mode === 'wall') {
      if (agent) return;
      // Daemon-routed (M3): server upserts into world_features and broadcasts.
      // Mutual exclusion handled server-side via PRIMARY KEY (q, r).
      if (onPlaceFeature) {
        if (isWall) onRemoveFeature?.(hex.q, hex.r);  // toggle off
        else onPlaceFeature(hex.q, hex.r, 'wall');
        return;
      }
      // Fallback (offline): client-only toggle.
      setWalls(prev => {
        const has = prev.some(w => w.q === hex.q && w.r === hex.r);
        return has ? prev.filter(w => !(w.q === hex.q && w.r === hex.r)) : [...prev, { q: hex.q, r: hex.r }];
      });
      return;
    }
    if (mode === 'router') {
      if (agent) return;
      if (onPlaceFeature) {
        if (isRouter) onRemoveFeature?.(hex.q, hex.r);
        else onPlaceFeature(hex.q, hex.r, 'router');
        return;
      }
      setRouters(prev => {
        const has = prev.some(rt => rt.q === hex.q && rt.r === hex.r);
        return has ? prev.filter(rt => !(rt.q === hex.q && rt.r === hex.r)) : [...prev, { q: hex.q, r: hex.r }];
      });
      return;
    }
    if (mode === 'erase') {
      if (agent) {
        if (onDeleteAgent) {
          onDeleteAgent(agent.id);
        } else {
          setAgents(prev => prev.filter(a => a.id !== agent.id));
        }
        if (focusedAgentId === agent.id) setFocusedAgentId(null);
      } else if (isWall || isRouter) {
        if (onRemoveFeature) onRemoveFeature(hex.q, hex.r);
        else if (isWall) setWalls(prev => prev.filter(w => !(w.q === hex.q && w.r === hex.r)));
        else if (isRouter) setRouters(prev => prev.filter(rt => !(rt.q === hex.q && rt.r === hex.r)));
      }
    }
  };

  const handleAgentMouseDown = (e, agent) => {
    // Allow dragging an agent in any mode; canvas pan is suppressed via stopPropagation.
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag({ type: 'agent', agentId: agent.id, fromQ: agent.q, fromR: agent.r,
      startX: e.clientX, startY: e.clientY, mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleEdgeClick = (e, a, b) => {
    const key = [a.id, b.id].sort().join('|');
    const r = wrapRef.current.getBoundingClientRect();
    const mid = { x: (axialToPixel(a.q,a.r).x + axialToPixel(b.q,b.r).x)/2, y: (axialToPixel(a.q,a.r).y + axialToPixel(b.q,b.r).y)/2 };
    const screenX = mid.x * viewport.zoom + viewport.panX;
    const screenY = mid.y * viewport.zoom + viewport.panY;
    setEdgePop({ key, x: screenX, y: screenY, aName: a.name, bName: b.name });
  };

  const handleAgentContextMenu = (e, agent) => {
    const r = wrapRef.current.getBoundingClientRect();
    setCtxMenu({ agent, pos: { x: e.clientX - r.left, y: e.clientY - r.top } });
  };
  const handleCtxAction = (action) => {
    const a = ctxMenu.agent;
    if (action === 'focus') setFocusedAgentId(a.id);
    if (action === 'kill') {
      // Route through the daemon — local-only filter would be undone by the
      // next world-snapshot. The daemon broadcasts agent-deleted back.
      if (onDeleteAgent) onDeleteAgent(a.id);
      else setAgents(prev => prev.filter(x => x.id !== a.id));
      if (focusedAgentId === a.id) setFocusedAgentId(null);
    }
    if (action === 'rename') {
      const n = prompt('rename agent', a.name);
      if (n && n.trim()) setAgents(prev => prev.map(x => x.id === a.id ? { ...x, name: n.trim() } : x));
    }
    if (action === 'duplicate') {
      // find a free adjacent hex
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
      let target = null;
      for (const [dq, dr] of dirs) {
        const nq = a.q + dq, nr = a.r + dr;
        const occupied = agents.some(o => o.q === nq && o.r === nr);
        const isW = wallSet.has(hexKey(nq, nr));
        if (!occupied && !isW) { target = { q: nq, r: nr }; break; }
      }
      if (!target) target = { q: a.q + 1, r: a.r };
      const id = 'a' + Math.random().toString(36).slice(2, 7);
      setAgents(prev => [...prev, {
        ...a, id, name: a.name + '·2',
        q: target.q, r: target.r, _spawnedAt: Date.now(),
        status: 'Draft', msgs: 0, tools: 0, state: 'idle',
      }]);
    }
    if (action === 'walk') {
      // Pick a random free non-wall, non-router hex within a radius and animate the agent there.
      const candidates = HEX_FIELD.filter(h =>
        !wallSet.has(hexKey(h.q, h.r)) &&
        !routerSet.has(hexKey(h.q, h.r)) &&
        !agents.some(o => o.q === h.q && o.r === h.r) &&
        Math.abs(h.q - a.q) + Math.abs(h.r - a.r) >= 2
      );
      if (candidates.length) {
        const t = candidates[Math.floor(Math.random() * candidates.length)];
        setAgents(prev => prev.map(x => x.id === a.id
          ? { ...x, _walkFrom: { q: x.q, r: x.r }, _walkAt: Date.now(), q: t.q, r: t.r, state: 'moving' }
          : x));
        setTimeout(() => {
          setAgents(prev => prev.map(x => x.id === a.id ? { ...x, state: 'idle' } : x));
        }, 700);
      }
    }
    if (action === 'pause') {
      setAgents(prev => prev.map(x => x.id === a.id
        ? { ...x, state: x.state === 'paused' ? 'idle' : 'paused' } : x));
    }
    if (action === 'message') {
      setFocusedAgentId(a.id);
      // dispatch event so the left sidebar opens this agent's chat
      window.dispatchEvent(new CustomEvent('sq:open-chat', { detail: { agentId: a.id } }));
    }
  };

  // keyboard mode shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      // Build a key→action map from current shortcuts; fallback to default 1-5.
      const sc = shortcuts || { select: '1', spawn: '2', wall: '3', router: '4', erase: '5' };
      const map = {};
      for (const [action, key] of Object.entries(sc)) map[key] = action;
      if (map[e.key]) setMode(map[e.key]);
      if (e.key === 'Escape') { setEdgePop(null); setCtxMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode, shortcuts]);

  const currentEdgeState = edgePop ? (edgeStates[edgePop.key] || {}) : {};
  const updateEdgeState = (patch) => {
    setEdgeStates(prev => ({ ...prev, [edgePop.key]: { ...(prev[edgePop.key] || {}), ...patch } }));
  };

  // drag ghost
  let ghost = null;
  if (drag && drag.type === 'agent' && drag.mouseX != null) {
    const a = agents.find(x => x.id === drag.agentId);
    if (a) {
      const r = wrapRef.current.getBoundingClientRect();
      const mx = drag.mouseX - r.left, my = drag.mouseY - r.top;
      ghost = (
        <div style={{
          position: 'absolute', left: mx, top: my, transform: 'translate(-50%,-50%)',
          width: 32, height: 32, borderRadius: 6, background: a.color, opacity: 0.7,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--sb-font-display)', fontSize: 16, color: 'rgba(0,0,0,0.85)',
          pointerEvents: 'none', boxShadow: '0 0 24px rgba(0,0,0,0.6)',
        }}>{a.glyph}</div>
      );
    }
  }

  return (
    <div className="canvas-wrap" ref={wrapRef}
      onWheel={onWheel} onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onMouseLeave={() => { setDrag(null); setHoverHex(null); setHoverAgent(null); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid-bg" />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <pattern id="wallHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
          </pattern>
          <pattern id="routerDots" patternUnits="userSpaceOnUse" width="9" height="9">
            <circle cx="4.5" cy="4.5" r="0.9" fill="rgba(127,182,217,0.45)" />
          </pattern>
        </defs>
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {HEX_FIELD.map(({ q, r }) => {
            const k = hexKey(q, r);
            if (agentByHex.get(k)) return null;
            const isWall   = wallSet.has(k);
            const isRouter = routerSet.has(k);
            const isHover  = hoverHex && hoverHex.q === q && hoverHex.r === r;
            return <HexCell key={k} q={q} r={r}
              isWall={isWall} isRouter={isRouter} agent={null} focused={false}
              hovered={isHover} mode={mode}
              onClick={handleHexClick} onAgentMouseDown={() => {}}
              isFarZoom={isFarZoom} />;
          })}
          {!killed && activePairs.map(([a, b]) => {
            const key = [a.id, b.id].sort().join('|');
            return <CommEdge key={key} a={a} b={b} t={t}
              edgeState={edgeStates[key]}
              onClickEdge={handleEdgeClick} />;
          })}
          {!killed && activeRouterSegments.map((seg, i) => (
            <RouterWire key={'rw-' + i + '-' + seg.a.q + ',' + seg.a.r + '-' + seg.b.q + ',' + seg.b.r}
              a={seg.a} b={seg.b} t={t} />
          ))}
          {agents.map(a => {
            const dp = displayPositions.get(a.id);
            const isHover = hoverAgent && hoverAgent.id === a.id;
            return <HexCell key={a.id} q={a.q} r={a.r}
              agent={a} isWall={false}
              focused={a.id === focusedAgentId}
              hovered={isHover}
              mode={mode}
              onClick={handleHexClick}
              onAgentMouseDown={handleAgentMouseDown}
              onAgentContextMenu={handleAgentContextMenu}
              onAgentEnter={(ag) => setHoverAgent(ag)}
              onAgentLeave={() => setHoverAgent(null)}
              isFarZoom={isFarZoom}
              displayPos={dp} />;
          })}
          {/* Speech bubbles — rendered above agents on top of the grid. */}
          {!isFarZoom && agents.map(a => {
            if (a.status !== 'Live') return null;
            // Speech bubble is a "currently working" indicator — show only while the
            // agent is actively doing something. When idle (turn finished, nothing in
            // flight) the bubble disappears so the world is calm at rest.
            const working = a.state === 'thinking' || a.state === 'tool-running'
                          || a.state === 'awaiting-input' || a.state === 'moving';
            if (!working) return null;
            // suppress while being dragged
            if (drag && drag.type === 'agent' && drag.agentId === a.id) return null;
            const recent = agentRecentText && agentRecentText[a.id];
            const text = utteranceFor(a, utteranceSlot, recent);
            if (!text) return null;
            const dp = displayPositions.get(a.id) || axialToPixel(a.q, a.r);
            return (
              <SpeechBubble key={'sb-' + a.id + ':' + a.state + ':' + utteranceSlot}
                x={dp.x} y={dp.y} text={text}
                accent={a.state === 'errored' ? 'rgba(217,59,37,0.6)'
                  : a.state === 'awaiting-input' ? 'rgba(230,192,104,0.5)'
                  : 'rgba(255,255,255,0.18)'} />
            );
          })}
        </g>
      </svg>

      <div className="vignette" />

      <ModeBar mode={mode} setMode={setMode} shortcuts={shortcuts} />
      <Minimap agents={agents} walls={walls} routers={routers} viewport={viewport} fieldBounds={fieldBounds} />

      <div className="canvas-status">
        <span className="chip">/// WORLD: devshop</span>
        <span className="chip">{agents.filter(a => a.status === 'Live').length}/{agents.length} live</span>
        <span className="chip">tick · {(t % 200).toString().padStart(3,'0')}</span>
        <span className="chip">throttle · 1.2s</span>
        {loopFlag && <span className="chip" style={{ color: '#e6c068', borderColor: 'rgba(230,192,104,0.5)' }}>⚠ loop · turn budget 6/8</span>}
        {killed && <span className="chip" style={{ color: '#d93b25', borderColor: 'rgba(217,59,37,0.6)' }}>⏸ paused</span>}
        {isFarZoom && <span className="chip">far-zoom · labels off</span>}
      </div>

      <div className="zoom-ctl">
        <button onClick={() => setViewport(v => ({ ...v, zoom: Math.min(2.2, v.zoom * 1.15) }))} title="Zoom in"><I.zoomIn /></button>
        <button onClick={() => setViewport(v => ({ ...v, zoom: Math.max(0.4, v.zoom / 1.15) }))} title="Zoom out"><I.zoomOut /></button>
        <button onClick={() => setViewport(v => ({ ...v, panX: v.width / 2, panY: v.height / 2, zoom: 1 }))} title="Fit"><I.fit /></button>
      </div>

      {ghost}
      <AgentTooltip agent={hoverAgent} pos={hoverPos} />
      <EdgePopover pos={edgePop} edgeState={currentEdgeState}
        onChange={updateEdgeState} onClose={() => setEdgePop(null)} />
      <ContextMenu pos={ctxMenu?.pos} agent={ctxMenu?.agent}
        onAction={handleCtxAction} onClose={() => setCtxMenu(null)} />
    </div>
  );
}

window.HexGrid = HexGrid;
