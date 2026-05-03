// App shell. Wires top bar, tabs, hex grid, sidebars together.

const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

// Squadron daemon WebSocket URL.
// Defaults to ws://localhost:7878/ws. Override with ?daemon=ws://host/ws on the page URL.
// If the page URL also has ?token=…, we forward it to BOTH the WS URL and any
// /vault/<id>/<path> static-server fetches so the gates on each can validate.
const PAGE_TOKEN = (() => {
  try { return new URLSearchParams(window.location.search).get('token'); }
  catch { return null; }
})();
const DAEMON_URL = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const base = params.get('daemon') || 'ws://localhost:7878/ws';
    if (!PAGE_TOKEN) return base;
    const sep = base.includes('?') ? '&' : '?';
    return base + sep + 'token=' + encodeURIComponent(PAGE_TOKEN);
  } catch { return 'ws://localhost:7878/ws'; }
})();
// Build a vault URL that honors the token gate on the static server.
function vaultUrl(agentId, path) {
  const base = `${window.location.origin}/vault/${agentId}/${path}`;
  return PAGE_TOKEN ? `${base}?token=${encodeURIComponent(PAGE_TOKEN)}` : base;
}
console.log('[squadron] DAEMON_URL =', DAEMON_URL.replace(/token=[^&]+/, 'token=***'), '· page origin =', window.location.origin);

// Daemon DTO → UI agent shape. The DTO uses systemPrompt; existing prototype
// components read agent.sysPrompt. Also fills in UI-only telemetry defaults.
function dtoToAgent(dto) {
  return {
    ...dto,
    sysPrompt: dto.systemPrompt || dto.sysPrompt || '',
    msgs: dto.msgs ?? 0,
    tools: dto.tools ?? 0,
    // Daemon ships ISO timestamp; UI shows compact relative time.
    lastAt: dto.lastAt ? relTime(dto.lastAt) : '—',
    task: dto.task ?? (dto.status === 'Draft' ? 'Not yet instantiated' : 'idle'),
  };
}

function DaemonPill({ status }) {
  const colorMap = {
    connected: { fg: '#2a8c4a', border: 'rgba(42,140,74,0.5)' },
    connecting: { fg: 'var(--sb-fg-muted)', border: 'var(--sb-line)' },
    offline: { fg: 'var(--sb-fg-faint)', border: 'var(--sb-line)' },
    error: { fg: '#d93b25', border: 'rgba(217,59,37,0.5)' },
  };
  const c = colorMap[status] || colorMap.offline;
  const label = status === 'connected' ? 'connected'
    : status === 'connecting' ? '…'
    : status === 'offline' ? 'offline'
    : 'error';
  return (
    <span style={{
      fontFamily: 'var(--sb-font-mono)',
      fontSize: 10.5,
      padding: '3px 9px',
      border: '1px solid ' + c.border,
      borderRadius: 99,
      color: c.fg,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }} title={'daemon: ' + DAEMON_URL}>
      daemon · {label}
    </span>
  );
}

function TopBar({ killed, onKillSwitch, openSettings, autoWalkOn, setAutoWalkOn, openWizard, connectionCount, daemonStatus }) {
  return (
    <div className="topbar">
      <div className="brand">
        <img src="squadron-logo.svg" alt="" style={{ width: 16, height: 16, display: 'block', flexShrink: 0 }} />
        <span>squadron</span>
      </div>
      <span className="sep" />
      <span className="marker">/// world: devshop · 1 of 1</span>
      <span className="sep" />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <DaemonPill status={daemonStatus} />
        <button className={`tb-btn ${autoWalkOn ? 'active' : ''}`} onClick={() => setAutoWalkOn(!autoWalkOn)} title="Toggle scripted demo: agents walk autonomously">
          <I.zap /> demo {autoWalkOn ? 'on' : 'off'}
        </button>
        <button className="tb-btn" onClick={() => openWizard()} title="Add provider">
          <I.plus /> connect <span className="kbd" style={{ marginLeft: 4 }}>{connectionCount}</span>
        </button>
        <button className="tb-btn"><I.cpu /> defaults</button>
        <button className="tb-btn" onClick={openSettings}><I.settings /> settings</button>
        <Clock />
      </div>
      <button className={`killswitch ${killed ? 'killed' : ''}`} onClick={() => onKillSwitch && onKillSwitch()}
        title={killed ? 'autonomous agent-to-agent traffic paused — manual prompts still work' : 'pause all autonomous agent-to-agent traffic'}>
        <span className="pip" />
        {killed ? 'autonomy off · resume' : 'kill switch'}
      </button>
    </div>
  );
}

// Per-kind glyph rendered at the leading edge of a tab. The Grid tab uses a
// distinctive accent-tinted badge ("G"); all other kinds get a 14×14 monospace
// glyph chip whose border + foreground color is the kind's accent when active,
// muted when inactive. Per the May 2026 redesign brief.
function TabGlyph({ kind, active }) {
  if (kind === 'grid') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 3,
        background: 'rgba(217,59,37,0.18)',
        border: '1px solid rgba(217,59,37,0.5)',
        color: '#fff',
        fontFamily: 'var(--sb-font-display)', fontWeight: 600, fontSize: 11,
        flexShrink: 0,
      }}>G</span>
    );
  }
  const map = {
    'file':         { glyph: 'md', accent: 'var(--sb-kind-file)' },
    'vault-preview':{ glyph: '▦',  accent: 'var(--sb-kind-preview)' },
    'memory-graph': { glyph: '◉',  accent: 'var(--sb-kind-memory)' },
    'settings':     { glyph: '⚙',  accent: 'var(--sb-kind-settings)' },
  };
  const cfg = map[kind] || map['file'];
  const color = active ? cfg.accent : 'var(--sb-fg-muted)';
  const border = active ? cfg.accent : 'var(--sb-line)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: 2,
      border: `1px solid ${border}`, color,
      fontFamily: 'var(--sb-font-mono)', fontSize: 9, lineHeight: 1,
      flexShrink: 0,
    }}>{cfg.glyph}</span>
  );
}

