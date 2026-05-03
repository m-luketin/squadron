// Artboard 02 — Right sidebar in three modes, one grammar.
// Goal: AgentConfig / FilesPanel / ProfileEditor share breadcrumb, header rhythm, body density.

// ---------- shared sidebar shell ----------
function RSShell({ crumbs, title, subtitle, accent = 'var(--sb-accent)', children, footer, glyph }) {
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* fixed grammar: 24px crumb row, 64px header, body, optional footer */}
      <div style={{
        height: 26, display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 16px',
        fontFamily: 'var(--sb-font-mono)', fontSize: 10,
        color: 'var(--sb-fg-faint)', letterSpacing: '0.06em',
        borderBottom: '1px solid var(--sb-line-soft)',
        background: 'var(--sb-bg-deep, #050505)',
      }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: 'var(--sb-fg-disabled)' }}>›</span>}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--sb-fg-muted)' : 'var(--sb-fg-faint)' }}>{c}</span>
          </React.Fragment>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--sb-fg-disabled)' }}>esc</span>
      </div>

      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--sb-line-soft)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {glyph}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'var(--sb-font-display)', fontSize: 18,
            letterSpacing: '-0.01em', color: 'var(--sb-fg)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11.5, color: 'var(--sb-fg-faint)', marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {children}
      </div>

      {footer && (
        <div style={{
          borderTop: '1px solid var(--sb-line-soft)',
          padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center',
          fontSize: 11.5, color: 'var(--sb-fg-faint)',
        }}>{footer}</div>
      )}
    </div>
  );
}

function Section({ label, children, action }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div className="marker" style={{ color: 'var(--sb-fg-faint)' }}>/// {label}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, mono, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '5px 0',
      fontSize: 12, lineHeight: 1.4,
      borderBottom: '1px dotted var(--sb-line-soft)',
    }}>
      <span style={{ color: 'var(--sb-fg-faint)', fontFamily: mono ? 'var(--sb-font-mono)' : undefined, fontSize: mono ? 11 : 12 }}>{k}</span>
      <span style={{
        color: muted ? 'var(--sb-fg-muted)' : 'var(--sb-fg)',
        fontFamily: mono ? 'var(--sb-font-mono)' : undefined,
        fontSize: mono ? 11 : 12,
        textAlign: 'right',
      }}>{v}</span>
    </div>
  );
}

// ---------- 02a · AgentConfig ----------
function BoardRSAgentConfig() {
  const a = window.MOCK.AGENTS[1]; // Mercury
  return (
    <>
      <RSShell
        crumbs={['agents', a.name.toLowerCase()]}
        title={a.name}
        subtitle={`live · ${a.model} · vault: ${a.vault}`}
        glyph={
          <div style={{
            width: 40, height: 40, borderRadius: 4,
            background: a.color + '22', border: '1px solid ' + a.color + '60',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: a.color, fontFamily: 'var(--sb-font-display)', fontSize: 22, lineHeight: 1,
          }}>{a.glyph}</div>
        }
        footer={<>
          <button style={{
            background: 'transparent', border: '1px solid var(--sb-line)',
            color: 'var(--sb-fg-muted)', fontSize: 11, padding: '5px 10px',
            borderRadius: 3, cursor: 'pointer',
          }}>chat</button>
          <button style={{
            background: 'transparent', border: '1px solid var(--sb-line)',
            color: 'var(--sb-fg-muted)', fontSize: 11, padding: '5px 10px',
            borderRadius: 3, cursor: 'pointer',
          }}>open vault</button>
          <span style={{ marginLeft: 'auto', color: 'var(--sb-fg-disabled)', fontSize: 10.5 }}>last edit · 4m</span>
        </>}
      >
        <Section label="IDENTITY">
          <Row k="name" v={a.name} />
          <Row k="glyph" v={a.glyph} />
          <Row k="color" v={a.color} mono />
          <Row k="vault" v={a.vault + '/'} mono />
        </Section>

        <Section label="MODEL">
          <Row k="model" v={a.model} mono />
          <Row k="temperature" v="0.7" mono />
          <Row k="max tokens" v="8192" mono />
        </Section>

        <Section label="SYSTEM PROMPT" action={<span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>edit</span>}>
          <div style={{
            fontFamily: 'var(--sb-font-mono)', fontSize: 11.5,
            color: 'var(--sb-fg-muted)', lineHeight: 1.55,
            padding: 10, border: '1px solid var(--sb-line-soft)',
            borderRadius: 3, background: 'rgba(255,255,255,0.015)',
          }}>
            you are mercury. you ship. when tests pass and the diff is clean you say "ready".  you don't hedge. you ask one question max before acting.
          </div>
        </Section>

        <Section label="TOOLS · 8 ENABLED">
          {['shell','read_file','write_file','grep','run_tests','git','http','vault'].map(t => (
            <Row key={t} k={t} v="●" mono muted />
          ))}
        </Section>

        <Section label="STATS">
          <Row k="messages" v={a.msgs.toString()} mono />
          <Row k="tool calls" v={a.tools.toString()} mono />
          <Row k="last active" v={a.lastAt} mono />
        </Section>
      </RSShell>

      <div className="anno" style={{ left: 14, top: 6 }}>
        <div className="anno-text"><span className="num">1</span>shared crumb row · 26px</div>
      </div>
      <div className="anno" style={{ left: 14, top: 60 }}>
        <div className="anno-text"><span className="num">2</span>shared header — glyph · title · sub</div>
      </div>
      <div className="anno" style={{ left: 200, top: 240 }}>
        <div className="anno-text"><span className="num">3</span>section marker grammar</div>
      </div>
    </>
  );
}

