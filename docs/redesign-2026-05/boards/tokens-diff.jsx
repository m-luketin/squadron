// Artboard 06 — Tokens diff page.
// Lists what's added or revised vs the file I read at the start.

function TokenSwatch({ sw, name, val, use, isNew }) {
  return (
    <div className="swatch-row">
      <div className="sw" style={{ background: sw }} />
      <div>
        <div className="name">{name}{isNew && <span className="new-tag">NEW</span>}</div>
      </div>
      <div className="val">{val}</div>
      <div className="use">{use}</div>
    </div>
  );
}

function BoardTokensDiff() {
  return (
    <div className="frame tokens-page">
      <div className="marker" style={{ marginBottom: 6 }}>/// 06 · TOKENS DIFF</div>
      <h1>tokens added or revised</h1>
      <p>only the deltas. existing tokens unchanged unless flagged. anything labeled <span className="new-tag" style={{ marginLeft: 0 }}>NEW</span> is added by this redesign and needs to land in <code style={{ fontFamily: 'var(--sb-font-mono)' }}>tokens.css</code>.</p>

      <h2>tab kind palette</h2>
      <p>the five middle-panel tab kinds get monochrome glyphs but borrow these accents for the active underline. saved as kind tokens so the agent / file / preview / graph color logic doesn't sprout magic numbers.</p>
      <TokenSwatch sw="#d93b25" name="--sb-kind-grid"     val="#d93b25 · accent" use="grid home tab — only red moment in tab strip" />
      <TokenSwatch sw="#7fb6d9" name="--sb-kind-file"     val="#7fb6d9"           use="markdown file tab + md kind glyph"     isNew />
      <TokenSwatch sw="#a89be0" name="--sb-kind-memory"   val="#a89be0"           use="memory-graph tab + ◉ glyph"           isNew />
      <TokenSwatch sw="#9bd1a4" name="--sb-kind-preview"  val="#9bd1a4"           use="vault-preview tab + ▦ glyph"          isNew />
      <TokenSwatch sw="#737373" name="--sb-kind-settings" val="#737373"           use="settings — neutral, can't accent"      isNew />

      <h2>working state palette</h2>
      <p>working pip on agent rows + chat header dot. these are status colors, not branding — they need to read at 6px without being noisy.</p>
      <TokenSwatch sw="#7fb6d9" name="--sb-work-thinking"       val="#7fb6d9"               use="agent is producing tokens"                  isNew />
      <TokenSwatch sw="#e6c068" name="--sb-work-tool"           val="#e6c068"               use="tool call in flight (pulse animation)"      isNew />
      <TokenSwatch sw="#d93b25" name="--sb-work-awaiting-input" val="#d93b25 · accent reuse" use="agent stuck on user — the only place we reuse accent for status" isNew />
      <TokenSwatch sw="#a89be0" name="--sb-work-moving"         val="#a89be0"               use="walking between cells on the grid"          isNew />

      <h2>memory-graph node palette</h2>
      <p>per-kind defaults. user can override per-node and the override is saved with the file. no new color invention — these are the existing brand-adjacent palette.</p>
      <TokenSwatch sw="#e6c068" name="--sb-graph-index"     val="#e6c068" use="vault index node — always largest"   isNew />
      <TokenSwatch sw="#9bd1a4" name="--sb-graph-log"       val="#9bd1a4" use="log file"                            isNew />
      <TokenSwatch sw="#7fb6d9" name="--sb-graph-hub"       val="#7fb6d9" use="hub files (skills, etc)"             isNew />
      <TokenSwatch sw="#a89be0" name="--sb-graph-entity"    val="#a89be0" use="entity (person / agent)"             isNew />
      <TokenSwatch sw="#e89c7f" name="--sb-graph-concept"   val="#e89c7f" use="concept · most common"               isNew />
      <TokenSwatch sw="#88c4ce" name="--sb-graph-source"    val="#88c4ce" use="external source"                     isNew />
      <TokenSwatch sw="#d9a3c9" name="--sb-graph-synthesis" val="#d9a3c9" use="synthesized note"                    isNew />
      <TokenSwatch sw="#c8c8b8" name="--sb-graph-doc"       val="#c8c8b8" use="raw document"                        isNew />
      <TokenSwatch sw="#7fa8a8" name="--sb-graph-asset"     val="#7fa8a8" use="image / binary"                      isNew />
      <TokenSwatch sw="#d4b896" name="--sb-graph-skill"     val="#d4b896" use="skill template"                      isNew />

      <h2>save-pill states</h2>
      <p>the green pill in the editor. one new green only — same hue as <code style={{ fontFamily: 'var(--sb-font-mono)' }}>--sb-graph-log</code>, so we don't grow the palette.</p>
      <TokenSwatch sw="#9bd1a4" name="--sb-pill-saved"    val="#9bd1a4 + 0.08 bg" use="SAVED · fades after 4s"     isNew />
      <TokenSwatch sw="#e6c068" name="--sb-pill-saving"   val="#e6c068 + 0.08 bg" use="SAVING · spinner"           isNew />
      <TokenSwatch sw="#d93b25" name="--sb-pill-conflict" val="#d93b25 + 0.10 bg" use="CONFLICT · click to resolve" isNew />

      <h2>line / surface revisions</h2>
      <p>two existing tokens get refined. flagging them so review focuses on the right places.</p>
      <TokenSwatch sw="rgba(255,255,255,0.06)" name="--sb-line"      val="rgba(255,255,255,0.06)" use="primary divider — unchanged" />
      <TokenSwatch sw="rgba(255,255,255,0.03)" name="--sb-line-soft" val="rgba(255,255,255,0.03)" use="UPDATED · was 0.025 — bumps file-row borders so they hold density at 12px" />
      <TokenSwatch sw="rgba(255,255,255,0.025)" name="--sb-surface-hover" val="rgba(255,255,255,0.025)" use="row hover · pulled from inline values into a token" isNew />

      <h2>typography · no changes</h2>
      <p>display / body / mono families and the three sizes hold. we just gain a 10.5px crumb size that's already in use; promoting it to a named token.</p>
      <TokenSwatch sw="transparent" name="--sb-text-crumb" val="10.5 / 1.4 / 0.06em" use="breadcrumb row — used in all three right-sidebar modes" isNew />

      <h2>radii & shadows · no changes</h2>
      <p>nothing new here. the drag-ghost and right-click menu reuse <code style={{ fontFamily: 'var(--sb-font-mono)' }}>--sb-r-sm</code> and <code style={{ fontFamily: 'var(--sb-font-mono)' }}>--sb-shadow-pop</code>.</p>

      <h2 style={{ marginTop: 40 }}>summary</h2>
      <p style={{ maxWidth: 720 }}>
        21 new tokens. zero replacements. zero new font sizes. all new colors stay inside the existing brand-adjacent palette (no novel hues). red is still the only accent — it gains exactly two new uses (kind-grid, work-awaiting-input) and both are semantically "demands attention" so the rule holds.
      </p>
    </div>
  );
}

window.BoardTokensDiff = BoardTokensDiff;
