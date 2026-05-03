// Artboard 04 — Markdown editor + chat with typing.

// ---------- 04a · markdown editor ----------
function BoardMDEditor() {
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* fake tab strip strip */}
      <div style={{
        height: 36, display: 'flex',
        borderBottom: '1px solid var(--sb-line)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 14px', background: 'var(--sb-bg-elev)',
          borderRight: '1px solid var(--sb-line)', position: 'relative',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: 2,
            border: '1px solid #7fb6d9', color: '#7fb6d9',
            fontFamily: 'var(--sb-font-mono)', fontSize: 9,
          }}>md</span>
          <span style={{ fontSize: 12 }}>q3-roadmap.md</span>
          <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 9, padding: '1px 5px', border: '1px solid var(--sb-line)', borderRadius: 3, color: 'var(--sb-fg-faint)' }}>atlas</span>
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 1, background: '#7fb6d9' }} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, padding: '32px 56px 40px', overflow: 'hidden', position: 'relative' }}>
          {/* save pill */}
          <div style={{
            position: 'absolute', top: 14, right: 24,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            border: '1px solid rgba(155,209,164,0.4)',
            background: 'rgba(155,209,164,0.08)',
            borderRadius: 999,
            fontFamily: 'var(--sb-font-mono)', fontSize: 10,
            color: '#9bd1a4', letterSpacing: '0.06em',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: '#9bd1a4' }} />
            SAVED · 2s
          </div>

          {/* breadcrumb */}
          <div style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: 'var(--sb-fg-faint)', letterSpacing: '0.06em', marginBottom: 22 }}>
            ATLAS / CONCEPTS / Q3-ROADMAP.MD
          </div>

          <h1 style={{ fontFamily: 'var(--sb-font-display)', fontSize: 32, letterSpacing: '-0.02em', fontWeight: 500, margin: '0 0 18px' }}>
            q3 roadmap
          </h1>

          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--sb-fg)', margin: '0 0 14px' }}>
            the bet for q3 is to ship <WikiLink>concepts/auth-v3</WikiLink> before the vendor
            lock-in window closes on <span style={{ color: 'var(--sb-fg-muted)' }}>july 18</span>. mercury runs
            the implementation; <WikiLink>entities/onyx</WikiLink> reviews. risk register lives in <WikiLink>risks</WikiLink>.
          </p>

          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--sb-fg)', margin: '0 0 14px' }}>
            we have one customer call we want to read first: <FileLink>raw/documents/customer-call-may2.md</FileLink>.
            the wireframe sketch from the offsite is at <FileLink asset>raw/assets/wireframe.png</FileLink>.
          </p>

          <h2 style={{ fontFamily: 'var(--sb-font-display)', fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', margin: '24px 0 10px' }}>scope</h2>
          <ul style={{ paddingLeft: 18, color: 'var(--sb-fg)', fontSize: 14.5, lineHeight: 1.75, margin: 0 }}>
            <li>migrate auth from session to <WikiLink>concepts/auth-v3</WikiLink></li>
            <li>retire the legacy admin shell — see <WikiLink>archive</WikiLink></li>
            <li>publish a <WikiLink>synthesis/q3-tight-rationale</WikiLink> doc by july 25</li>
          </ul>

          {/* live editing — show cursor mid-line at end of the next paragraph */}
          <h2 style={{ fontFamily: 'var(--sb-font-display)', fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', margin: '24px 0 10px' }}>open questions</h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--sb-fg)', margin: 0 }}>
            who owns the rollback plan if the july 18 cutover fails<span style={{
              display: 'inline-block', width: 1.5, height: 18, background: 'var(--sb-accent)',
              verticalAlign: '-3px', marginLeft: 1,
              animation: 'caretBlink 1s steps(2) infinite',
            }} />
          </p>
          <style>{`@keyframes caretBlink { to { opacity: 0; } }`}</style>

          {/* wikilink suggestion popover (mid-typing) */}
          <div style={{
            position: 'absolute', left: 56, top: 410,
            background: 'rgba(10,10,10,0.97)',
            border: '1px solid var(--sb-line)',
            borderRadius: 4, padding: 4, minWidth: 280,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            display: 'none',
          }}>
          </div>
        </div>

        {/* outline rail */}
        <div style={{
          width: 200, borderLeft: '1px solid var(--sb-line)',
          padding: '32px 16px',
          fontFamily: 'var(--sb-font-mono)', fontSize: 11,
          color: 'var(--sb-fg-faint)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div className="marker">/// OUTLINE</div>
          <div style={{ color: 'var(--sb-fg)', borderLeft: '2px solid var(--sb-accent)', paddingLeft: 10, marginLeft: -2 }}>q3 roadmap</div>
          <div style={{ paddingLeft: 12 }}>scope</div>
          <div style={{ paddingLeft: 12, color: 'var(--sb-fg)' }}>open questions</div>

          <div className="marker" style={{ marginTop: 22 }}>/// BACKLINKS · 7</div>
          <div>index.md</div>
          <div>risks.md</div>
          <div>synthesis/q3-tight-rationale.md</div>
          <div style={{ color: 'var(--sb-fg-disabled)' }}>+4</div>

          <div className="marker" style={{ marginTop: 22 }}>/// META</div>
          <div>358 words</div>
          <div>updated 2s ago</div>
        </div>
      </div>

      <div className="anno" style={{ left: 1000, top: 50 }}>
        <div className="anno-text"><span className="num">1</span>save pill — green confirms persistence; fades after 4s</div>
      </div>
      <div className="anno" style={{ left: 56, top: 240 }}>
        <div className="anno-text"><span className="num">2</span>[[wikilinks]] — dotted underline, vault-blue</div>
      </div>
      <div className="anno" style={{ left: 56, top: 320 }}>
        <div className="anno-text"><span className="num">3</span>file-links — chip with kind glyph, opens in tab</div>
      </div>
      <div className="anno" style={{ left: 600, top: 480 }}>
        <div className="anno-text"><span className="num">4</span>caret + outline rail — outline highlights active section as you scroll</div>
      </div>
    </div>
  );
}

function WikiLink({ children }) {
  return (
    <span style={{
      color: '#7fb6d9',
      borderBottom: '1px dashed rgba(127,182,217,0.5)',
      cursor: 'pointer',
    }}>[[{children}]]</span>
  );
}

function FileLink({ children, asset }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '0 5px',
      border: '1px solid var(--sb-line-soft)',
      borderRadius: 3, cursor: 'pointer',
      fontFamily: 'var(--sb-font-mono)', fontSize: 12,
      color: asset ? '#9bd1a4' : '#7fb6d9',
      verticalAlign: '1px',
    }}>
      <span style={{ fontSize: 9 }}>{asset ? 'png' : 'md'}</span>
      {children}
    </span>
  );
}

