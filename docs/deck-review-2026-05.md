# Squadron pitch deck — review notes (2026-05-03)

> Reviewing `Squadron Pitch.html` (8 slides, 1920×1080, drive folder `1fiKluUrVbhDqLRPjQUvQQ2wlvXjJ2jQ3`) against `pitch-brief-2026-05.md`.
> Note: drive folder only contains `Squadron Pitch.html` and a stripped-down `pitch-deck-brief.md` (46 lines vs the full 263-line local brief). Referenced JS/CSS (`deck.css`, `deck-stage.js`, `hex-art.js`, `extra-art.js`) were not in the folder; review is on HTML content only.

---

## 1. TL;DR

The deck is tight, well-paced, and visually on-brand — the eight-slide arc (cover → shift → pain → substrate → training → vision → business → thanks) reads cleanly and the "topology becomes the permission model, rendered as space" line is the single best piece of copy in the artifact. Three things to fix first: **(a) the Cognition dates on slide 02 are off by exactly one year and will get caught by anyone in the audience who has read the posts** (Don't Build Multi-Agents is June 2025, not June 2024; the reversal post is April 2026, not April 2025); **(b) the deck silently drops 7 of the brief's 12 sections** — no competitive slide, no what's-shipped, no demo flow, no traction, no asks, no founder, no why-now — which means a cold viewer cannot evaluate whether this thing actually exists or who built it; **(c) Pentagon.run's own marketing copy now says "visual workspace where every agent has a place"** — they have moved into Squadron's spatial framing, so the deck's implicit positioning ("we're the spatial one") is weaker than it was when the brief was written. Biggest open question: is this an investor deck, a recruit-an-alpha-user deck, or a conference-talk deck? The current build is closer to the third — too few proof points for the first, too few CTAs for the second. `[ASK MATIJA]`

---

## 2. Slide-by-slide

### Slide 01 — Cover
**Quote:** `squadron` / `OPEN-SOURCE AGENT PLAYGROUND`

Lands the founder-preferred "playground" framing — good, this is the one design call from the brief that the designer correctly took license on. The hex-cluster background is on-brand. **Missing:** the three-line elevator the brief explicitly carved out as slide 1. Right now slide 01 is a logo-and-tagline cover; slide 02 jumps straight to "the shift." A stranger reading slide 01 has no idea what Squadron *does*.

**Suggestion:** add a 22pt mono subtitle below the tagline, three lines:
```
agents live on a hex grid. shared markdown vault. mcp tools.
karpathy-style memory. no cloud, no api keys. your claude sub runs it.
local-first. mit. one npx command.
```
This is the brief's §1 elevator verbatim — already in the founder's voice, already approved.

### Slide 02 — The shift
**Quote:** `multi-agent went from controversial to inevitable in ten months.` / `COGNITION AI · JUN 2024 · "Don't Build Multi-Agents"` / `COGNITION AI · APR 2025 · "Multi-Agents: What's Actually Working"`

**Two factual errors.** The original post is dated **June 12, 2025** by Walden Yan; the reversal post is **April 22, 2026** by the same author (verified by fetching cognition.ai/blog/dont-build-multi-agents and cognition.ai/blog/multi-agents-working today). The "ten months" gap survives — but the years are both off by one. Anyone in the audience who actually read these posts will silently downgrade the deck's credibility from this slide forward.

**Fix:** change `JUN 2024` → `JUN 2025` and `APR 2025` → `APR 2026`. Done. The narrative still works — the reversal happened just two weeks ago, which actually *strengthens* the "inevitability" beat.

Second issue: `same author. capitulation. specific patterns work.` — "capitulation" is slightly stronger than what the post does. Yan describes it as a refinement: read-only sub-agents and single-threaded writers work; parallel-writer swarms still don't. Swap `capitulation` → `partial reversal — read-only sub-agents work, parallel writers still don't`. Lower hyperbole, more honest, and the brief's "no hyperbole" rule.

### Slide 03 — The pain
**Quote:** `today, "using multiple agents" looks like six terminals.` + the six-terminal sketch + `CHAOS / OPACITY / FAILURE` rows

This is the deck's strongest slide. The terminal sketch is the right visual — the `! rate-limit hit`, `⌀ session suspended · 5+ concurrent`, `! collision (3x)` details all map to the brief's §2B pains (Anthropic concurrency tripwire, file-vault chaos, opaque coordination). Speaker note explicitly cites the founder's 2026-05-02 auto-suspend incident as the source — good, that's real.

**One nit:** `home dir = shared mutex-free junk drawer` is the funniest line in the deck and also the only place where the voice slips slightly toward jokey. It works for a live talk; for a sent-as-PDF investor read it might land flat. If the deck is for both modes, consider an A/B: keep `mutex-free junk drawer` for talks, swap to `home dir = six agents writing notes.md, no namespace, no locks` for the PDF.

**Missing:** the subscription-ban risk is the most concrete proof of the pain (founder hit it himself). The terminal sketch hints at it (`session suspended · 5+ concurrent`) but doesn't name it. Add a one-liner under the FAILURE row: `↳ anthropic silent-suspends 5+ concurrent CLI sessions. founder discovered this on 2026-05-02. there is no public spec.` That detail is the deck's most defensible "we know this market because we hit the wall" moment.

### Slide 04 — The substrate
**Quote:** `a hex grid. a vault. an MCP wire.` / `topology becomes the permission model, rendered as space.` / SPATIAL · SHARED · STANDARD pillars

Best copy line in the deck. The three-pillar layout maps cleanly to brief §3's five subsystems compressed into three. Compression is the right call — five pillars on one slide is too many. The two cuts (walking metaphor + memory graph + agent config) get partially recovered on slide 05, which is good architecture.

**One concern:** `STANDARD · MCP wire · any MCP agent plugs in` overstates slightly. The brief says claude-code is the subprocess; "any MCP agent plugs in" is *aspirationally* true (MCP is a standard) but practically the daemon is wired around `claude -p` subprocess + stream-json parsing today. If anyone in the audience is technical they'll ask "great, can I plug Cursor in?" and the honest answer is "not today." Soften to `any MCP-speaking subprocess can plug in (claude-code today; codex/gemini wire pending)`. This also surfaces the codex placeholder issue from the brief's open items.

**Missing visual:** the brief's §5 demo storyboard exists as a 90-second screencast spec. None of it appears in the deck. A single still or QR-to-video would make this slide concrete. Right now slide 04 says *what* it is; nothing in the deck shows *what it looks like running*.

### Slide 05 — Raise them
**Quote:** `they are not deployments. they are characters you train.` + skill cards (read-pdf, deploy-to-vercel, sql-introspect, draw-diagrams) + knowledge-graph viz

Strong concept beat. "Characters you train" is one of the deck's two best phrases. Knowledge-graph viz is the right way to make "memory is files" concrete — and `34 files · 202 wikilinks · grows with the agent` is exactly the brief's Jordan-vault number, accurate.

**Problem with the skill examples.** `read-pdf`, `deploy-to-vercel`, `sql-introspect`, `draw-diagrams` are generic. The brief says the starter library that *actually ships* is `summarize`, `bug-report`, `meeting-notes`, `tweet-thread`, `cold-email`, `code-review`. Use the real ones. It's both more honest and more interesting — `cold-email` and `meeting-notes` tell the audience that this is a tool for shipping work, not for impressing other engineers with a `sql-introspect` example.

**Suggested swap:**
```
+ meeting-notes   github.com/m-luketin/squadron-skills
+ cold-email      github.com/m-luketin/squadron-skills
+ code-review     github.com/m-luketin/squadron-skills
+ tweet-thread    github.com/community/skills
```
Same visual; load-bearing copy.

### Slide 06 — Vision
**Quote:** `collaborative grids. your agents next to mine.` / `shared canvases where teams from different orgs place agents alongside each other and let them coordinate — without trusting each other's infrastructure. the endgame is the open multi-agent web.`

Faithful to brief §10. "Your agents next to mine" is the right two-word version of the social-monetization pivot. **One issue:** `the endgame is the open multi-agent web` is the closest the deck gets to violating the brief's "no hyperbole" rule. "Open multi-agent web" reads as a buzzphrase the audience hasn't earned yet — there's no slide showing federated identity, capability tokens, or A2A integration to back it up. Either build the substantiation slide (which the brief gestures at — agent identity, capability tokens, addressing) or soften to `the endgame is multi-org agent collaboration without shared infrastructure`. The second is less marketable but defensible.

### Slide 07 — Business
**Quote:** `free where it should be. paid where it earns.` / FREE local daemon · CHEAP hosted · SUBSCRIPTION collaborative spaces

This is opinionated where the brief was deliberately not. Brief §8 lays out four options (OSS+cloud, OSS+studio, marketplace, Pro tier) and explicitly says "let the founder + design discuss; the four are not mutually exclusive." The deck picks Option A and skips B/C/D entirely. **That's a real choice** — and may be correct — but the founder should sign off explicitly. `[ASK MATIJA]` Did you make this call or did Claude Design make it for you?

If the call stands, the slide is OK. The hero treatment of `collaborative spaces` correctly identifies where the company lives. The "trust contract" framing for the free tier is sharp.

**Nit:** `we run it for you` is two words too cute. Try `hosted daemon` or `we host. you don't.` The current phrasing reads like a SaaS landing page, not Matija's voice.

### Slide 08 — Thank you / CTA
**Quote:** `thanks for checking out squadron.` + INSTALL/CODE/PACKAGE/DM ME rows + Telegram QR

Functional close. The four link-rows are the right shape. **Missing the brief's two named asks** (alpha users + skill-pack authors). "Install" and "DM me" are weaker calls than "I want 10 alpha users from agent-tooling builders" and "I want skill-pack authors — the starter has 6, we want 60."

**Suggested replacement** for the right-side block (keep QR):
```
/// ASK 1 · ALPHA USERS
looking for the first 10 builders of agent tooling.
drop email at [landing url] → install link + direct line.

/// ASK 2 · SKILL-PACK AUTHORS
starter library has 6 skills. want 60.
markdown files. installable from any github url.
write them in your domain, ship them in ours.
```
This is the brief's §12 verbatim. Two specific asks beat four generic links.

---

## 3. Voice check

The deck mostly nails it. Markers (`/// 04 · THE ANSWER`, `/// THE SUBSTRATE`) lift directly from `landing/index.html`. Lowercase headlines (`a hex grid. a vault. an MCP wire.`, `they are not deployments. they are characters you train.`) match the founder voice. JetBrains Mono for code refs, IBM Plex Sans for display — correct per the appendix design notes.

**Where it slips:**
- `free where it should be. paid where it earns.` (slide 07) reads like generic SaaS pitch-deck copy. The founder's voice would be more like `local daemon free forever. cross-user spaces paid.` — declarative, no aphorism.
- `we run it for you` (slide 07) is too cute.
- `the endgame is the open multi-agent web` (slide 06) — buzzphrase territory.
- `capitulation` (slide 02) — slightly hot for a "no hyperbole" brief.

**Where it's spot on:**
- `topology becomes the permission model, rendered as space.` (slide 04) — this is the line that should go on the t-shirt.
- `home dir = shared mutex-free junk drawer` (slide 03) — peak Matija voice, terse and technical.
- `coordination lives in chat buffers · no audit · no replay` (slide 03) — three-clause mono with `·` separators is the landing-page idiom rendered correctly.
- `it is on disk.` (slide 05 subtitle) — terminal period, no em-dash, no qualification. Good.

---

## 4. Competitive landscape audit

Verified each competitor named in brief §6 and surfaced what the brief misses.

| Tool | Brief claim | Status today (2026-05-03) | Action |
|---|---|---|---|
| **Cursor** | Single-agent IDE | Still accurate. Cursor has not shipped multi-agent. | Keep as-is. |
| **Continue** | Single-agent IDE extension | Accurate. | Keep. |
| **Cline / Roo** | Single-agent CLI-ish | Roo is now positioned as "whole dev team" with multiple personas (Coder/Architect/Debugger) — still single-process but personas hint at multi-agent. Both BYOK / free / open source. | Update Roo description: `single-process IDE with persona switching · no inter-agent comms` |
| **Devin** | Closed-source SaaS | Still accurate. Cognition published Devin's 2025 perf review; still closed, still SaaS. | Keep. |
| **MetaGPT / AutoGen / CrewAI** | Python orchestration libraries | Accurate. CrewAI is now positioning more aggressively as enterprise — still no UI, still code-defined teams. | Keep, optionally drop MetaGPT (much quieter than Auto/Crew). |
| **pentagon.run** | $50/mo closed desktop, Slack-with-bots | **Re-positioned.** Pentagon's own current copy: "visual workspace where every agent has a place," "agents report back with live status," "granular permissions at folder/tool/action level," "hardware isolation per agent VM." That's *adjacent to* Squadron's spatial framing, not Slack-with-bots. | **Rewrite this row.** Pentagon is now the closest competitor on positioning, not just shape. The differentiator vs. Pentagon is **(a) open source**, **(b) markdown vault as substrate vs. group chat**, **(c) hex topology as permission model vs. role-based perms**. Make those three differences explicit. |

**Net-new competitors the brief doesn't mention** (all 2026):

- **[Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)** — *first-party from Anthropic.* Shipped Feb 2026 with Opus 4.6. Peer-to-peer mailbox between agents, shared task list, team-lead orchestration, all inside `claude` itself. **This is the most important competitor the deck doesn't address.** It's free with any Claude sub. The Squadron differentiator: spatial topology + markdown vault + open daemon you can mod. But the deck must name and disarm this one — otherwise the obvious investor question is "why not just use Anthropic's built-in?"
- **[AgentsRoom](https://agentsroom.dev/)** — desktop multi-agent IDE supporting Claude/Codex/Gemini/Aider in parallel. Visual but flat (no spatial topology). Direct comp on the "multi-provider local desktop" angle.
- **[Shipyard](https://shipyard.build/)** — "Multi-agent orchestration for Claude Code in 2026" positioning. Worth a look — `[VERIFY: did not deep-dive their pricing/shape; surfaces in every multi-agent search.]`
- **[Symphony (OpenAI)](https://openai.com/index/open-source-codex-orchestration-symphony/)** — open spec for Codex orchestration. Spec, not product, but signals OpenAI is now in this space.
- **[Google Scion](https://www.infoq.com/news/2026/04/google-agent-testbed-scion/)** — Google open-sourced an experimental multi-agent orchestration testbed in April 2026. Containers + isolated identities + shared workspaces. Research-shaped today, not a product, but a Google-backed standard worth flagging.
- **[Composio agent-orchestrator](https://github.com/ComposioHQ/agent-orchestrator)** — parallel coding-agent orchestrator with autonomous CI/merge-conflict handling. Code-shaped, not spatial.

**A2A 1.0 status:** brief's `[VERIFY: mid-April 2026, Linux Foundation]` is partially wrong. Linux Foundation launched the A2A *project* on June 23, 2025 (Google donated it after their April 2025 announcement). v1.0 spec was released "early 2026" per the LF's own press — `[VERIFY: precise v1.0 date — sources say "early 2026" but I could not pin the exact day. Mid-April is likely too late.]` Either way: the deck doesn't currently mention A2A, which is fine for a 8-slide deck but a missed opportunity if a competitive slide is added — Squadron speaks MCP, not A2A, and the founder should have a one-sentence answer for "why not A2A?"

---

## 5. Strategic open questions

1. **`[ASK MATIJA]` Who is this deck for?** Investor? Alpha-user recruiter? Conference talk? The current build is closest to a conference talk (no traction, no team, no ask, no funding context). If it's an investor deck it's missing 4 slides; if it's an alpha-recruit deck the asks should be the climax, not a footer.
2. **`[ASK MATIJA]` Did you choose Option A (OSS + hosted + collaborative-paid) deliberately, or did Claude Design pick it?** The brief left all four business options open. Slide 07 commits. If you commit, you should be able to defend it against B (studio model, fits solbound.dev) and C (marketplace, fits the skill architecture) — both of which are arguably more natural fits.
3. **`[ASK MATIJA]` What's the answer to "why not Claude Code Agent Teams?"** Anthropic shipped first-party multi-agent in Feb 2026. Free with any Claude sub. Squadron's answer presumably involves spatial topology + markdown vault + open daemon — but the deck doesn't have this slide and you'll get the question every time.
4. **`[ASK MATIJA]` Is Pentagon really the closest competitor now?** Their current marketing copy uses spatial language ("visual workspace where every agent has a place"). Has their product actually moved spatial, or is it just marketing? If it's just marketing, the competitive moat holds. If they've shipped a real spatial UI, the differentiation rests entirely on (a) open source and (b) markdown-vault-as-substrate.
5. **`[ASK MATIJA]` Are you ready for the demo to be a hard requirement?** The brief carves out 90 seconds of demo storyboard (§5) but the deck has zero screenshots and zero embedded video. For an 8-slide deck to land, slide 04 or 05 needs a real screenshot or a QR to a 90-sec screencast. Otherwise the deck is asserting `it works` rather than showing it.

---

## 6. Improvement priority

**P0 — must fix before showing this to anyone:**
1. Cognition dates on slide 02 (JUN 2024 → JUN 2025; APR 2025 → APR 2026). Factual error, easily caught. ~30 seconds.
2. Add the three-line elevator to slide 01. Cover currently fails the brief's "stranger reads three lines and gets it" test.
3. Decide whether this is an 8-slide conference talk or an investor deck. If investor: add competitive landscape (slide between 03 and 04), what's-shipped (between 04 and 05), and traction/founder/asks (replace current slide 08 with three).

**P1 — fix this week:**
4. Replace generic skill examples on slide 05 with the real shipped six (`meeting-notes`, `cold-email`, `code-review`, etc.).
5. Add subscription-ban detail under slide 03 FAILURE row — it's the deck's most defensible proof point.
6. Soften `capitulation` on slide 02 and `the open multi-agent web` on slide 06 per voice check.
7. Rewrite slide 08 right block as the brief's two named asks.

**P2 — meaningful but optional:**
8. Address Claude Code Agent Teams in either slide 03 or a new competitive slide. If you don't, every investor will raise it.
9. Update Pentagon row of competitive set to reflect their new spatial-flavored positioning.
10. Add a screenshot or video QR on slide 04 or 05.
11. Tighten `we run it for you` and `free where it should be. paid where it earns.` per voice check.

**P3 — polish:**
12. The footnote on slide 02 (`cognition.ai/blog/dont-build-multi-agents · cognition.ai/blog/multi-agents-working`) is good — add similar footnotes to slide 03 (the arXiv refs are already there) and consider one for slide 06 if A2A or capability-token research gets cited.

---

## Appendix — what was reviewed

- `Squadron Pitch.html` — 361 lines, 8 `<section>` slides, self-contained markup with inline `<style>` per slide. References external `deck.css`, `deck-stage.js`, `hex-art.js`, `extra-art.js` (not in the drive folder; couldn't review styling/animation).
- `pitch-brief-2026-05.md` — 263 lines (full local copy). Drive folder also has a 46-line stripped brief that's a different document — earlier draft of just the narrative arc, not the full design brief.
- Speaker notes block in the HTML (`<script id="speaker-notes">`) — 8 entries, one per slide, in Matija's voice. Useful — confirms the deck is intended for spoken delivery.
- Competitive verification: webfetched cognition.ai blog posts (both), pentagon.run product copy, plus searches for Cline/Roo/Cursor/Devin/MetaGPT/AutoGen/CrewAI/A2A/Claude Code Agent Teams/AgentsRoom/Shipyard/Symphony/Scion/Composio.
