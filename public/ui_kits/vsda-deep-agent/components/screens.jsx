// components/screens.jsx
// LoginScreen, EmptyState, LoadingScreen, ErrorScreen
// Depends on: ThemeCtx, TOKENS, useTheme, Icon, Btn, Input (window globals from shared.jsx)

const { useState: useStateS } = React;

function LoginScreen({ onLogin }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [username, setUsername] = useStateS('');
  const [password, setPassword] = useStateS('');
  const [confirm, setConfirm] = useStateS('');
  const [isReg, setIsReg] = useStateS(false);
  const [error, setError] = useStateS('');
  const [loading, setLoading] = useStateS(false);

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Username and password are required'); return; }
    if (isReg && password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(username.trim()); }, 750);
  };

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, position: 'relative', overflow: 'hidden' }}>
      {/* Dot grid texture */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${C.border} 1px, transparent 1px)`, backgroundSize: '28px 28px', opacity: 0.7, pointerEvents: 'none' }} />
      {/* Ambient glow */}
      <div style={{ position: 'absolute', left: '50%', top: '38%', width: 700, height: 600, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, ${C.primary} 0%, transparent 65%)`, opacity: dark ? 0.12 : 0.07, pointerEvents: 'none' }} />
      {/* Card */}
      <div style={{ position: 'relative', zIndex: 1, width: 420, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, boxShadow: C.shadowLg, animation: 'loginEntry 0.5s cubic-bezier(.2,.8,.2,1) forwards' }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.primary, marginBottom: 8 }}>Vehicle Software Data Analytics</p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text1, letterSpacing: '-0.03em', lineHeight: 1.1 }}>VSDA Deep Agent</h1>
          <p style={{ fontSize: 13, color: C.text2, marginTop: 6 }}>{isReg ? 'Create your account to get started' : 'Sign in to your account'}</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>Password</label>
            <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" type="password" />
          </div>
          {isReg && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>Confirm Password</label>
              <Input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm your password" type="password" />
            </div>
          )}
          {error && <div style={{ background: C.error + '12', color: C.error, fontSize: 12, padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.error}28` }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.8 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 150ms' }}>
            {loading
              ? <><span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> {isReg ? 'Creating account…' : 'Signing in…'}</>
              : isReg ? 'Create Account' : 'Sign In'
            }
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
          <span style={{ color: C.text3 }}>{isReg ? 'Already have an account? ' : "Don't have an account? "}</span>
          <button onClick={() => { setIsReg(!isReg); setError(''); }} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {isReg ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNewThread }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: C.bg, animation: 'fadeInUp 300ms ease forwards' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.primaryBg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="message-square" size={22} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text1, marginBottom: 4 }}>No thread selected</div>
        <div style={{ fontSize: 13, color: C.text2 }}>Pick a thread from the sidebar or start a new one</div>
      </div>
      <Btn variant="primary" onClick={onNewThread}><Icon name="square-pen" size={14} /> New Thread</Btn>
    </div>
  );
}

function LoadingScreen() {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return (
    <div style={{ flex: 1, background: C.bg, padding: '24px 24px 0', overflow: 'hidden' }}>
      {[
        { align: 'left',  msgW: '65%', lines: [['55%', 14], ['100%', 42]] },
        { align: 'right', msgW: '45%', lines: [['80%', 14], ['100%', 28]] },
        { align: 'left',  msgW: '72%', lines: [['40%', 14], ['100%', 56], ['80%', 28]] },
      ].map((row, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: row.align === 'right' ? 'flex-end' : 'flex-start', gap: 10, marginBottom: 22, opacity: 0, animation: `fadeInUp 300ms ${i * 120}ms ease forwards` }}>
          {row.align === 'left' && <Skeleton w={30} h={30} r={15} />}
          <div style={{ width: row.msgW, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {row.lines.map(([w, h], j) => <Skeleton key={j} w={w} h={h} r={j === 0 ? 4 : 8} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorScreen({ onRetry }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: C.bg, animation: 'fadeInUp 300ms ease forwards' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.error + '12', border: `1px solid ${C.error}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.error }}>
        <Icon name="triangle-alert" size={22} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text1, marginBottom: 4 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: C.text2 }}>Failed to load the thread. Check your connection and try again.</div>
      </div>
      <Btn variant="outline" onClick={onRetry}><Icon name="refresh-cw" size={13} /> Retry</Btn>
    </div>
  );
}

Object.assign(window, { LoginScreen, EmptyState, LoadingScreen, ErrorScreen });