// ---------- 02b · FilesPanel ----------
function BoardRSFiles() {
  const tree = window.MOCK.VAULT_FILES_ATLAS;
  // build a folder structure
  const grouped = {};
  for (const p of tree) {
    const parts = p.split('/');
    if (parts.length === 1) {
      (grouped['__root'] ||= []).push(parts[0]);
    } else {
      const folder = parts.slice(0, -1).join('/');
      (grouped[folder] ||= []).push(parts[parts.length - 1]);
    }
  }

  return (
    <>
      <RSShell
        crumbs={['vault', 'atlas']}
        title="atlas/"
        subtitle="18 files · 4 folders · 142 backlinks"
        glyph={
          <div style={{
            width: 40, height: 40, borderRadius: 4,
            background: 'rgba(127,182,217,0.12)', border: '1px solid rgba(127,182,217,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#7fb6d9', fontFamily: 'var(--sb-font-mono)', fontSize: 11, fontWeight: 600,
          }}>md</div>
        }
        footer={<>
          <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5 }}>⌘N · new</span>
          <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5 }}>⌘F · find</span>
          <span style={{ marginLeft: 'auto', color: 'var(--sb-fg-disabled)' }}>342 KB</span>
        </>}
      >
        {/* search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          border: '1px solid var(--sb-line-soft)',
          borderRadius: 3,
          marginBottom: 14,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 11, color: 'var(--sb-fg-faint)' }}>/</span>
          <span style={{ fontSize: 12, color: 'var(--sb-fg-muted)' }}>find in atlas…</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>⌘F</span>
        </div>

        {/* root files */}
        <Section label="ROOT">
          {(grouped['__root'] || []).map(f => (
            <FileRow key={f} name={f} active={f === 'index.md'} />
          ))}
        </Section>

        {Object.keys(grouped).filter(k => k !== '__root').map(folder => (
          <Section key={folder} label={folder.toUpperCase() + ' · ' + grouped[folder].length}>
            {grouped[folder].map(f => <FileRow key={f} name={f} indent />)}
          </Section>
        ))}
      </RSShell>

      <div className="anno" style={{ left: 14, top: 6 }}>
        <div className="anno-text"><span className="num">1</span>same crumb row · "vault › atlas"</div>
      </div>
      <div className="anno" style={{ left: 14, top: 60 }}>
        <div className="anno-text"><span className="num">2</span>same header — md glyph instead of agent</div>
      </div>
      <div className="anno" style={{ left: 14, top: 168 }}>
        <div className="anno-text"><span className="num">3</span>find-in-vault · ⌘F target</div>
      </div>
    </>
  );
}

function FileRow({ name, active, indent }) {
  const isAsset = name.endsWith('.png');
  const isMd = name.endsWith('.md');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 6px 4px ' + (indent ? '6px' : '6px'),
      borderRadius: 2,
      background: active ? 'var(--sb-surface)' : 'transparent',
      fontSize: 12, color: active ? 'var(--sb-fg)' : 'var(--sb-fg-muted)',
      cursor: 'pointer',
    }}>
      <span style={{
        fontFamily: 'var(--sb-font-mono)', fontSize: 9,
        color: isMd ? '#7fb6d9' : isAsset ? '#9bd1a4' : 'var(--sb-fg-disabled)',
        width: 16,
      }}>{isMd ? 'md' : isAsset ? 'png' : '··'}</span>
      <span style={{ flex: 1 }}>{name}</span>
      {active && <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 9, color: 'var(--sb-accent)' }}>open</span>}
    </div>
  );
}

