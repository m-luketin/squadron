// Connections wizard — provider → connection type → handoff (CLI / API key) → success.

const { useState: useStateC, useEffect: useEffectC } = React;

const PROVIDERS = [
  { id: 'claude', code: 'CL', name: 'claude', desc: 'anthropic claude code via cli or api', tag: 'recommended', enabled: true },
  { id: 'codex', code: 'CX', name: 'codex', desc: 'openai codex via cli or api', enabled: true },
  { id: 'gemini', code: 'GM', name: 'gemini', desc: 'google gemini cli', tag: 'soon', enabled: false },
  { id: 'local', code: 'LO', name: 'local model', desc: 'ollama / lm studio runtime', tag: 'soon', enabled: false },
];

const CONN_TYPES = {
  claude: [
    { id: 'cli-sub', code: 'OAuth', name: 'subscription via cli', desc: 'pro/max plan — pays via your existing claude subscription. cli runs the oauth.', tag: 'recommended' },
    { id: 'api', code: 'API', name: 'api key', desc: 'pay-per-token. paste an anthropic api key.' },
  ],
  codex: [
    { id: 'cli-sub', code: 'OAuth', name: 'subscription via cli', desc: 'plus/pro plan via codex cli. cli runs the oauth.', tag: 'recommended' },
    { id: 'api', code: 'API', name: 'api key', desc: 'pay-per-token. paste an openai api key.' },
  ],
};

const CLI_CMD = {
  claude: 'claude /login',
  codex: 'codex login',
};