// ---------- 04b · chat with typing ----------
function BoardChatTyping() {
  const a = window.MOCK.AGENTS[1]; // Mercury
  return (
    <div className="frame" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{
        height: 26, padding: '0 16px',
        display: 'flex', alignItems: 'center',
        fontFamily: 'var(--sb-font-mono)', fontSize: 10,
        color: 'var(--sb-fg-faint)', letterSpacing: '0.06em',
        borderBottom: '1px solid var(--sb-line-soft)',
      }}>
        <span>chat</span>
        <span style={{ color: 'var(--sb-fg-disabled)', margin: '0 6px' }}>›</span>
        <span style={{ color: 'var(--sb-fg-muted)' }}>mercury</span>
        <span style={{ marginLeft: 'auto' }}>esc</span>
      </div>

      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--sb-line-soft)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 4,
          background: a.color + '22', border: '1px solid ' + a.color + '60',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: a.color, fontFamily: 'var(--sb-font-display)', fontSize: 18,
        }}>{a.glyph}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: 16 }}>Mercury</div>
          <div style={{ fontSize: 11, color: 'var(--sb-fg-faint)' }}>tool-running · 88 calls</div>
        </div>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#9bd1a4', boxShadow: '0 0 6px rgba(155,209,164,0.6)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* user message */}
        <UserBubble>can you run the test suite and tell me what fails first?</UserBubble>

        {/* agent message — markdown rendered */}
        <AgentBubble agent={a}>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>running it now. keeping an eye on <span style={{ color: '#7fb6d9', borderBottom: '1px dashed rgba(127,182,217,0.5)' }}>[[concepts/auth-v3]]</span> since it's the most recent edit.</div>
          <div style={{
            marginTop: 8, fontFamily: 'var(--sb-font-mono)', fontSize: 11,
            background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: 3,
            color: 'var(--sb-fg-muted)', border: '1px solid var(--sb-line-soft)',
          }}>
            $ npm test --silent<br/>
            <span style={{ color: '#9bd1a4' }}>›</span> running 142 tests
          </div>
        </AgentBubble>

        {/* tool call card */}
        <div style={{
          alignSelf: 'flex-start',
          maxWidth: '90%',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid var(--sb-line-soft)',
          borderRadius: 4,
          padding: '8px 10px',
          fontFamily: 'var(--sb-font-mono)', fontSize: 11,
          color: 'var(--sb-fg-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#e6c068' }}>⚙</span>
          run_tests
          <span style={{ color: 'var(--sb-fg-disabled)' }}>·</span>
          <span style={{ color: 'var(--sb-fg-faint)' }}>14.2s</span>
          <span style={{ marginLeft: 'auto', color: '#9bd1a4', fontSize: 10 }}>● done</span>
        </div>

        <UserBubble>and the failures?</UserBubble>

        {/* typing indicator — agent-tinted */}
        <div style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          background: a.color + '12',
          border: '1px solid ' + a.color + '40',
          borderRadius: 4,
          borderTopLeftRadius: 0,
          padding: '10px 12px',
          display: 'flex', gap: 5, alignItems: 'center',
        }}>
          <span className="dot1" style={{
            width: 5, height: 5, borderRadius: 999, background: a.color,
            animation: 'typingDot 1.2s infinite',
          }} />
          <span className="dot2" style={{
            width: 5, height: 5, borderRadius: 999, background: a.color,
            animation: 'typingDot 1.2s infinite 0.2s',
          }} />
          <span className="dot3" style={{
            width: 5, height: 5, borderRadius: 999, background: a.color,
            animation: 'typingDot 1.2s infinite 0.4s',
          }} />
        </div>

        <style>{`@keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }`}</style>
      </div>

      {/* composer */}
      <div style={{
        borderTop: '1px solid var(--sb-line-soft)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <textarea placeholder="reply to mercury…" style={{
          flex: 1, minHeight: 36, resize: 'none',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid var(--sb-line-soft)',
          color: 'var(--sb-fg)', padding: '8px 10px',
          fontSize: 12.5, fontFamily: 'var(--sb-font-body)',
          borderRadius: 3, outline: 'none',
        }} />
        <span style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10, color: 'var(--sb-fg-disabled)', alignSelf: 'flex-end', paddingBottom: 2 }}>⌘↵</span>
      </div>

      <div className="anno" style={{ left: 14, top: 220 }}>
        <div className="anno-text"><span className="num">1</span>markdown rendered in chat (marked + DOMPurify)</div>
      </div>
      <div className="anno" style={{ left: 14, top: 540 }}>
        <div className="anno-text"><span className="num">2</span>typing — agent's own color tint, 3 dots stagger</div>
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div style={{
      alignSelf: 'flex-end',
      maxWidth: '85%',
      background: 'var(--sb-surface)',
      border: '1px solid var(--sb-line-soft)',
      borderRadius: 4,
      borderTopRightRadius: 0,
      padding: '8px 12px',
      fontSize: 13, lineHeight: 1.5,
      color: 'var(--sb-fg)',
    }}>{children}</div>
  );
}

function AgentBubble({ agent, children }) {
  return (
    <div style={{
      alignSelf: 'flex-start',
      maxWidth: '90%',
      background: agent.color + '0F',
      border: '1px solid ' + agent.color + '30',
      borderRadius: 4,
      borderTopLeftRadius: 0,
      padding: '10px 12px',
      color: 'var(--sb-fg)',
    }}>{children}</div>
  );
}

window.BoardMDEditor = BoardMDEditor;
window.BoardChatTyping = BoardChatTyping;
