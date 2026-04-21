// components/app.jsx
// MotionPanel, DemoBar, AppHeader, MainApp, App (root + mount)
// Depends on all previous window exports

const { useState: useStateA, useCallback: useCallbackA } = React;

const MOTION_EXAMPLES = [
  { label: 'Message entry',     css: 'fadeInUp 280ms ease',              preview: 'bg', desc: 'New messages fade up into the thread' },
  { label: 'Sidebar slide',     css: 'slideInRight 200ms ease',          preview: 'bg', desc: 'Panels slide in from the right edge' },
  { label: 'Login card',        css: 'loginEntry 500ms cubic-bezier(.2,.8,.2,1)', preview: 'scale', desc: 'Card scales in with blur dissolve' },
  { label: 'Skeleton pulse',    css: 'skeletonPulse 1.4s ease-in-out infinite', preview: 'pulse', desc: 'Loading placeholders breathe at 70%' },
  { label: 'Overlay fade',      css: 'fadeIn 150ms ease',                preview: 'bg', desc: 'Dialogs fade the backdrop quickly' },
];

function MotionPanel({ onClose }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return (
    <div style={{ position: 'fixed', bottom: 64, right: 16, width: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadowLg, zIndex: 200, animation: 'fadeInUp 200ms ease forwards' }}>
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="sparkles" size={14} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>Motion Tokens</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.text3 }}><Icon name="x" size={14} /></button>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MOTION_EXAMPLES.map((d, i) => (
          <div key={i} style={{ background: C.surface, borderRadius: 8, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Live preview dot */}
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.primaryBg, flexShrink: 0, animation: d.css, border: `1px solid ${C.border}` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text1, marginBottom: 1 }}>{d.label}</div>
              <code style={{ fontSize: 10, color: C.primary, fontFamily: '"Formular Mono", monospace', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.css}</code>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>{d.desc}</div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
          <SectionLabel>Easing presets</SectionLabel>
          {[['Base', '200ms ease'], ['Slow', '300ms ease'], ['Spring', '400ms cubic-bezier(.2,.8,.2,1)'], ['Quick', '120ms ease-out']].map(([name, val]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.text2 }}>{name}</span>
              <code style={{ fontSize: 10, color: C.primary, fontFamily: '"Formular Mono", monospace' }}>{val}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoBar({ appState, setAppState }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const states = [
    { id: 'normal',  label: 'Normal' },
    { id: 'empty',   label: 'Empty' },
    { id: 'loading', label: 'Loading' },
    { id: 'error',   label: 'Error' },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9999, padding: '4px 8px', boxShadow: C.shadowMd, zIndex: 100 }}>
      <span style={{ fontSize: 10, color: C.text3, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '0 4px', userSelect: 'none' }}>Demo</span>
      <div style={{ width: 1, height: 14, background: C.border, margin: '0 2px' }} />
      {states.map(s => (
        <button key={s.id} onClick={() => setAppState(s.id)} style={{ background: appState === s.id ? C.primary : 'transparent', color: appState === s.id ? '#fff' : C.text2, border: `1px solid ${appState === s.id ? C.primary : 'transparent'}`, borderRadius: 9999, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'all 150ms' }}>{s.label}</button>
      ))}
    </div>
  );
}

function AppHeader({ user, showSidebar, onToggleSidebar, onToggleTokens, onToggleUsers, onToggleConfig, onToggleMotion, showTokens, showUsers, onNewThread }) {
  const { dark, toggle } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return (
    <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${C.border}`, background: C.card, flexShrink: 0, boxShadow: C.shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Aptiv mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F84018' }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.text1 }}>APTIV</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F84018' }} />
        </div>
        <span style={{ color: C.border, fontSize: 20, lineHeight: 1 }}>|</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text1 }}>VSDA Deep Agent</span>
        {!showSidebar && (
          <button onClick={onToggleSidebar} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 10px', fontSize: 12, color: C.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', transition: 'all 150ms' }}>
            <Icon name="messages-square" size={13} /> Threads
            <span style={{ background: C.warning, color: '#fff', borderRadius: 9999, fontSize: 9, padding: '0 4px', fontWeight: 700, minWidth: 14, textAlign: 'center' }}>1</span>
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: C.text2, marginRight: 2 }}>{user}</span>
        <Badge label="admin" variant="admin" />
        <div style={{ width: 1, height: 16, background: C.border, margin: '0 2px' }} />
        <Btn variant="outline" size="sm" onClick={onToggleUsers} style={{ background: showUsers ? C.primaryBg : undefined, color: showUsers ? C.primary : undefined }}>
          <Icon name="users" size={13} /> Users
        </Btn>
        <Btn variant="outline" size="sm" onClick={onToggleTokens} style={{ background: showTokens ? C.primaryBg : undefined, color: showTokens ? C.primary : undefined }}>
          <Icon name="key" size={13} /> Tokens
        </Btn>
        <Btn variant="outline" size="sm" onClick={onToggleConfig}>
          <Icon name="settings" size={13} /> Settings
        </Btn>
        <Btn variant="outline" size="sm" onClick={onToggleMotion}>
          <Icon name="sparkles" size={13} /> Motion
        </Btn>
        {/* Theme toggle */}
        <button onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text2, transition: 'all 150ms' }}>
          <Icon name={dark ? 'sun' : 'moon'} size={14} />
        </button>
        <Btn variant="primary" size="sm" onClick={onNewThread}>
          <Icon name="square-pen" size={13} /> New Thread
        </Btn>
      </div>
    </header>
  );
}

function MainApp({ user }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [activeThread, setActiveThread] = useStateA('1');
  const [showSidebar, setShowSidebar] = useStateA(true);
  const [showTokens, setShowTokens] = useStateA(false);
  const [showUsers, setShowUsers] = useStateA(false);
  const [showConfig, setShowConfig] = useStateA(false);
  const [showMotion, setShowMotion] = useStateA(false);
  const [appState, setAppState] = useStateA('normal');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <AppHeader
        user={user} showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar(s => !s)}
        onToggleTokens={() => { setShowTokens(s => !s); setShowUsers(false); }}
        onToggleUsers={() => { setShowUsers(s => !s); setShowTokens(false); }}
        onToggleConfig={() => setShowConfig(true)}
        onToggleMotion={() => setShowMotion(s => !s)}
        showTokens={showTokens} showUsers={showUsers}
        onNewThread={() => setActiveThread(null)}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {showSidebar && (
          <div style={{ width: 280, flexShrink: 0, animation: 'slideInLeft 200ms ease forwards' }}>
            <ThreadList activeId={activeThread} onSelect={id => { setActiveThread(id); setAppState('normal'); }} onClose={() => setShowSidebar(false)} />
          </div>
        )}
        <ChatInterface threadId={activeThread} appState={appState} onNewThread={() => setActiveThread(null)} />
        {showTokens && <div style={{ width: 280, flexShrink: 0 }}><TokenSidebar onClose={() => setShowTokens(false)} /></div>}
        {showUsers && <div style={{ width: 280, flexShrink: 0 }}><UserSidebar onClose={() => setShowUsers(false)} /></div>}
      </div>
      {showConfig && <ConfigDialog onClose={() => setShowConfig(false)} />}
      {showMotion && <MotionPanel onClose={() => setShowMotion(false)} />}
      <DemoBar appState={appState} setAppState={setAppState} />
    </div>
  );
}

function App() {
  const [dark, setDark] = useStateA(() => {
    try { return localStorage.getItem('vsda_theme') === 'dark'; } catch { return false; }
  });
  const [user, setUser] = useStateA(() => {
    try { return localStorage.getItem('vsda_user') || null; } catch { return null; }
  });
  const toggle = useCallbackA(() => setDark(d => {
    const nd = !d;
    try { localStorage.setItem('vsda_theme', nd ? 'dark' : 'light'); } catch {}
    return nd;
  }), []);
  const login = (u) => {
    try { localStorage.setItem('vsda_user', u); } catch {}
    setUser(u);
  };

  return (
    <ThemeCtx.Provider value={{ dark, toggle }}>
      <div style={{ height: '100vh', fontFamily: "'Formular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", background: TOKENS[dark ? 'dark' : 'light'].bg }}>
        {user ? <MainApp user={user} /> : <LoginScreen onLogin={login} />}
      </div>
    </ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