function Tabs({ tabs, agents, activeId, onActivate, onClose, onReorder, onPin, onDuplicate, onDelete, onCloseOthers, onRename }) {
  const [dragId, setDragId] = useStateA(null);
  const [dropAt, setDropAt] = useStateA(null); // { id, side: 'before'|'after' }
  const [menu, setMenu] = useStateA(null); // { id, x, y }

  // Close the context menu on any outside click.
  useEffectA(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(null); }, { once: true });
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  return (
    <>
      <div
        className="tabs"
        // Vertical wheel input → horizontal scroll. Trackpad horizontal swipes
        // already work natively (deltaX); this routes plain mouse-wheel and
        // trackpad two-finger vertical scrolls into horizontal motion when the
        // cursor is over the tab strip. Only acts when there's overflow to scroll.
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          // If the user's gesture has any horizontal component already, let the
          // browser handle it natively. Only redirect pure-vertical wheels.
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }}
      >
        {tabs.map(t => {
          const isGrid = t.kind === 'grid';
          const cls = ['tab'];
          if (activeId === t.id) cls.push('active');
          if (isGrid) cls.push('grid-tab');
          if (t.pinned && !isGrid) cls.push('pinned');
          if (dragId === t.id) cls.push('dragging');
          if (dropAt && dropAt.id === t.id) cls.push(dropAt.side === 'before' ? 'drop-before' : 'drop-after');

          return (
            <button
              key={t.id}
              className={cls.join(' ')}
              onClick={() => onActivate(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (isGrid) return; // The Grid is non-closeable; menu would be empty
                setMenu({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              // Drag-reorder. The grid tab is locked at position 0 so isn't draggable.
              draggable={!isGrid}
              onDragStart={(e) => {
                if (isGrid) { e.preventDefault(); return; }
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', t.id);
                // Custom drag ghost — replaces the browser default chip with a tilted
                // pill that has the accent-red drop shadow per the May 2026 redesign.
                const ghost = document.createElement('div');
                ghost.textContent = t.title || '';
                ghost.style.cssText = [
                  'position:absolute', 'top:-1000px', 'left:-1000px',
                  'padding:6px 12px',
                  'background:rgba(10,10,10,0.95)',
                  'backdrop-filter:blur(6px)',
                  '-webkit-backdrop-filter:blur(6px)',
                  'border:1px solid rgba(255,255,255,0.10)',
                  'color:#fff',
                  'font-family:Inter,ui-sans-serif,system-ui,sans-serif',
                  'font-size:12px',
                  'border-radius:4px',
                  'box-shadow:0 0 0 1px rgba(217,59,37,0.3),0 12px 32px rgba(0,0,0,0.6)',
                  'transform:rotate(-1.5deg)',
                  'pointer-events:none',
                  'white-space:nowrap',
                ].join(';');
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 20, 12);
                // Browser captures the snapshot synchronously; remove on next tick.
                setTimeout(() => { try { document.body.removeChild(ghost); } catch {} }, 0);
                setDragId(t.id);
              }}
              onDragOver={(e) => {
                if (isGrid || !dragId || dragId === t.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const side = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
                setDropAt({ id: t.id, side });
              }}
              onDragLeave={(e) => {
                // Only clear if we're actually leaving this tab (not entering a child)
                if (e.currentTarget.contains(e.relatedTarget)) return;
                setDropAt((d) => (d && d.id === t.id ? null : d));
              }}
              onDrop={(e) => {
                if (isGrid || !dragId || dragId === t.id) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const side = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
                onReorder && onReorder(dragId, t.id, side);
                setDragId(null); setDropAt(null);
              }}
              onDragEnd={() => { setDragId(null); setDropAt(null); }}
            >
              <TabGlyph kind={t.kind} active={activeId === t.id} />
              {t.title}
              {/* Vault badge for file/preview kinds — small chip showing which
                  agent's vault this file belongs to so a row of tabs from
                  multiple agents reads at a glance. Replaces the generic badge
                  for those kinds. */}
              {(t.kind === 'file' || t.kind === 'vault-preview') && t.agentId
                ? (() => {
                    const ag = agents && agents.find(a => a.id === t.agentId);
                    const vault = (ag && ag.vault) || (ag && ag.name) || t.badge;
                    if (!vault) return null;
                    return (
                      <span style={{
                        fontFamily: 'var(--sb-font-mono)', fontSize: 9,
                        padding: '1px 5px', borderRadius: 3,
                        border: '1px solid var(--sb-line)',
                        color: 'var(--sb-fg-faint)',
                        letterSpacing: '0.05em',
                        textTransform: 'lowercase',
                        flexShrink: 0,
                      }} title={`vault: ${vault}`}>{vault}</span>
                    );
                  })()
                : (t.badge && <span className="badge">{t.badge}</span>)
              }
              {!isGrid && (
                <span className="close" onClick={(e) => { e.stopPropagation(); onClose(t.id); }}><I.close /></span>
              )}
            </button>
          );
        })}
      </div>

      {menu && (() => {
        const t = tabs.find(x => x.id === menu.id);
        if (!t) return null;
        const items = [];
        items.push({ id: 'pin', label: t.pinned ? 'unpin' : 'pin to left', action: () => onPin && onPin(t.id) });
        if (t.kind === 'file' || t.kind === 'memory-graph') {
          items.push({ id: 'dup', label: 'duplicate', action: () => onDuplicate && onDuplicate(t.id) });
        }
        if (t.kind === 'file' && onRename) {
          items.push({ id: 'rename', label: 'rename file…', action: () => {
            const next = window.prompt('rename file to:', t.path || t.title || '');
            if (!next) return;
            const trimmed = next.trim();
            if (!trimmed || trimmed === t.path) return;
            onRename(t.id, trimmed);
          }});
        }
        items.push({ id: 'close', label: 'close', action: () => onClose(t.id) });
        // "close others" — only shown when there are at least 2 closeable tabs.
        // Grid is always immune. Skips itself.
        const closeable = tabs.filter(x => x.kind !== 'grid');
        if (onCloseOthers && closeable.length >= 2) {
          items.push({ id: 'close-others', label: 'close others', action: () => onCloseOthers(t.id) });
        }
        if (t.kind === 'file') {
          items.push({ id: 'delete', label: 'delete file…', danger: true, action: () => onDelete && onDelete(t.id) });
        }
        return (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: menu.x, top: menu.y, zIndex: 70,
              background: 'rgba(10,10,10,0.97)', border: '1px solid var(--sb-line)',
              borderRadius: 4, padding: 4, minWidth: 170, backdropFilter: 'blur(8px)',
            }}>
            <div style={{
              padding: '6px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 10,
              color: 'var(--sb-fg-faint)', letterSpacing: '0.06em',
              borderBottom: '1px solid var(--sb-line-soft)', marginBottom: 4,
            }}>/// {(t.title || '').slice(0, 28)}</div>
            {items.map(it => (
              <button key={it.id}
                onClick={() => { it.action(); setMenu(null); }}
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
      })()}
    </>
  );
}

// Parse a string into a sequence of plain-text chunks and {wikilink} tokens.
// Matches Obsidian-style [[Target]] and [[Target|Alias]]. Single line only —
// `]]` not allowed to span newlines, matching Obsidian's behavior.
function parseWikilinks(text) {
  const re = /\[\[([^\[\]\n]+?)\]\]/g;
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ wikilink: m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Resolve a wikilink target ("Foo" or "Foo|alias" or "folder/Foo") to an actual
// path in the agent's vault, or null if no such file exists. Mirrors the suffix
// matching used by handleOpenVaultFile so styling and routing agree.
function resolveWikilink(target, vaultFiles) {
  if (!target || !Array.isArray(vaultFiles)) return null;
  const cleaned = target.split('|')[0].trim();
  if (!cleaned) return null;
  const filename = /\.[a-z0-9]+$/i.test(cleaned) ? cleaned : cleaned + '.md';
  if (vaultFiles.includes(filename)) return filename;
  const suffix = filename.startsWith('/') ? filename : '/' + filename;
  return vaultFiles.find(f => ('/' + f).endsWith(suffix)) || null;
}

function MarkdownTab({ tab, vaultEntry, agentName, vaultFiles, vaultEdges, requestVaultFile, writeVaultFile, onOpenFile }) {
  // tab = { id, kind:'file', agentId, path, title, badge }
  const { agentId, path } = tab;

  // Local draft state — what the user is currently editing. Initialized from
  // the cached vault content; stays sticky while typing so re-renders from
  // unrelated state don't clobber the textarea.
  const [draft, setDraft] = useStateA('');
  const [loaded, setLoaded] = useStateA(false);
  const [savingState, setSavingState] = useStateA('idle'); // 'idle' | 'pending' | 'saved' | 'error'
  const [savedAt, setSavedAt] = useStateA(null);
  const saveTimerRef = useRefA(null);
  const skipNextSyncRef = useRefA(false);
  const overlayRef = useRefA(null);

  const openWikilink = (target) => {
    if (!onOpenFile) return;
    const resolved = resolveWikilink(target, vaultFiles);
    if (!resolved) return; // no matching file → no-op (rendered faded)
    onOpenFile(agentId, resolved);
  };

  // On first content arrival from daemon: hydrate the editor.
  useEffectA(() => {
    if (!vaultEntry) {
      // Not requested yet — fire the read.
      requestVaultFile(agentId, path);
      return;
    }
    if (vaultEntry.error) {
      setLoaded(true);
      return;
    }
    if (typeof vaultEntry.content === 'string' && !loaded) {
      setDraft(vaultEntry.content);
      setLoaded(true);
      return;
    }
    // Subsequent content updates (e.g. another tab saved): only adopt if user isn't mid-edit.
    if (typeof vaultEntry.content === 'string' && loaded && !skipNextSyncRef.current) {
      // only update if it differs from current draft AND there are no unsaved changes
      if (vaultEntry.content !== draft && savingState !== 'pending') {
        setDraft(vaultEntry.content);
      }
    }
    skipNextSyncRef.current = false;
  }, [vaultEntry, agentId, path]);

  const scheduleSave = (next) => {
    setDraft(next);
    setSavingState('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Suppress the echo we'll get back from the daemon.
      skipNextSyncRef.current = true;
      const ok = writeVaultFile(agentId, path, next);
      if (ok) {
        setSavingState('saved');
        setSavedAt(Date.now());
        // Hold "saved" full-opacity for 3.6s, fade for 400ms, then drop to idle
        // (which renders the muted "saved Xs ago" tail). Per redesign spec.
        setTimeout(() => setSavingState(s => (s === 'saved' ? 'saved-fading' : s)), 3600);
        setTimeout(() => setSavingState(s => (s === 'saved-fading' ? 'idle' : s)), 4000);
      } else {
        setSavingState('error');
      }
    }, 500);
  };

  const onKeyDown = (e) => {
    // Cmd/Ctrl+S forces an immediate save instead of waiting for the debounce.
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      skipNextSyncRef.current = true;
      const ok = writeVaultFile(agentId, path, draft);
      setSavingState(ok ? 'saved' : 'error');
      if (ok) setSavedAt(Date.now());
    }
  };

  // Save pill — derive a tone (color token) and a label per state. The redesign
  // brief specifies SAVING (yellow) / SAVED (green) / CONFLICT (red), with SAVED
  // fading out after a short hold. Loading and quiet "live" states render in the
  // muted disabled tone so the pill doesn't shout when nothing is happening.
  let pill;
  if (!loaded && !vaultEntry?.error) {
    pill = { tone: 'var(--sb-fg-disabled)', label: 'loading' };
  } else if (vaultEntry?.error) {
    pill = { tone: 'var(--sb-pill-conflict)', label: 'conflict' };
  } else if (savingState === 'pending') {
    pill = { tone: 'var(--sb-pill-saving)', label: 'saving' };
  } else if (savingState === 'saved') {
    pill = { tone: 'var(--sb-pill-saved)', label: 'saved' };
  } else if (savingState === 'saved-fading') {
    pill = { tone: 'var(--sb-pill-saved)', label: 'saved', fading: true };
  } else if (savingState === 'error') {
    pill = { tone: 'var(--sb-pill-conflict)', label: 'save failed' };
  } else if (savedAt) {
    const sec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    pill = { tone: 'var(--sb-fg-disabled)', label: sec < 60 ? `saved ${sec}s ago` : `saved ${Math.floor(sec / 60)}m ago` };
  } else {
    pill = { tone: 'var(--sb-fg-disabled)', label: 'live' };
  }

  return (
    <div className="md-editor">
      <div className="md-head">
        {/* Breadcrumb-style path: AGENT / FOLDER / FILE.MD — uppercase mono.
            Replaces the older `/// VAULT · agent` + plain path duo. */}
        <span style={{
          fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, letterSpacing: '0.06em',
          color: 'var(--sb-fg-faint)',
          textTransform: 'uppercase',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {[(agentName || tab.badge || agentId.slice(0, 6)), ...path.split('/')].map((seg, i, arr) => (
            <React.Fragment key={i}>
              <span style={i === arr.length - 1 ? { color: 'var(--sb-fg-muted)' } : undefined}>{seg}</span>
              {i < arr.length - 1 && <span style={{ color: 'var(--sb-fg-disabled)', margin: '0 6px' }}>/</span>}
            </React.Fragment>
          ))}
        </span>
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999,
          fontFamily: 'var(--sb-font-mono)', fontSize: 10, letterSpacing: '0.06em',
          color: pill.tone,
          border: `1px solid color-mix(in srgb, ${pill.tone} 40%, transparent)`,
          background: `color-mix(in srgb, ${pill.tone} 8%, transparent)`,
          textTransform: 'lowercase',
          opacity: pill.fading ? 0 : 1,
          transition: 'opacity 400ms ease',
          flexShrink: 0,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: pill.tone, flexShrink: 0,
          }} />
          {pill.label}
        </span>
      </div>
      {/* Body is a row: editor left (flex 1), 200px outline rail right.
          Layered editor: textarea below carries the editing/caret; overlay on top
          paints the visible text and turns [[wikilinks]] into clickable <a>s.
          - textarea text is transparent (caret stays visible via caret-color)
          - overlay has pointer-events: none so clicks fall through to the textarea
            EXCEPT on .wikilink anchors which set pointer-events: auto.
          - overlay scrollTop is mirrored from the textarea on scroll. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <textarea
          className="md-body"
          value={draft}
          onChange={(e) => scheduleSave(e.target.value)}
          onScroll={(e) => { if (overlayRef.current) overlayRef.current.scrollTop = e.target.scrollTop; }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          placeholder={loaded ? '' : '…'}
          readOnly={!!vaultEntry?.error}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: 'transparent',
            caretColor: 'var(--sb-accent)',
            fontFamily: 'var(--sb-font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            padding: '32px 56px 40px',
            tabSize: 2,
          }}
        />
        <pre
          ref={overlayRef}
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, margin: 0,
            padding: '32px 56px 40px',
            fontFamily: 'var(--sb-font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            tabSize: 2,
            color: 'var(--sb-fg)',
            background: 'transparent',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {parseWikilinks(draft).map((p, i) => {
            if (typeof p === 'string') return <React.Fragment key={i}>{p}</React.Fragment>;
            const resolved = resolveWikilink(p.wikilink, vaultFiles);
            const exists = !!resolved;
            return (
              <a
                key={i}
                href="#"
                title={exists ? `open ${resolved} in a new tab` : `no file matches ${p.wikilink}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (exists) openWikilink(p.wikilink); }}
                style={{
                  pointerEvents: 'auto',
                  color: exists ? 'var(--sb-kind-file)' : 'inherit',
                  opacity: exists ? 1 : 0.45,
                  cursor: exists ? 'pointer' : 'default',
                  textDecoration: 'none',
                  borderBottom: exists ? '1px dashed rgba(127,182,217,0.5)' : 'none',
                }}
              >[[{p.wikilink}]]</a>
            );
          })}
          {/* trailing newline so the overlay's last line has the same height as the textarea's */}
          {'\n'}
        </pre>
      </div>
      <OutlineRail draft={draft} path={path} vaultEdges={vaultEdges} savedAt={savedAt}
                   onOpenFile={(p) => onOpenFile && onOpenFile(agentId, p)} />
      </div>
    </div>
  );
}

// Right-side rail in the markdown editor: H1/H2 outline of the current file +
// backlinks (other vault files in this agent that wikilink to this one) + meta
// (word count, relative time since last save). Layout per the May 2026 redesign.
function OutlineRail({ draft, path, vaultEdges, savedAt, onOpenFile }) {
  const headings = React.useMemo(() => {
    if (!draft) return [];
    return draft.split('\n')
      .map((line, i) => ({ line, i }))
      .filter(x => /^#{1,2}\s+\S/.test(x.line))
      .map(x => ({
        level: (x.line.match(/^(#{1,2})/) || ['', ''])[1].length,
        text:  x.line.replace(/^#{1,2}\s+/, '').trim(),
      }));
  }, [draft]);

  const wordCount = React.useMemo(() => {
    if (!draft) return 0;
    return draft.trim().split(/\s+/).filter(Boolean).length;
  }, [draft]);

  // Backlinks: edges in this agent's vault where the target matches our path
  // (exact or by basename suffix, since wikilinks are usually bare names).
  const backlinks = React.useMemo(() => {
    if (!Array.isArray(vaultEdges) || !path) return [];
    const base = path.split('/').pop() || path;
    const baseNoExt = base.replace(/\.[^.]+$/, '');
    const out = new Set();
    for (const e of vaultEdges) {
      const to = e[1];
      if (!to) continue;
      if (to === path || to === base || to === baseNoExt) out.add(e[0]);
    }
    return Array.from(out);
  }, [vaultEdges, path]);

  const relTime = (() => {
    if (!savedAt) return null;
    const sec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  })();

  return (
    <div style={{
      width: 200, flexShrink: 0,
      borderLeft: '1px solid var(--sb-line)',
      padding: '32px 16px',
      fontFamily: 'var(--sb-font-mono)', fontSize: 11,
      color: 'var(--sb-fg-muted)',
      overflow: 'auto', minHeight: 0,
    }}>
      <div style={{ color: 'var(--sb-fg-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>/// outline</div>
      {headings.length === 0
        ? <div style={{ color: 'var(--sb-fg-disabled)', fontSize: 10.5, marginBottom: 18 }}>no headings</div>
        : <div style={{ marginBottom: 18 }}>
            {headings.map((h, i) => (
              <div key={i} style={{
                paddingLeft: h.level === 1 ? 12 : 22,
                paddingTop: 3, paddingBottom: 3,
                color: 'var(--sb-fg-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={h.text}>{h.text}</div>
            ))}
          </div>
      }

      <div style={{ color: 'var(--sb-fg-faint)', letterSpacing: '0.06em', marginBottom: 8 }}>/// backlinks</div>
      {backlinks.length === 0
        ? <div style={{ color: 'var(--sb-fg-disabled)', fontSize: 10.5, marginBottom: 18 }}>none</div>
        : <div style={{ marginBottom: 18 }}>
            {backlinks.map((b, i) => (
              <div key={i}
                onClick={() => onOpenFile && onOpenFile(b)}
                style={{
                  cursor: 'pointer', color: 'var(--sb-kind-file)',
                  padding: '3px 0',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                title={`open ${b}`}
              >{b}</div>
            ))}
          </div>
      }

      <div style={{ color: 'var(--sb-fg-disabled)', fontSize: 10.5, marginTop: 4 }}>
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </div>
      {relTime && (
        <div style={{ color: 'var(--sb-fg-disabled)', fontSize: 10.5 }}>
          updated {relTime}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ connections, openWizard, shortcuts, rebindShortcut, resetShortcuts }) {
  const [cat, setCat] = useStateA('throttling');
  const cats = ['connections','defaults','throttling','cost','names','shortcuts','appearance'];
  const [bindingAction, setBindingAction] = useStateA(null);
  // While bindingAction is set, capture the next keypress globally and use it as the new binding.
  useEffectA(() => {
    if (!bindingAction) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setBindingAction(null); return; }
      // Reject modifier-only presses
      if (['Shift','Control','Alt','Meta','CapsLock'].includes(e.key)) return;
      rebindShortcut && rebindShortcut(bindingAction, e.key);
      setBindingAction(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [bindingAction, rebindShortcut]);
  return (
    <div className="md-editor" style={{ flexDirection: 'row' }}>
      <div style={{ width: 200, borderRight: '1px solid var(--sb-line)', padding: '14px 0', overflowY: 'auto' }}>
        <div style={{ padding: '0 14px 8px', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>/// SETTINGS</div>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '8px 14px', fontSize: 12,
            background: cat === c ? 'var(--sb-surface)' : 'transparent',
            color: cat === c ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
            border: 'none', borderLeft: cat === c ? '2px solid var(--sb-accent)' : '2px solid transparent',
            cursor: 'pointer',
          }}>{c}</button>
        ))}
      </div>
      <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: 'var(--sb-fg-faint)', letterSpacing: '0.1em', marginBottom: 6 }}>/// {cat.toUpperCase()}</div>
        <h1 style={{ fontFamily: 'var(--sb-font-display)', fontSize: 26, margin: '0 0 18px', letterSpacing: '-0.02em' }}>{cat}</h1>
        {cat === 'throttling' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              one shared throttle slot per agent. all actions — move, send_to, vault edit — count as one. simple mental model: agents act once per tick.
            </p>
            <div className="field"><label>global throttle tick</label>
              <input type="range" min="200" max="3000" defaultValue="1200" style={{ width: '100%' }} />
              <div className="marker" style={{ marginTop: 4 }}>1.20s · one action per tick</div>
            </div>
            <div className="field"><label>per-session turn budget</label>
              <input type="number" defaultValue="8" />
              <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>auto-pause inter-agent traffic after K consecutive autonomous back-and-forths.</div>
            </div>
            <div className="field"><label>loop detector window</label>
              <input type="number" defaultValue="6" />
              <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>messages compared for similarity. higher = more lenient.</div>
            </div>
            <div className="field"><label>per-agent movement budget / hour</label>
              <input type="number" defaultValue="60" />
            </div>
            <div className="field"><label>collision replan threshold</label>
              <input type="number" defaultValue="3" />
              <div className="marker" style={{ marginTop: 4, color: 'var(--sb-fg-disabled)' }}>after N blocked moves on the same target, daemon forces replan.</div>
            </div>
          </div>
        )}
        {cat === 'cost' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              subscription billing — usage is messages and tool calls, not dollars. ceilings here are advisory caps that pause autonomous traffic when hit.
            </p>
            <div className="field"><label>global message ceiling / hour</label><input type="number" defaultValue="500" /></div>
            <div className="field"><label>per-agent ceiling / hour</label><input type="number" defaultValue="120" /></div>
            <div className="field"><label>per-session ceiling</label><input type="number" defaultValue="40" /></div>
            <div style={{ marginTop: 18, padding: '14px 16px', border: '1px solid var(--sb-line)', borderRadius: 'var(--sb-r-sm)', background: 'var(--sb-surface)' }}>
              <div className="marker" style={{ marginBottom: 6 }}>/// THIS HOUR</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 22, letterSpacing: '-0.01em' }}>147</div><div className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>messages</div></div>
                <div><div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 22, letterSpacing: '-0.01em' }}>62</div><div className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>tool calls</div></div>
                <div><div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 22, letterSpacing: '-0.01em', color: '#2a8c4a' }}>29%</div><div className="marker" style={{ color: 'var(--sb-fg-disabled)' }}>of ceiling</div></div>
              </div>
            </div>
          </div>
        )}
        {cat === 'connections' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              each agent picks its own provider. add as many as you like — they live globally and become selectable on every agent.
            </p>
            {connections.map((c, i) => (
              <div key={i} className="conn-row" style={{ borderBottom: '1px solid var(--sb-line-soft)', padding: '10px 0' }}>
                <div className="ico">{c.provider === 'claude' ? 'CL' : c.provider === 'codex' ? 'CX' : '··'}</div>
                <div>{c.label}</div>
                <div className="meta">connected</div>
              </div>
            ))}
            <button className="conn-add" onClick={() => openWizard()}><I.plus /> add provider</button>
          </div>
        )}
        {cat === 'defaults' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              applied to every newly-spawned agent. you can override any of these per-agent in the right sidebar after spawn.
            </p>
            <div className="field"><label>default model</label>
              <select>
                {connections.flatMap(c => c.provider === 'claude'
                  ? [<option key="claude-sonnet">claude-3.5-sonnet · {c.connType === 'cli-sub' ? 'subscription' : 'api'}</option>,
                     <option key="claude-haiku">claude-3.5-haiku · {c.connType === 'cli-sub' ? 'subscription' : 'api'}</option>]
                  : c.provider === 'codex'
                  ? [<option key="codex-1">codex-1 · {c.connType === 'cli-sub' ? 'subscription' : 'api'}</option>,
                     <option key="codex-mini">codex-mini · {c.connType === 'cli-sub' ? 'subscription' : 'api'}</option>]
                  : [])}
              </select>
            </div>
            <div className="field"><label>default working dir template</label><input defaultValue="~/.hexagent/agents/<id>/workdir/" /></div>
            <div className="field"><label>default system prompt</label>
              <textarea defaultValue="you are a working agent on a hex grid. you can move toward neighbors and message them with `send_to`. work autonomously toward the user's goal." style={{ minHeight: 80 }} />
            </div>
            <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
              <label style={{ marginBottom: 0 }}>autonomous comms enabled by default</label>
              <input type="checkbox" defaultChecked />
            </div>
            <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
              <label style={{ marginBottom: 0 }}>cross-vault read enabled by default</label>
              <input type="checkbox" defaultChecked />
            </div>
          </div>
        )}
        {cat === 'names' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              new agents get a random rolled name on spawn. swap the source list or paste your own.
            </p>
            <div className="field"><label>random name source</label>
              <select>
                <option>mythological + celestial + mineral (~500)</option>
                <option>celestial only (atlas, vesper, rigel…)</option>
                <option>mineral only (onyx, jasper, obsidian…)</option>
                <option>mythological only (mercury, athena, loki…)</option>
                <option>custom list…</option>
              </select>
            </div>
            <div className="field"><label>preview · 8 rolls</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {['atlas','mercury','onyx','vesper','rigel','jasper','sable','perseus'].map(n => (
                  <span key={n} style={{ padding: '4px 10px', fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg-muted)', border: '1px solid var(--sb-line)', borderRadius: 99, letterSpacing: '0.04em' }}>{n}</span>
                ))}
              </div>
            </div>
            <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
              <label style={{ marginBottom: 0 }}>avoid name collisions in this world</label>
              <input type="checkbox" defaultChecked />
            </div>
          </div>
        )}
        {cat === 'shortcuts' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              keyboard shortcuts for the hex-grid mode bar. click rebind, then press a key. esc to cancel.
            </p>
            {[
              { id: 'select', label: 'Select' },
              { id: 'spawn',  label: 'Spawn'  },
              { id: 'wall',   label: 'Wall'   },
              { id: 'router', label: 'Router' },
              { id: 'erase',  label: 'Erase'  },
            ].map(it => (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: '1px solid var(--sb-line-soft)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--sb-fg)', fontSize: 13 }}>{it.label}</div>
                  <div className="marker" style={{ color: 'var(--sb-fg-disabled)', marginTop: 2 }}>
                    mode: {it.id}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--sb-font-mono)', fontSize: 12,
                  padding: '4px 12px', minWidth: 36, textAlign: 'center',
                  border: '1px solid var(--sb-line)', borderRadius: 4,
                  background: bindingAction === it.id ? 'rgba(217,59,37,0.15)' : 'var(--sb-surface)',
                  color: bindingAction === it.id ? 'var(--sb-accent)' : 'var(--sb-fg)',
                }}>
                  {bindingAction === it.id ? '…' : (shortcuts && shortcuts[it.id]) || '—'}
                </div>
                <button
                  onClick={() => setBindingAction(it.id === bindingAction ? null : it.id)}
                  style={{
                    fontFamily: 'var(--sb-font-mono)', fontSize: 11,
                    padding: '5px 10px', cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 4,
                    color: 'var(--sb-fg-muted)', letterSpacing: '0.04em',
                  }}
                >{bindingAction === it.id ? 'cancel' : 'rebind'}</button>
              </div>
            ))}
            <button
              onClick={() => resetShortcuts && resetShortcuts()}
              style={{
                marginTop: 14, fontFamily: 'var(--sb-font-mono)', fontSize: 11,
                padding: '6px 12px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--sb-line)', borderRadius: 4,
                color: 'var(--sb-fg-muted)', letterSpacing: '0.04em',
              }}
            >reset to defaults (1–5)</button>
          </div>
        )}
        {cat === 'appearance' && (
          <div>
            <p className="lede" style={{ color: 'var(--sb-fg-muted)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px', maxWidth: 460 }}>
              the visual language is solbound dark. accent and density are tweakable.
            </p>
            <div className="field"><label>theme</label>
              <select><option>solbound dark</option><option disabled>solbound light · soon</option></select>
            </div>
            <div className="field"><label>accent</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input defaultValue="#d93b25" style={{ flex: 1 }} />
                {['#d93b25','#e6c068','#5b8def','#2a8c4a','#a256d9'].map(c => (
                  <button key={c} style={{ width: 22, height: 22, borderRadius: 4, border: c === '#d93b25' ? '2px solid var(--sb-fg)' : '1px solid var(--sb-line)', background: c, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div className="field"><label>hex density</label>
              <select><option>standard</option><option>compact</option><option>roomy</option></select>
            </div>
            <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
              <label style={{ marginBottom: 0 }}>animate inter-agent comms dots</label>
              <input type="checkbox" defaultChecked />
            </div>
            <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
              <label style={{ marginBottom: 0 }}>pulse active hexes</label>
              <input type="checkbox" defaultChecked />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny relative-time stub — turns "now" / "Nm" / "Nh" out of an ISO timestamp.
function relTime(iso) {
  if (!iso) return '—';
  const dt = (Date.now() - new Date(iso).getTime()) / 1000;
  if (dt < 60) return 'now';
  if (dt < 3600) return Math.floor(dt / 60) + 'm';
  if (dt < 86400) return Math.floor(dt / 3600) + 'h';
  return Math.floor(dt / 86400) + 'd';
}

// HH:MM (local) for chat-bubble stamps. HH:MM:SS for the live topbar clock.
function fmtClock(iso, withSeconds) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const s = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return withSeconds ? s + ':' + pad(d.getSeconds()) : s;
}
// Expose to other module files (sidebars.jsx renders chat-bubble stamps).
if (typeof window !== 'undefined' && window.SQ) window.SQ.fmtClock = fmtClock;

// Live wall-clock for the topbar — re-renders once per second.
function Clock() {
  const [now, setNow] = React.useState(() => fmtClock(null, true));
  React.useEffect(() => {
    const id = setInterval(() => setNow(fmtClock(null, true)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="marker"
      style={{
        fontFamily: 'var(--sb-font-mono)', fontSize: 11, letterSpacing: '0.06em',
        color: 'var(--sb-fg-muted)', padding: '2px 8px',
        border: '1px solid var(--sb-line)', borderRadius: 4,
      }}
      title="local time"
    >
      {now}
    </span>
  );
}

function App() {
  const [agents, setAgents] = useStateA(window.SQ.initialAgents);
  // M3: walls + routers are now daemon-persisted via world_features. Client state
  // mirrors the daemon snapshot.
  const [walls, setWalls] = useStateA([]);
  const [routers, setRouters] = useStateA([]);
  const [edgeStates, setEdgeStates] = useStateA({});

  const [focusedAgentId, setFocusedAgentId] = useStateA(null);
  const [mode, setMode] = useStateA('select');
  const [killed, setKilled] = useStateA(false);
  const [autoWalkOn, setAutoWalkOn] = useStateA(true);
  const [loopFlag, setLoopFlag] = useStateA(false);

  const [leftView, setLeftView] = useStateA({ kind: 'list', conversation: null });
  // Sessions vs Agents toggle for the left-list view. Default: agents.
  const [leftMode, setLeftMode] = useStateA(() => {
    try { return localStorage.getItem('sq.leftMode') || 'agents'; } catch { return 'agents'; }
  });
  useEffectA(() => { try { localStorage.setItem('sq.leftMode', leftMode); } catch {} }, [leftMode]);

  // ⌘1 / ⌘2 (Ctrl on non-Mac) toggle left sidebar Sessions/Agents. Skips when
  // an editable element is focused so it doesn't hijack textareas / inputs.
  useEffectA(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key !== '1' && e.key !== '2') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setLeftMode(e.key === '1' ? 'list' : 'agents');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mode-bar keyboard shortcuts. Stored as { actionId: keyString }, persisted.
  const DEFAULT_SHORTCUTS = { select: '1', spawn: '2', wall: '3', router: '4', erase: '5' };
  const [shortcuts, setShortcuts] = useStateA(() => {
    try {
      const raw = localStorage.getItem('sq.shortcuts');
      if (!raw) return DEFAULT_SHORTCUTS;
      const parsed = JSON.parse(raw);
      // Drop any unknown action keys; backfill with defaults so a partial save still works.
      return { ...DEFAULT_SHORTCUTS, ...parsed };
    } catch { return DEFAULT_SHORTCUTS; }
  });
  useEffectA(() => { try { localStorage.setItem('sq.shortcuts', JSON.stringify(shortcuts)); } catch {} }, [shortcuts]);
  const rebindShortcut = (action, key) => {
    setShortcuts(prev => {
      // Refuse if another action already uses that key (unless it's the same action).
      const conflict = Object.entries(prev).find(([a, k]) => a !== action && k === key);
      if (conflict) return prev;
      return { ...prev, [action]: key };
    });
  };

  // ---------- Squadron daemon (M1: persistent, daemon-owned world) ----------
  // realChats[agentId] = [{ who, side, text, _streaming?, _msgId? }]
  // _streaming bubbles are in-flight assistant text (not yet persisted).
  // _msgId is the DB row id for persisted messages — used to dedupe on snapshot/append.
  const [realChats, setRealChats] = useStateA({});
  // M3: inter-agent chats keyed by sorted pair id "interSession-<aId>-<bId>"
  // Each entry is array of { id, fromAgentId, toAgentId, text, createdAt }.
  const [interAgentChats, setInterAgentChats] = useStateA({});
  // M3-vault-edit: cache of vault file contents, keyed by "<agentId>:<path>".
  // undefined = not loaded; string = content; null = error.
  const [vaultFileContents, setVaultFileContents] = useStateA({});
  // 'connecting' | 'connected' | 'offline' | 'error'
  const [wsState, setWsState] = useStateA('connecting');
  const wsRef = useRefA(null);

  const interSessionId = (a, b) => 'interSession-' + [a, b].sort().join('-');
  const vaultKey = (agentId, path) => agentId + ':' + path;

  // Per-node color overrides for the memory graph. Persisted client-side per
  // agent. Shape: { [agentId]: { [filename]: '#hex' } }. A node with no override
  // falls back to agent.color in MemoryGraph.
  const [nodeColors, setNodeColors] = useStateA(() => {
    try {
      const raw = localStorage.getItem('sq.nodeColors');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffectA(() => {
    try { localStorage.setItem('sq.nodeColors', JSON.stringify(nodeColors)); } catch {}
  }, [nodeColors]);
  const setNodeColor = (agentId, filename, color) => {
    setNodeColors(prev => {
      const m = { ...(prev[agentId] || {}) };
      if (color === null || color === undefined) delete m[filename];
      else m[filename] = color;
      return { ...prev, [agentId]: m };
    });
  };

  const sendToDaemon = (event) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(event)); return true; } catch { return false; }
  };

  // WS connect on mount with auto-retry on close.
  useEffectA(() => {
    let cancelled = false;
    let retryTimer = null;

    const handleDaemonEvent = (event) => {
      if (!event || !event.type) return;

      // ---- World deltas (M1 + M3) ----
      if (event.type === 'autonomy-changed') {
        setKilled(!event.enabled);
        return;
      }
      if (event.type === 'auto-trigger-paused') {
        // Soft signal — UI could show a chip later. Logged for now.
        console.log('[squadron] auto-trigger paused', event.pairKey, 'reason:', event.reason);
        return;
      }
      if (event.type === 'world-snapshot') {
        setAgents((event.agents || []).map(dtoToAgent));
        if (typeof event.autonomyEnabled === 'boolean') setKilled(!event.autonomyEnabled);
        // build realChats from messages: id-keyed, preserve order
        const chats = {};
        const messagesByAgent = event.messages || {};
        for (const aid in messagesByAgent) {
          chats[aid] = (messagesByAgent[aid] || []).map(m => ({
            _msgId: m.id, who: m.who || (m.side === 'you' ? 'You' : ''), side: m.side, text: m.text,
            createdAt: m.createdAt,
          }));
        }
        setRealChats(chats);
        // M3: features (walls + routers)
        const features = event.features || [];
        setWalls(features.filter(f => f.kind === 'wall').map(f => ({ q: f.q, r: f.r })));
        setRouters(features.filter(f => f.kind === 'router').map(f => ({ q: f.q, r: f.r })));
        // M3: inter-agent messages, grouped by sorted pair
        const iam = {};
        for (const m of (event.interAgentMessages || [])) {
          const k = interSessionId(m.fromAgentId, m.toAgentId);
          if (!iam[k]) iam[k] = [];
          iam[k].push(m);
        }
        setInterAgentChats(iam);
        // Auto-focus the first agent if nothing is focused yet.
        if (event.agents && event.agents.length > 0) {
          setFocusedAgentId(prev => prev || event.agents[0].id);
        }
        return;
      }
      if (event.type === 'feature-placed') {
        const f = event.feature;
        // Mutual exclusion in client too: remove from BOTH lists, then add to the right one.
        setWalls(prev => prev.filter(x => !(x.q === f.q && x.r === f.r)));
        setRouters(prev => prev.filter(x => !(x.q === f.q && x.r === f.r)));
        if (f.kind === 'wall') setWalls(prev => [...prev, { q: f.q, r: f.r }]);
        else if (f.kind === 'router') setRouters(prev => [...prev, { q: f.q, r: f.r }]);
        return;
      }
      if (event.type === 'feature-removed') {
        setWalls(prev => prev.filter(x => !(x.q === event.q && x.r === event.r)));
        setRouters(prev => prev.filter(x => !(x.q === event.q && x.r === event.r)));
        return;
      }
      if (event.type === 'inter-agent-message-appended') {
        const m = event.message;
        const k = interSessionId(m.fromAgentId, m.toAgentId);
        setInterAgentChats(prev => {
          const list = prev[k] || [];
          if (list.some(x => x.id === m.id)) return prev;
          return { ...prev, [k]: [...list, m] };
        });
        return;
      }
      if (event.type === 'vault-file-content') {
        // null content = error; we still store the entry so MarkdownTab can render an error state.
        setVaultFileContents(prev => ({
          ...prev,
          [vaultKey(event.agentId, event.path)]: event.content === null
            ? { error: event.error || 'not found' }
            : { content: event.content },
        }));
        return;
      }
      if (event.type === 'vault-file-moved') {
        if (event.ok) {
          // Move content cache key + carry per-node color override + update any
          // open file tab pointing at the old path so the editor doesn't break.
          setVaultFileContents(prev => {
            const oldKey = vaultKey(event.agentId, event.oldPath);
            const newKey = vaultKey(event.agentId, event.newPath);
            if (!(oldKey in prev)) return prev;
            const { [oldKey]: moved, ...rest } = prev;
            return { ...rest, [newKey]: moved };
          });
          setNodeColors(prev => {
            const m = prev[event.agentId];
            if (!m || !(event.oldPath in m)) return prev;
            const { [event.oldPath]: c, ...rest } = m;
            return { ...prev, [event.agentId]: { ...rest, [event.newPath]: c } };
          });
          setTabs(prev => prev.map(t => {
            if (t.kind === 'file' && t.agentId === event.agentId && t.path === event.oldPath) {
              const newId = 'file:' + event.agentId + ':' + event.newPath;
              return { ...t, id: newId, path: event.newPath, title: event.newPath };
            }
            return t;
          }));
          // If the active tab was the renamed file, switch to its new id.
          setActiveTab(prev => {
            const wasOld = 'file:' + event.agentId + ':' + event.oldPath;
            return prev === wasOld ? 'file:' + event.agentId + ':' + event.newPath : prev;
          });
        } else {
          console.warn('[squadron] vault-file-moved rejected:', event.oldPath, '→', event.newPath, event.error);
          window.alert('rename failed: ' + (event.error || 'unknown'));
        }
        return;
      }
      if (event.type === 'vault-file-deleted') {
        if (event.ok) {
          // Drop content cache + close any tabs open on the deleted file (multi-tab safety).
          setVaultFileContents(prev => {
            const k = vaultKey(event.agentId, event.path);
            if (!(k in prev)) return prev;
            const { [k]: _, ...rest } = prev;
            return rest;
          });
          setTabs(prev => prev.filter(t => !(t.kind === 'file' && t.agentId === event.agentId && t.path === event.path)));
        } else {
          console.warn('[squadron] vault-file-deleted rejected:', event.path, event.error);
        }
        return;
      }
      if (event.type === 'vault-file-written') {
        // Echoed for telemetry / multi-tab confirmation. The companion vault-file-content
        // broadcast (if ok) carries the new content, so we don't have to react here.
        if (!event.ok) {
          console.warn('[squadron] vault write rejected:', event.path, event.error);
        }
        return;
      }
      if (event.type === 'agent-created') {
        const ui = dtoToAgent(event.agent);
        setAgents(prev => prev.some(a => a.id === ui.id)
          ? prev.map(a => a.id === ui.id ? ui : a)
          : [...prev, ui]);
        // Auto-focus the newly created agent and open its user-chat.
        setFocusedAgentId(ui.id);
        setLeftView({
          kind: 'chat',
          conversation: {
            id: 'user-' + ui.id,
            kind: 'user',
            agentId: ui.id,
            label: ui.name,
            last: 'no messages — say hi to boot the agent',
            time: '—',
            status: 'live',
            unread: false,
          },
        });
        return;
      }
      if (event.type === 'agent-updated') {
        const ui = dtoToAgent(event.agent);
        setAgents(prev => prev.map(a => {
          if (a.id !== ui.id) return a;
          // M6: if the daemon moved this agent and it's mid-walk, seed _walkFrom
          // from the OLD position so HexGrid animates the slide instead of snapping.
          const positionChanged = (a.q !== ui.q || a.r !== ui.r);
          const isMoving = ui.state === 'moving';
          if (positionChanged && isMoving) {
            return { ...a, ...ui, _walkFrom: { q: a.q, r: a.r }, _walkAt: Date.now() };
          }
          return { ...a, ...ui };
        }));
        return;
      }
      if (event.type === 'agent-deleted') {
        setAgents(prev => prev.filter(a => a.id !== event.agentId));
        setRealChats(prev => {
          const { [event.agentId]: _, ...rest } = prev;
          return rest;
        });
        return;
      }
      if (event.type === 'message-appended') {
        const m = event.message;
        const agentId = m.agentId;
        setRealChats(prev => {
          const list = prev[agentId] || [];
          // Dedup by _msgId in case of double-fire.
          if (list.some(x => x._msgId === m.id)) return prev;
          // If this is an assistant final and we have a streaming ghost, replace it.
          if (m.side === 'them') {
            const idx = list.findIndex(x => x._streaming);
            if (idx >= 0) {
              const finalised = { _msgId: m.id, who: m.who || '', side: m.side, text: m.text, createdAt: m.createdAt };
              return { ...prev, [agentId]: list.slice(0, idx).concat([finalised]).concat(list.slice(idx + 1)) };
            }
          }
          return {
            ...prev,
            [agentId]: [...list, { _msgId: m.id, who: m.who || (m.side === 'you' ? 'You' : ''), side: m.side, text: m.text, createdAt: m.createdAt }],
          };
        });
        return;
      }

      // ---- Subprocess streaming (live UX only — not persisted client-side) ----
      if (event.type === 'agent-spawned') {
        return; // daemon's agent-updated will sync status
      }
      if (event.type === 'agent-event') {
        const agentId = event.agentId;
        const e = event.event;
        if (!e || typeof e !== 'object') return;
        if (e.type === 'assistant') {
          let text = '';
          const blocks = e.message && e.message.content;
          if (Array.isArray(blocks)) {
            for (const b of blocks) {
              if (b.type === 'text' && typeof b.text === 'string') text += b.text;
            }
          }
          if (!text) return;
          // upsert a streaming bubble at the end (replaced when message-appended arrives)
          setRealChats(prev => {
            const list = prev[agentId] || [];
            const lastIdx = list.length - 1;
            const last = list[lastIdx];
            if (last && last._streaming) {
              const updated = list.slice(0, lastIdx).concat([{ ...last, text }]);
              return { ...prev, [agentId]: updated };
            }
            return { ...prev, [agentId]: [...list, { who: '', side: 'them', text, _streaming: true, createdAt: new Date().toISOString() }] };
          });
          return;
        }
        // result: do nothing — message-appended will land with the final text
        // system/init, rate_limit_event, stream_event etc. — telemetry only
        return;
      }
      if (event.type === 'agent-stderr') return;
      if (event.type === 'agent-error') {
        // Surface as a system message on the closest sensible chat (none if no agentId).
        if (event.agentId) {
          setRealChats(prev => {
            const list = prev[event.agentId] || [];
            return { ...prev, [event.agentId]: [...list, { who: 'system', side: 'sys', text: '⚠ ' + event.error }] };
          });
        }
        return;
      }
      if (event.type === 'agent-exited') {
        // daemon already set status back to Draft via agent-updated — no client action needed
        return;
      }
    };

    const connect = () => {
      if (cancelled) return;
      setWsState('connecting');
      let ws;
      try {
        ws = new WebSocket(DAEMON_URL);
      } catch {
        setWsState('error');
        retryTimer = setTimeout(connect, 2500);
        return;
      }
      wsRef.current = ws;
      ws.addEventListener('open', () => {
        if (cancelled) return;
        setWsState('connected');
        // Subscribe to the world — daemon replies with world-snapshot.
        try { ws.send(JSON.stringify({ type: 'world-subscribe' })); } catch {}
      });
      ws.addEventListener('close', () => {
        if (cancelled) return;
        setWsState('offline');
        retryTimer = setTimeout(connect, 2500);
      });
      ws.addEventListener('error', () => {
        if (cancelled) return;
        setWsState('error');
      });
      ws.addEventListener('message', (m) => {
        let parsed;
        try { parsed = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString()); }
        catch { return; }
        handleDaemonEvent(parsed);
      });
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) ws.close();
    };
  }, []);

  // Open tabs + active tab persist across reload via localStorage. Restored tabs
  // re-render their content from scratch — file tabs re-fetch via MarkdownTab's
  // first-render effect; vault-preview tabs re-render from their stored path.
  // If a restored tab references an agent that no longer exists, the tab still
  // renders and surfaces its own error state (not pruned at hydration time
  // because the agents list arrives async from the daemon).
  const [tabs, setTabs] = useStateA(() => {
    try {
      const raw = localStorage.getItem('squadron.openTabs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.some(t => t && t.id === 'grid')) return parsed;
      }
    } catch {}
    return [{ id: 'grid', kind: 'grid', title: 'The Grid' }];
  });
  const [activeTab, setActiveTab] = useStateA(() => {
    try {
      const tabsRaw = localStorage.getItem('squadron.openTabs');
      const activeRaw = localStorage.getItem('squadron.activeTab');
      if (tabsRaw && activeRaw) {
        const tabsParsed = JSON.parse(tabsRaw);
        const activeParsed = JSON.parse(activeRaw);
        if (Array.isArray(tabsParsed) && tabsParsed.some(t => t && t.id === activeParsed)) {
          return activeParsed;
        }
      }
    } catch {}
    return 'grid';
  });
  useEffectA(() => {
    try { localStorage.setItem('squadron.openTabs', JSON.stringify(tabs)); } catch {}
  }, [tabs]);
  useEffectA(() => {
    try { localStorage.setItem('squadron.activeTab', JSON.stringify(activeTab)); } catch {}
  }, [activeTab]);

  const [connections, setConnections] = useStateA([
    { provider: 'claude', connType: 'cli-sub', label: 'claude · subscription via cli' },
    { provider: 'codex', connType: 'cli-sub', label: 'codex · subscription via cli' },
  ]);
  const [wizard, setWizard] = useStateA({ open: false, initialProvider: null });
  const openWizard = (initialProvider = null) => setWizard({ open: true, initialProvider });
  const closeWizard = () => setWizard({ open: false, initialProvider: null });
  const handleConnect = (c) => setConnections(prev => {
    if (prev.some(x => x.provider === c.provider && x.connType === c.connType)) return prev;
    return [...prev, c];
  });

  const focusedAgent = agents.find(a => a.id === focusedAgentId) || null;

  // ---------- Resizable sidebars (M3 follow-up) ----------
  const readNum = (k, fallback) => {
    try { const v = parseInt(localStorage.getItem(k) || '', 10); return Number.isFinite(v) ? v : fallback; }
    catch { return fallback; }
  };
  const [leftWidth, setLeftWidth]   = useStateA(() => readNum('sq.leftWidth', 280));
  const [rightWidth, setRightWidth] = useStateA(() => readNum('sq.rightWidth', 320));
  useEffectA(() => { try { localStorage.setItem('sq.leftWidth',  String(leftWidth)); } catch {} },  [leftWidth]);
  useEffectA(() => { try { localStorage.setItem('sq.rightWidth', String(rightWidth)); } catch {} }, [rightWidth]);

  const startResize = (side) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftWidth : rightWidth;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (side === 'left') {
        setLeftWidth(Math.max(220, Math.min(560, startW + dx)));
      } else {
        setRightWidth(Math.max(240, Math.min(640, startW - dx)));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const resizerStyle = (side) => ({
    position: 'absolute',
    [side === 'left' ? 'right' : 'left']: -3,
    top: 0,
    bottom: 0,
    width: 6,
    cursor: 'col-resize',
    zIndex: 10,
  });

  // ---------- Recent text per agent for speech bubbles ----------
  const agentRecentText = React.useMemo(() => {
    const out = {};
    for (const aid in realChats) {
      const list = realChats[aid] || [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].side === 'them' && list[i].text) {
          out[aid] = list[i].text;
          break;
        }
      }
    }
    return out;
  }, [realChats]);

  // Focus → auto-open user-chat in the left sidebar.
  // (Originally specced as "highlight only" but felt friction-y in practice.)
  useEffectA(() => {
    if (!focusedAgentId) return;
    const a = agents.find(x => x.id === focusedAgentId);
    if (!a) return;
    setLeftView({
      kind: 'chat',
      conversation: {
        id: 'user-' + a.id,
        kind: 'user',
        agentId: a.id,
        label: a.name,
        last: '',
        time: '—',
        status: 'live',
        unread: false,
      },
    });
    // intentionally only on focusedAgentId change — name updates etc shouldn't re-trigger
  }, [focusedAgentId]);

  // ---------- Derived conversations list (M1: synthesized from agents + adjacency) ----------
  // One user-chat row per agent (Draft included), plus one placeholder inter-agent
  // row for each pair of currently-adjacent agents. Inter-agent comms aren't wired
  // until M3 — these rows just open empty chats so the UX shape is testable.
  const conversations = React.useMemo(() => {
    const out = [];
    // user-chat rows
    for (const a of agents) {
      const chat = realChats[a.id] || [];
      const lastMsg = chat[chat.length - 1];
      out.push({
        id: 'user-' + a.id,
        kind: 'user',
        agentId: a.id,
        label: a.name,
        last: lastMsg ? (lastMsg.text || '').slice(0, 80) : (a.status === 'Draft' ? 'no messages — say hi to boot the agent' : 'no messages yet'),
        time: lastMsg ? 'now' : (a.lastAt || '—'),
        // Always live for user chats — Draft just means the subprocess hasn't booted; the chat is still open for typing.
        status: 'live',
        unread: false,
        pulsing: a.state === 'thinking' || a.state === 'tool-running',
      });
    }
    // Inter-agent rows — direct hex-adjacency + router-bridged via cluster BFS.
    const areAdjacent = window.SQ?.areAdjacent;
    const HEX_DIRS = window.SQ?.HEX_DIRS;
    const hexKey = window.SQ?.hexKey;
    if (areAdjacent && HEX_DIRS && hexKey) {
      const seenPair = new Set();
      const addPair = (a, b, via) => {
        const ids = [a.id, b.id].sort();
        const k = ids.join('-');
        if (seenPair.has(k)) return;
        seenPair.add(k);
        const sessionKey = interSessionId(a.id, b.id);
        const msgs = interAgentChats[sessionKey] || [];
        const last = msgs[msgs.length - 1];
        out.push({
          id: 'inter-' + k,
          kind: 'inter',
          agentIds: [a.id, b.id],
          label: a.name + ' ↔ ' + b.name,
          last: last
            ? (last.text || '').slice(0, 80)
            : (via === 'direct' ? 'adjacent · no messages yet' : 'router-bridged · no messages yet'),
          time: last ? 'now' : '—',
          status: 'live',
          unread: false,
          pulsing: false,
        });
      };

      // Direct adjacency
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          if (areAdjacent(agents[i], agents[j])) addPair(agents[i], agents[j], 'direct');
        }
      }

      // Router clusters: BFS over router-router hex adjacency.
      const routerKeys = new Set(routers.map(rt => hexKey(rt.q, rt.r)));
      const clusterOf = new Map(); // routerKey → cluster id
      let cid = 0;
      for (const rt of routers) {
        const startKey = hexKey(rt.q, rt.r);
        if (clusterOf.has(startKey)) continue;
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
      // For each cluster: collect agents adjacent to any router in the cluster.
      const agentsByCluster = new Map();
      for (const a of agents) {
        const seenC = new Set();
        for (const rt of routers) {
          if (areAdjacent(a, rt)) {
            const c = clusterOf.get(hexKey(rt.q, rt.r));
            if (!seenC.has(c)) {
              seenC.add(c);
              if (!agentsByCluster.has(c)) agentsByCluster.set(c, []);
              agentsByCluster.get(c).push(a);
            }
          }
        }
      }
      for (const list of agentsByCluster.values()) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            addPair(list[i], list[j], 'router');
          }
        }
      }
    }
    return out;
  }, [agents, realChats, routers, interAgentChats]);

  // Mock loop-detector flag — toggles every 18s on inter-agent.
  useEffectA(() => {
    const id = setInterval(() => setLoopFlag(f => !f), 9000);
    return () => clearInterval(id);
  }, []);

  const handleConvOpen = (c) => setLeftView({ kind: 'chat', conversation: c });
  const handleConvBack = () => setLeftView({ kind: 'list', conversation: null });

  // Right-click "message…" action from the grid opens that agent's user chat.
  useEffectA(() => {
    const handler = (e) => {
      const agentId = e.detail && e.detail.agentId;
      if (!agentId) return;
      const conv = conversations.find(c => c.kind === 'user' && c.agentId === agentId);
      if (conv) setLeftView({ kind: 'chat', conversation: conv });
      else {
        // synthesize a conversation row for agents that don't have one yet
        const a = agents.find(x => x.id === agentId);
        if (a) setLeftView({ kind: 'chat', conversation: {
          id: 'syn-' + agentId, kind: 'user', agentId, label: a.name,
          last: '—', time: 'now', status: a.status === 'Draft' ? 'archived' : 'live',
        }});
      }
    };
    window.addEventListener('sq:open-chat', handler);
    return () => window.removeEventListener('sq:open-chat', handler);
  }, [conversations, agents]);
  const handleConvSend = (text) => {
    const c = leftView.conversation;
    if (!c || c.kind !== 'user') return;
    if (wsState !== 'connected') return;
    // Just send. Daemon persists the user message + auto-boots the agent if needed,
    // then broadcasts message-appended → UI renders. No optimistic local append.
    sendToDaemon({ type: 'send-message', agentId: c.agentId, text });
  };

  // ---- World action callbacks (daemon-routed) ----
  const handleSpawnAt = (q, r) => {
    if (wsState !== 'connected') return;
    sendToDaemon({ type: 'create-agent', q, r });
  };
  const handleMoveAgent = (id, q, r) => {
    if (wsState !== 'connected') return;
    sendToDaemon({ type: 'update-agent', agentId: id, patch: { q, r } });
  };
  const handleDeleteAgent = (id) => {
    if (wsState !== 'connected') return;
    sendToDaemon({ type: 'delete-agent', agentId: id });
  };
  const handlePlaceFeature = (q, r, kind) => {
    if (wsState !== 'connected') return;
    sendToDaemon({ type: 'place-feature', q, r, kind });
  };
  const handleRemoveFeature = (q, r) => {
    if (wsState !== 'connected') return;
    sendToDaemon({ type: 'remove-feature', q, r });
  };
  const handleAgentConfigChange = (next) => {
    // From the right-sidebar AgentConfig editor — picks fields to send as a patch.
    if (wsState !== 'connected') {
      // Fallback: still update local state so UI doesn't feel frozen offline.
      setAgents(prev => prev.map(a => a.id === next.id ? next : a));
      return;
    }
    const prev = agents.find(a => a.id === next.id);
    if (!prev) return;
    const patch = {};
    if (next.name !== prev.name)             patch.name         = next.name;
    if (next.glyph !== prev.glyph)           patch.glyph        = next.glyph;
    if (next.color !== prev.color)           patch.color        = next.color;
    if (next.sysPrompt !== prev.sysPrompt)   patch.systemPrompt = next.sysPrompt;
    if (next.model !== prev.model)           patch.model        = next.model;
    if (next.movementEnabled !== prev.movementEnabled) patch.movementEnabled = !!next.movementEnabled;
    if (Object.keys(patch).length === 0) return;
    // Optimistic local update — keeps controlled inputs (checkbox, color picker)
    // from snapping back to the old value while we wait for the daemon's
    // agent-updated broadcast. The broadcast still arrives and re-syncs.
    setAgents(prevAgents => prevAgents.map(a => a.id === next.id ? { ...a, ...patch, sysPrompt: patch.systemPrompt ?? a.sysPrompt } : a));
    sendToDaemon({ type: 'update-agent', agentId: next.id, patch });
  };

  // M3-vault-edit: tabs are keyed by (agentId, path) instead of "vaultName/path",
  // because the vault folder on disk is keyed by AGENT ID, not by the (display) vault name.
  const handleOpenFile = (agentId, filename) => {
    if (!agentId || !filename) return;
    const id = 'file:' + agentId + ':' + filename;
    const ag = agents.find(a => a.id === agentId);
    const badge = ag ? ag.name : agentId.slice(0, 6);
    if (!tabs.some(t => t.id === id))
      setTabs(prev => [...prev, { id, kind: 'file', title: filename, badge, agentId, path: filename }]);
    setActiveTab(id);
  };

  // Open ANY vault file referenced from chat. Resolves bare names against the
  // agent's vaultFiles list (handles e.g. "01-home.md" → "screens/01-home.md").
  // Routes by extension to the right tab kind.
  const handleOpenVaultFile = (agentId, filename) => {
    if (!agentId || !filename) return;
    const ag = agents.find(a => a.id === agentId);
    if (!ag) return;
    const files = ag.vaultFiles || [];
    let resolved = filename;
    if (!files.includes(filename)) {
      // Try suffix match (e.g. "01-home.md" → "screens/01-home.md").
      const suffix = filename.startsWith('/') ? filename : '/' + filename;
      const hit = files.find(f => ('/' + f).endsWith(suffix));
      if (hit) resolved = hit;
    }
    const isMd = /\.(md|markdown|txt)$/i.test(resolved);
    if (isMd) { handleOpenFile(agentId, resolved); return; }
    // .html, images, videos, others → vault-preview tab (iframe / <img> / <video>).
    const id = 'vault:' + agentId + ':' + resolved;
    const badge = ag ? ag.name : agentId.slice(0, 6);
    if (!tabs.some(t => t.id === id))
      setTabs(prev => [...prev, { id, kind: 'vault-preview', title: resolved.split('/').pop(), badge, agentId, path: resolved }]);
    setActiveTab(id);
  };
  const handleCloseTab = (id) => {
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTab === id) setActiveTab('grid');
  };

  // Reorder tabs by drag-and-drop. The Grid is always pinned at index 0 and
  // can't be moved across or by; moveBefore the grid is treated as moveAfter it.
  const handleReorderTab = (sourceId, targetId, side) => {
    if (sourceId === targetId) return;
    setTabs(prev => {
      const src = prev.find(t => t.id === sourceId);
      if (!src || src.kind === 'grid') return prev;
      const without = prev.filter(t => t.id !== sourceId);
      let targetIdx = without.findIndex(t => t.id === targetId);
      if (targetIdx < 0) return prev;
      // Refuse to drop before the grid tab.
      if (without[targetIdx].kind === 'grid') {
        side = 'after';
      }
      const insertAt = side === 'before' ? targetIdx : targetIdx + 1;
      const next = without.slice();
      next.splice(insertAt, 0, src);
      return next;
    });
  };

  const handlePinTab = (id) => {
    setTabs(prev => {
      const t = prev.find(x => x.id === id);
      if (!t || t.kind === 'grid') return prev;
      const nowPinned = !t.pinned;
      const updated = prev.map(x => x.id === id ? { ...x, pinned: nowPinned } : x);
      if (!nowPinned) return updated;
      // On pin: move just after the grid tab (or to the front if grid isn't first).
      const target = updated.find(x => x.id === id);
      const without = updated.filter(x => x.id !== id);
      const gridIdx = without.findIndex(x => x.kind === 'grid');
      const insertAt = gridIdx >= 0 ? gridIdx + 1 : 0;
      const next = without.slice();
      next.splice(insertAt, 0, target);
      return next;
    });
  };

  const handleDuplicateTab = (id) => {
    const t = tabs.find(x => x.id === id);
    if (!t || t.kind === 'grid' || t.kind === 'settings') return;
    // Stable suffix so reopening the same dup doesn't keep accumulating tabs.
    let n = 2;
    while (tabs.some(x => x.id === `${id}#${n}`)) n++;
    const newId = `${id}#${n}`;
    const dup = { ...t, id: newId, pinned: false, title: t.title + ' (copy)' };
    setTabs(prev => {
      const idx = prev.findIndex(x => x.id === id);
      const next = prev.slice();
      next.splice(idx + 1, 0, dup);
      return next;
    });
    setActiveTab(newId);
  };

  // When viewing a memory-graph tab, the left sidebar shows the agent list and
  // clicking an agent rebinds the active graph tab to that agent (or jumps to
  // an existing graph tab if one is already open for that agent).
  const handleSwitchGraphAgent = (newAgentId) => {
    const cur = tabs.find(t => t.id === activeTab && t.kind === 'memory-graph');
    if (!cur || cur.agentId === newAgentId) return;
    const existingForTarget = tabs.find(t => t.kind === 'memory-graph' && t.agentId === newAgentId && t.id !== cur.id);
    if (existingForTarget) { setActiveTab(existingForTarget.id); return; }
    const ag = agents.find(a => a.id === newAgentId);
    const newId = 'graph:' + newAgentId;
    const newTitle = 'graph · ' + (ag ? ag.name : newAgentId.slice(0, 6));
    setTabs(prev => prev.map(t => t.id === cur.id
      ? { ...t, id: newId, agentId: newAgentId, title: newTitle }
      : t));
    setActiveTab(newId);
  };

  const handleDeleteTabFile = (id) => {
    const t = tabs.find(x => x.id === id);
    if (!t || t.kind !== 'file') return;
    if (!window.confirm(`delete "${t.path}" from ${t.badge || 'this agent'}'s vault?\n\nthis removes the file from disk. it cannot be undone.`)) return;
    sendToDaemon({ type: 'delete-vault-file', agentId: t.agentId, path: t.path });
    handleCloseTab(id);
  };
  const openMemoryGraph = (agentId) => {
    if (!agentId) return;
    const id = 'graph:' + agentId;
    const ag = agents.find(a => a.id === agentId);
    const title = 'graph · ' + (ag ? ag.name : agentId.slice(0, 6));
    if (!tabs.some(t => t.id === id))
      setTabs(prev => [...prev, { id, kind: 'memory-graph', title, agentId }]);
    setActiveTab(id);
  };
  const openSettings = () => {
    if (!tabs.some(t => t.id === 'settings'))
      setTabs(prev => [...prev, { id: 'settings', kind: 'settings', title: 'settings' }]);
    setActiveTab('settings');
  };

  const updateAgent = handleAgentConfigChange;

  return (
    <div className="app" style={{ gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px` }}>
      <TopBar killed={killed} onKillSwitch={() => {
                const nextKilled = !killed;
                setKilled(nextKilled);
                // Daemon owns the autonomy gate; broadcast keeps multi-tab in sync.
                sendToDaemon({ type: 'set-autonomy', enabled: !nextKilled });
              }} openSettings={openSettings}
        autoWalkOn={autoWalkOn} setAutoWalkOn={setAutoWalkOn}
        openWizard={openWizard} connectionCount={connections.length}
        daemonStatus={wsState} />
      <div className="left" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div onMouseDown={startResize('left')} style={resizerStyle('left')} title="drag to resize" />
        {/* Top of left sidebar: header + sessions/agents toggle.
            The toggle hides when reading a chat (the chat has its own back button). */}
        {leftView.kind === 'list' && (
          <div className="left-head" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h3 style={{ margin: 0, flex: 1 }}>/// {leftMode === 'agents' ? 'AGENTS' : 'SESSIONS'}</h3>
            <span className="marker" style={{ marginRight: 6 }}>
              {leftMode === 'agents' ? agents.length : conversations.length}
            </span>
            <div style={{ display: 'flex', border: '1px solid var(--sb-line)', borderRadius: 4, overflow: 'hidden' }}>
              {['agents', 'sessions'].map(m => (
                <button key={m}
                  onClick={() => setLeftMode(m)}
                  style={{
                    background: leftMode === m ? 'var(--sb-surface)' : 'transparent',
                    color: leftMode === m ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
                    border: 'none', cursor: 'pointer',
                    padding: '4px 10px',
                    fontFamily: 'var(--sb-font-mono)', fontSize: 10,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}
                >{m}</button>
              ))}
            </div>
          </div>
        )}
        {leftView.kind === 'list' ? (
          (() => {
            // Pick the click handler based on context:
            //   - graph tab active → switch the graph view
            //   - otherwise → focus the agent + open its user-chat
            const activeTabObj = tabs.find(t => t.id === activeTab);
            const inGraphMode = activeTabObj && activeTabObj.kind === 'memory-graph';
            if (leftMode === 'agents') {
              // Click split (May 2026 redesign): single click focuses without
              // navigating; double-click / Enter opens the agent's chat. In
              // graph mode, single-click rebinds the graph view (legacy
              // behavior — chat-open path doesn't apply).
              const onPick = inGraphMode
                ? handleSwitchGraphAgent
                : (id) => setFocusedAgentId(id);
              const onOpen = inGraphMode
                ? null
                : (id) => {
                    setFocusedAgentId(id);
                    const conv = conversations.find(c => c.kind === 'user' && c.agentId === id);
                    if (conv) handleConvOpen(conv);
                  };
              const selectedId = inGraphMode
                ? (activeTabObj && activeTabObj.agentId)
                : focusedAgentId;
              return <AgentsList
                agents={agents}
                selectedId={selectedId}
                onPick={onPick}
                onOpen={onOpen}
                modeBadge={inGraphMode ? 'VIEWING' : 'FOCUSED'}
                onSpawnNew={() => { setActiveTab('grid'); setMode('spawn'); }}
              />;
            }
            return <LeftList
              conversations={conversations}
              agents={agents}
              focusedAgentId={focusedAgentId}
              onOpen={handleConvOpen}
            />;
          })()
        ) : (
          <ChatView
              conversation={(() => {
                // Re-derive the live conversation from the current agents
                // state so renames/state changes flow through after the user
                // has already opened the chat. The captured leftView.conversation
                // is only the original "key" — labels are recomputed every render.
                const c = leftView.conversation;
                if (!c) return c;
                if (c.kind === 'user') {
                  const a = agents.find(x => x.id === c.agentId);
                  // Daemon only returns 'Live' / 'Draft' for agent.status; there's
                  // no 'archived' state today. Always treat user-DM conversations
                  // as live until we model archive explicitly.
                  return a ? { ...c, label: a.name, status: 'live' } : c;
                }
                if (c.kind === 'inter' && Array.isArray(c.agentIds) && c.agentIds.length === 2) {
                  const a = agents.find(x => x.id === c.agentIds[0]);
                  const b = agents.find(x => x.id === c.agentIds[1]);
                  if (a && b) return { ...c, label: a.name + ' ↔ ' + b.name };
                }
                return c;
              })()}
              agents={agents}
              onBack={handleConvBack} onSend={handleConvSend} loopFlag={loopFlag}
              onOpenVaultFile={handleOpenVaultFile}
              messages={(() => {
                const c = leftView.conversation;
                if (!c) return null;
                if (c.kind === 'user') return realChats[c.agentId];
                if (c.kind === 'inter' && Array.isArray(c.agentIds) && c.agentIds.length === 2) {
                  const k = interSessionId(c.agentIds[0], c.agentIds[1]);
                  const msgs = interAgentChats[k] || [];
                  const nameOf = id => (agents.find(a => a.id === id)?.name) || id;
                  return msgs.map(m => ({
                    _msgId: m.id,
                    side: 'them',
                    who: nameOf(m.fromAgentId),
                    text: m.text,
                    createdAt: m.createdAt,
                  }));
                }
                return null;
              })()} />)}
      </div>
      <div className="center">
        <Tabs
          tabs={tabs}
          agents={agents}
          activeId={activeTab}
          onActivate={setActiveTab}
          onClose={handleCloseTab}
          onReorder={handleReorderTab}
          onPin={handlePinTab}
          onDuplicate={handleDuplicateTab}
          onDelete={handleDeleteTabFile}
          onCloseOthers={(keepId) => setTabs(prev => prev.filter(x => x.kind === 'grid' || x.id === keepId))}
          onRename={(tabId, newPath) => {
            const t = tabs.find(x => x.id === tabId);
            if (!t || t.kind !== 'file') return;
            sendToDaemon({ type: 'move-vault-file', agentId: t.agentId, oldPath: t.path, newPath });
          }}
        />
        {activeTab === 'grid'
          ? <HexGrid agents={agents} setAgents={setAgents}
              walls={walls} setWalls={setWalls}
              routers={routers} setRouters={setRouters}
              focusedAgentId={focusedAgentId} setFocusedAgentId={setFocusedAgentId}
              mode={mode} setMode={setMode} killed={killed}
              edgeStates={edgeStates} setEdgeStates={setEdgeStates}
              loopFlag={loopFlag}
              shortcuts={shortcuts}
              onSpawnAt={handleSpawnAt}
              onMoveAgent={handleMoveAgent}
              onDeleteAgent={handleDeleteAgent}
              onPlaceFeature={handlePlaceFeature}
              onRemoveFeature={handleRemoveFeature}
              agentRecentText={agentRecentText} />
          : activeTab === 'settings'
            ? <SettingsTab
                connections={connections}
                openWizard={openWizard}
                shortcuts={shortcuts}
                rebindShortcut={rebindShortcut}
                resetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
              />
            : (() => {
                const tab = tabs.find(t => t.id === activeTab);
                if (!tab) return null;
                if (tab.kind === 'memory-graph') {
                  const ag = agents.find(a => a.id === tab.agentId);
                  return <MemoryGraphTab
                    agent={ag}
                    nodeColors={nodeColors}
                    setNodeColor={setNodeColor}
                    onOpenFile={handleOpenFile}
                  />;
                }
                if (tab.kind === 'vault-preview') {
                  const ag = agents.find(a => a.id === tab.agentId);
                  const src = vaultUrl(tab.agentId, tab.path);
                  const isHtml = /\.html?$/i.test(tab.path);
                  const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(tab.path);
                  const isVideo = /\.(mp4|webm|mov)$/i.test(tab.path);
                  return (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--sb-bg)' }}>
                      <div style={{
                        padding: '8px 14px', borderBottom: '1px solid var(--sb-line)',
                        fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg-muted)',
                        display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '0.04em',
                      }}>
                        <span>/// PREVIEW · {ag?.name || tab.agentId.slice(0, 8)} / {tab.path}</span>
                        <span style={{ flex: 1 }} />
                        <a href={src} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--sb-fg-muted)', textDecoration: 'underline' }}
                        >open in new browser tab ↗</a>
                      </div>
                      <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
                        {isHtml ? (
                          <iframe
                            src={src}
                            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                            title={tab.path}
                          />
                        ) : isImg ? (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100%', padding: 16 }}>
                            <img src={src} alt={tab.path} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : isVideo ? (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100%', padding: 16 }}>
                            <video src={src} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
                          </div>
                        ) : (
                          <iframe
                            src={src}
                            sandbox=""
                            style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }}
                            title={tab.path}
                          />
                        )}
                      </div>
                    </div>
                  );
                }
                if (tab.kind !== 'file') return null;
                const key = vaultKey(tab.agentId, tab.path);
                const entry = vaultFileContents[key];
                const ag = agents.find(a => a.id === tab.agentId);
                return <MarkdownTab
                  tab={tab}
                  vaultEntry={entry}
                  agentName={ag?.name || tab.badge}
                  vaultFiles={ag?.vaultFiles || []}
                  vaultEdges={ag?.vaultEdges || []}
                  requestVaultFile={(aid, p) => sendToDaemon({ type: 'read-vault-file', agentId: aid, path: p })}
                  writeVaultFile={(aid, p, c) => sendToDaemon({ type: 'write-vault-file', agentId: aid, path: p, content: c })}
                  onOpenFile={handleOpenVaultFile}
                />;
              })()}
      </div>
      <div className="right" style={{ position: 'relative' }}>
        <div onMouseDown={startResize('right')} style={resizerStyle('right')} title="drag to resize" />
        {(() => {
          // While a memory-graph tab is the active center tab, the right sidebar
          // becomes a per-file panel for that agent's vault (rename, color,
          // links, delete). Otherwise the standard agent-config view.
          const activeTabObj = tabs.find(t => t.id === activeTab);
          const inGraphMode = activeTabObj && activeTabObj.kind === 'memory-graph';
          // Key drives the 120ms cross-fade between modes — re-keying remounts
          // the inner subtree, which re-runs the panel-fade animation.
          const panelKey = inGraphMode
            ? `files:${activeTabObj.agentId}`
            : `config:${focusedAgent?.id || 'none'}`;
          let inner;
          if (inGraphMode) {
            const ag = agents.find(a => a.id === activeTabObj.agentId);
            inner = (
              <MemoryGraphFilesPanel
                agent={ag}
                nodeColors={nodeColors}
                setNodeColor={setNodeColor}
                onOpenFile={handleOpenFile}
                onDeleteFile={(aid, p) => {
                  if (!window.confirm(`delete "${p}" from this agent's vault?\n\nthis removes the file from disk. it cannot be undone.`)) return;
                  sendToDaemon({ type: 'delete-vault-file', agentId: aid, path: p });
                }}
                onRenameFile={(aid, oldPath, newPath) => {
                  sendToDaemon({ type: 'move-vault-file', agentId: aid, oldPath, newPath });
                }}
              />
            );
          } else {
            inner = (
              <AgentConfig
                agent={focusedAgent}
                onChange={updateAgent}
                onOpenFile={handleOpenFile}
                onOpenMemoryGraph={openMemoryGraph}
                nodeColors={nodeColors}
                connections={connections}
                openWizard={openWizard}
                onInstallSkill={(agentId, name, content) => sendToDaemon({ type: 'install-skill', agentId, name, content })}
                onUninstallSkill={(agentId, name) => sendToDaemon({ type: 'uninstall-skill', agentId, name })}
              />
            );
          }
          return (
            <div key={panelKey} style={{
              animation: 'panel-fade 120ms ease',
              display: 'flex', flexDirection: 'column',
              flex: 1, minHeight: 0, height: '100%',
            }}>{inner}</div>
          );
        })()}
      </div>
      <ConnectionsWizard
        open={wizard.open}
        initialProvider={wizard.initialProvider}
        onClose={closeWizard}
        onConnect={handleConnect}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