// ---------- 02c · ProfileEditor ----------
function BoardRSProfile() {
  return (
    <>
      <RSShell
        crumbs={['profile', 'edit']}
        title="you"
        subtitle="symbol · color · display name"
        glyph={
          <div style={{
            width: 40, height: 40, borderRadius: 4,
            background: '#d93b2522', border: '1px solid #d93b2560',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#d93b25', fontFamily: 'var(--sb-font-display)', fontSize: 22,
          }}>◉</div>
        }
        footer={<>
          <button style={{
            background: 'var(--sb-accent)', border: 'none', color: '#fff',
            fontSize: 11, padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
            fontFamily: 'var(--sb-font-mono)', letterSpacing: '0.04em',
          }}>SAVE</button>
          <button style={{
            background: 'transparent', border: '1px solid var(--sb-line)',
            color: 'var(--sb-fg-muted)', fontSize: 11, padding: '5px 10px',
            borderRadius: 3, cursor: 'pointer',
          }}>cancel</button>
          <span style={{ marginLeft: 'auto', color: 'var(--sb-fg-disabled)' }}>esc to close</span>
        </>}
      >
        <Section label="PHOTO · OPTIONAL">
          <div style={{
            width: 96, height: 96, borderRadius: 4,
            border: '1px dashed var(--sb-line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--sb-fg-faint)', fontSize: 11,
            fontFamily: 'var(--sb-font-mono)', flexDirection: 'column', gap: 4,
            background: 'rgba(255,255,255,0.015)',
          }}>
            <span style={{ fontSize: 18 }}>+</span>
            <span>drop image</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--sb-fg-disabled)', marginTop: 6, fontFamily: 'var(--sb-font-mono)' }}>
            or pick a symbol below
          </div>
        </Section>

        <Section label="SYMBOL">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {['◉','◆','◯','✦','♪','☼','☿','♆','◈','⌂','✶','▲','●','■','✱','◐','⬡','✷','♢','✧','⌬'].map((g, i) => (
              <div key={i} style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid ' + (i === 0 ? 'var(--sb-accent)' : 'var(--sb-line-soft)'),
                background: i === 0 ? 'rgba(217,59,37,0.12)' : 'transparent',
                color: i === 0 ? '#fff' : 'var(--sb-fg-muted)',
                fontSize: 16, fontFamily: 'var(--sb-font-display)',
                borderRadius: 3, cursor: 'pointer',
              }}>{g}</div>
            ))}
          </div>
        </Section>

        <Section label="COLOR">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
            {window.MOCK.PALETTE.concat(['#d93b25']).map((c, i) => (
              <div key={i} style={{
                aspectRatio: '1', borderRadius: 999,
                background: c,
                border: c === '#d93b25' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
              }} />
            ))}
          </div>
        </Section>

        <Section label="NAME">
          <input type="text" defaultValue="ronan" style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--sb-line-soft)',
            color: 'var(--sb-fg)', padding: '8px 10px',
            fontSize: 13, fontFamily: 'var(--sb-font-body)',
            borderRadius: 3, outline: 'none',
          }} />
        </Section>

        <Section label="HANDLE · SHOWN TO AGENTS">
          <input type="text" defaultValue="@ronan" style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--sb-line-soft)',
            color: 'var(--sb-fg)', padding: '8px 10px',
            fontSize: 13, fontFamily: 'var(--sb-font-mono)',
            borderRadius: 3, outline: 'none',
          }} />
          <div style={{ fontSize: 10.5, color: 'var(--sb-fg-disabled)', marginTop: 6 }}>
            agents reference you as @handle in their logs.
          </div>
        </Section>
      </RSShell>

      <div className="anno" style={{ left: 14, top: 6 }}>
        <div className="anno-text"><span className="num">1</span>same crumb · "profile › edit"</div>
      </div>
      <div className="anno" style={{ left: 14, top: 60 }}>
        <div className="anno-text"><span className="num">2</span>same header rhythm — accent glyph</div>
      </div>
      <div className="anno" style={{ left: 14, top: 870 }}>
        <div className="anno-text"><span className="num">3</span>SAVE is the one accent button — only red moment</div>
      </div>
    </>
  );
}

window.BoardRSAgentConfig = BoardRSAgentConfig;
window.BoardRSFiles = BoardRSFiles;
window.BoardRSProfile = BoardRSProfile;