function CopyableCmd({ cmd }) {
  const [copied, setCopied] = useStateC(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px',
      background: 'var(--sb-bg)',
      border: '1px solid var(--sb-line)',
      borderRadius: 'var(--sb-r-sm)',
      marginBottom: 12,
    }}>
      <span style={{ color: 'var(--sb-fg-disabled)' }}>$</span>
      <code style={{ flex: 1, fontFamily: 'var(--sb-font-mono)', fontSize: 12, color: 'var(--sb-fg)' }}>{cmd}</code>
      <button
        onClick={() => { navigator.clipboard?.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
        style={{
          background: 'transparent', border: '1px solid var(--sb-line)', color: 'var(--sb-fg-muted)',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, fontFamily: 'var(--sb-font-mono)',
          cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >{copied ? 'copied' : 'copy'}</button>
    </div>
  );
}

function CliHandoff({ provider, onComplete }) {
  // Simulated detection states — in reality the daemon polls the keychain / cli output.
  const [progress, setProgress] = useStateC(0);
  useEffectC(() => {
    if (progress >= 4) { setTimeout(onComplete, 600); return; }
    const id = setTimeout(() => setProgress(p => p + 1), progress === 0 ? 1100 : 1400);
    return () => clearTimeout(id);
  }, [progress]);

  const lines = [
    { label: `detecting ${provider} cli on $PATH` },
    { label: 'opening browser for oauth' },
    { label: 'waiting for subscription handshake' },
    { label: 'verifying access' },
  ];

  return (
    <div>
      <p className="lede">we're handing off to your local <code style={{ color: 'var(--sb-fg)' }}>{provider}</code> cli to do the oauth dance — squadron never sees or stores your tokens. if the cli isn't on your path yet, install it first:</p>
      <CopyableCmd cmd={CLI_CMD[provider]} />
      <div className="cli-handoff">
        {lines.map((l, i) => (
          <div key={i} className={`cli-line ${i < progress ? 'done' : i === progress ? 'active' : ''}`}>
            <span className="pip" />
            <span>{l.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--sb-fg-disabled)' }}>
              {i < progress ? 'ok' : i === progress ? '…' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeyForm({ provider, onComplete }) {
  const [key, setKey] = useStateC('');
  const [verifying, setVerifying] = useStateC(false);
  const looksValid = key.length > 12;
  const placeholder = provider === 'claude' ? 'sk-ant-…' : 'sk-…';
  const submit = () => {
    if (!looksValid || verifying) return;
    setVerifying(true);
    setTimeout(() => onComplete(), 1200);
  };
  return (
    <div>
      <p className="lede">paste an api key — squadron stores it in your os keychain, never plaintext on disk. you'll be billed per-token by {provider === 'claude' ? 'anthropic' : 'openai'} directly.</p>
      <div className="field-inline">
        <label>{provider} api key</label>
        <input
          type="password"
          placeholder={placeholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
          disabled={verifying}
        />
        <span className="hint">stored in keychain · never sent anywhere except the provider</span>
      </div>
      {verifying && (
        <div className="cli-handoff">
          <div className="cli-line active"><span className="pip" /><span>verifying key with {provider}…</span></div>
        </div>
      )}
      {!verifying && (
        <button className="btn-primary" onClick={submit} disabled={!looksValid} style={{ width: '100%' }}>
          verify and connect
        </button>
      )}
    </div>
  );
}

function ConnectionsWizard({ open, onClose, onConnect, initialProvider }) {
  const [step, setStep] = useStateC(0); // 0=provider 1=type 2=handoff 3=success
  const [provider, setProvider] = useStateC(initialProvider || null);
  const [connType, setConnType] = useStateC(null);

  useEffectC(() => {
    if (open) {
      setStep(initialProvider ? 1 : 0);
      setProvider(initialProvider || null);
      setConnType(null);
    }
  }, [open, initialProvider]);

  useEffectC(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const stepLabels = ['provider', 'method', 'authorize', 'done'];
  const provObj = PROVIDERS.find(p => p.id === provider);
  const typeObj = provider ? CONN_TYPES[provider]?.find(t => t.id === connType) : null;

  const handleHandoffComplete = () => {
    setStep(3);
    onConnect && onConnect({ provider, connType, label: `${provider} · ${typeObj?.name}` });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">/// {step === 3 ? 'CONNECTED' : 'WIRE UP A PROVIDER'}</div>
            <h2>
              {step === 0 && 'pick a provider'}
              {step === 1 && `${provObj?.name} · how should we connect?`}
              {step === 2 && (connType === 'cli-sub' ? 'cli handoff' : 'api key')}
              {step === 3 && 'all set'}
            </h2>
          </div>
          <button className="close-x" onClick={onClose} aria-label="close"><I.close /></button>
        </div>

        {step < 3 && (
          <div className="modal-stepper">
            {stepLabels.slice(0, 3).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`}>
                  <span className="num">{i < step ? '✓' : i + 1}</span>
                  <span>{s}</span>
                </div>
                {i < 2 && <span className="arrow">›</span>}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="modal-body">
          {step === 0 && (
            <>
              <p className="lede">squadron supports two providers in v1. each agent picks its own — you can mix them in the same world.</p>
              <div className="picker-grid">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    className={`picker-card ${provider === p.id ? 'selected' : ''} ${!p.enabled ? 'disabled' : ''}`}
                    onClick={() => p.enabled && setProvider(p.id)}
                    disabled={!p.enabled}
                  >
                    <div className="pc-head">
                      <div className="pc-ico">{p.code}</div>
                      <div className="pc-name">{p.name}</div>
                      {p.tag && <span className="pc-tag" style={{ color: p.tag === 'soon' ? 'var(--sb-fg-disabled)' : 'var(--sb-accent)' }}>{p.tag}</span>}
                    </div>
                    <div className="pc-desc">{p.desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && provider && (
            <>
              <p className="lede">subscription via cli is the recommended path — it pays via your existing pro/max/plus plan instead of api credits.</p>
              <div className="picker-grid">
                {CONN_TYPES[provider].map(t => (
                  <button
                    key={t.id}
                    className={`picker-card ${connType === t.id ? 'selected' : ''}`}
                    onClick={() => setConnType(t.id)}
                  >
                    <div className="pc-head">
                      <div className="pc-ico">{t.code}</div>
                      <div className="pc-name">{t.name}</div>
                      {t.tag && <span className="pc-tag" style={{ color: 'var(--sb-accent)' }}>{t.tag}</span>}
                    </div>
                    <div className="pc-desc">{t.desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && provider && connType === 'cli-sub' && (
            <CliHandoff provider={provider} onComplete={handleHandoffComplete} />
          )}
          {step === 2 && provider && connType === 'api' && (
            <ApiKeyForm provider={provider} onComplete={handleHandoffComplete} />
          )}

          {step === 3 && (
            <div className="success-state">
              <div className="check">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3>{provObj?.name} connected</h3>
              <p>via {typeObj?.name}</p>
              <p style={{ fontFamily: 'var(--sb-font-mono)', fontSize: 10.5, color: 'var(--sb-fg-disabled)', marginTop: 10, letterSpacing: '0.04em' }}>
                models from {provObj?.name} are now selectable on any agent.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="helptext">
            {step === 0 && 'esc to cancel'}
            {step === 1 && '← back · esc to cancel'}
            {step === 2 && connType === 'cli-sub' && 'we never see your tokens'}
            {step === 2 && connType === 'api' && 'stored in os keychain'}
            {step === 3 && 'ready to spawn an agent'}
          </span>
          <div className="actions">
            {step > 0 && step < 3 && (
              <button className="btn-ghost" onClick={() => setStep(step - 1)}>back</button>
            )}
            {step === 0 && (
              <button className="btn-primary" disabled={!provider} onClick={() => setStep(1)}>continue</button>
            )}
            {step === 1 && (
              <button className="btn-primary" disabled={!connType} onClick={() => setStep(2)}>continue</button>
            )}
            {step === 3 && (
              <button className="btn-primary" onClick={onClose}>done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.ConnectionsWizard = ConnectionsWizard;
