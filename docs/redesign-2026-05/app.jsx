// Design canvas app — hosts annotated artboards for the May 2026 redesign pass.

const { useState } = React;

function App() {
  return (
    <DesignCanvas
      title="Squadron · May 2026 Redesign"
      subtitle="absorbing 15 new surfaces into the existing visual grammar. annotated where new behavior matters."
    >
      <DCSection id="taxonomy" title="01 · Tab strip taxonomy">
        <DCArtboard id="tabs-current"  label="current — all tabs look alike"          width={1320} height={460}>
          <BoardTabsCurrent />
        </DCArtboard>
        <DCArtboard id="tabs-proposed" label="proposed — Grid as home, kind glyphs, pin & drag" width={1320} height={460}>
          <BoardTabsProposed />
        </DCArtboard>
        <DCArtboard id="tabs-context"  label="right-click & drag-to-reorder"          width={1320} height={460}>
          <BoardTabsContext />
        </DCArtboard>
      </DCSection>

      <DCSection id="right-sidebar" title="02 · Right sidebar — three modes, one grammar">
        <DCArtboard id="rs-config"  label="AgentConfig (default)"     width={420} height={920}>
          <BoardRSAgentConfig />
        </DCArtboard>
        <DCArtboard id="rs-files"   label="MemoryGraphFilesPanel"     width={420} height={920}>
          <BoardRSFiles />
        </DCArtboard>
        <DCArtboard id="rs-profile" label="ProfileEditor"             width={420} height={920}>
          <BoardRSProfile />
        </DCArtboard>
      </DCSection>

      <DCSection id="memory-graph" title="03 · Memory graph at two scales">
        <DCArtboard id="mg-mini" label="sidebar mini · ~200px"     width={420} height={520}>
          <BoardMGMini />
        </DCArtboard>
        <DCArtboard id="mg-full" label="middle-panel · full"       width={1320} height={780}>
          <BoardMGFull />
        </DCArtboard>
      </DCSection>

      <DCSection id="editor-chat" title="04 · Markdown editor + chat">
        <DCArtboard id="md-editor" label="editor with [[wikilinks]] + save pill" width={1320} height={780}>
          <BoardMDEditor />
        </DCArtboard>
        <DCArtboard id="chat-typing" label="chat — typing, agent tints, file-links" width={420} height={780}>
          <BoardChatTyping />
        </DCArtboard>
      </DCSection>

      <DCSection id="left-sidebar" title="05 · Left sidebar — Sessions / Agents toggle + working state">
        <DCArtboard id="ls-sessions" label="Sessions mode"  width={320} height={780}>
          <BoardLSSessions />
        </DCArtboard>
        <DCArtboard id="ls-agents"   label="Agents mode"    width={320} height={780}>
          <BoardLSAgents />
        </DCArtboard>
        <DCArtboard id="ls-3agents"  label="edge case — 3 agents"  width={320} height={780}>
          <BoardLSAgentsSmall />
        </DCArtboard>
      </DCSection>

      <DCSection id="tokens" title="06 · Tokens diff">
        <DCArtboard id="tokens-page" label="tokens added or revised" width={1100} height={1200}>
          <BoardTokensDiff />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
