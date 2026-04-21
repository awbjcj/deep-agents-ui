// components/panels.jsx
// ThreadList, TokenSidebar, UserSidebar, ConfigDialog
// Depends on: TOKENS, useTheme, Icon, Btn, Input, Badge, SectionLabel (window globals)

const { useState: useStateP } = React;

const MOCK_THREADS = [
  { id: '1', title: 'Sensor data analysis W47', time: '2 min ago', status: 'interrupted', preview: 'Analyzing vehicle sensor data…' },
  { id: '2', title: 'CAN bus diagnostic report', time: 'Yesterday', status: 'idle', preview: 'Generated diagnostic report for ECU #3…' },
  { id: '3', title: 'ADAS calibration review', time: 'Apr 18', status: 'idle', preview: 'Reviewed calibration data, found 2 issues…' },
  { id: '4', title: 'Powertrain anomaly detection', time: 'Apr 16', status: 'error', preview: 'Error during pipeline execution' },
  { id: '5', title: 'Fleet telemetry aggregation', time: 'Apr 14', status: 'idle', preview: 'Built telemetry aggregation pipeline…' },
];

const STATUS_CLRS = { idle: '#059669', busy: '#3b82f6', interrupted: '#d97706', error: '#dc2626' };

function ThreadItem({ t, active, onSelect }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [hov, setHov] = useStateP(false);
  return (
    <div onClick={() => onSelect(t.id)} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '9px 14px', cursor: 'pointer', transition: 'all 100ms', background: active ? C.primaryBg : hov ? C.surface2 : 'transparent', borderLeft: `2px solid ${active ? C.primary : 'transparent'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: active ? C.primary : C.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155, flex: 1 }}>{t.title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
          <span style={{ fontSize: 10, color: C.text3 }}>{t.time}</span>
          {t.status === 'interrupted' && <span style={{ background: C.warning, color: '#fff', borderRadius: 9999, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>!</span>}
          {t.status === 'error' && <span style={{ background: C.error, color: '#fff', borderRadius: 9999, fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>✕</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_CLRS[t.status] || C.text3, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.preview}</span>
      </div>
    </div>
  );
}

function ThreadList({ activeId, onSelect, onClose }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const groups = [
    { label: 'Requiring Attention', items: MOCK_THREADS.filter(t => t.status === 'interrupted' || t.status === 'error') },
    { label: 'Yesterday', items: MOCK_THREADS.filter(t => t.id === '2') },
    { label: 'Older', items: MOCK_THREADS.filter(t => t.id === '3' || t.id === '5') },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: C.card, borderRight: `1px solid ${C.border}` }}>
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Threads</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ background: C.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="square-pen" size={11} /> New
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text3, borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
            <Icon name="x" size={12} />
          </button>
        </div>
      </div>
      <div style={{ padding: '7px 10px', borderBottom: `1px solid ${C.borderL}` }}>
        <input placeholder="Search threads…" style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: C.text2, outline: 'none', fontFamily: 'inherit' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.label}>
            <div style={{ padding: '8px 12px 3px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>{g.label}</div>
            {g.items.map(t => <ThreadItem key={t.id} t={t} active={t.id === activeId} onSelect={onSelect} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function TokenSidebar({ onClose }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [saved, setSaved] = useStateP(false);
  const tokens = ['LangSmith API Key', 'Anthropic API Key', 'OpenAI API Key'];
  return (
    <div style={{ height: '100%', background: C.card, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', animation: 'slideInRight 200ms ease forwards' }}>
      <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="key" size={15} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>API Tokens</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.text3 }}><Icon name="x" size={16} /></button>
      </div>
      <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tokens.map((label, i) => (
          <div key={i}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.text2, display: 'block', marginBottom: 5 }}>{label}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="password" defaultValue="sk-••••••••••••••••" style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 12, color: C.text2, fontFamily: '"Formular Mono", monospace', outline: 'none' }} />
              <button style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 9px', cursor: 'pointer', color: C.text3 }}><Icon name="eye" size={13} /></button>
            </div>
          </div>
        ))}
        {saved
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.success, fontSize: 13, fontWeight: 500, marginTop: 4 }}><Icon name="check-circle" size={14} /> Tokens saved</div>
          : <Btn variant="primary" full onClick={() => setSaved(true)}><Icon name="save" size={13} /> Save Tokens</Btn>
        }
      </div>
    </div>
  );
}

function UserSidebar({ onClose }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const users = [
    { username: 'jsmith', role: 'admin', status: 'active', initials: 'JS' },
    { username: 'adavis', role: 'user', status: 'active', initials: 'AD' },
    { username: 'blee', role: 'viewer', status: 'inactive', initials: 'BL' },
    { username: 'mchen', role: 'user', status: 'active', initials: 'MC' },
  ];
  return (
    <div style={{ height: '100%', background: C.card, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', animation: 'slideInRight 200ms ease forwards' }}>
      <div style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="users" size={15} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text1 }}>Users</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.text3 }}><Icon name="x" size={16} /></button>
      </div>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.borderL}` }}>
        <Btn variant="primary" full size="sm"><Icon name="user-plus" size={12} /> Add User</Btn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {users.map((u, i) => (
          <div key={i} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.borderL}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 100ms', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.primary, border: `1px solid ${C.border}` }}>{u.initials}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text1 }}>{u.username}</div>
                <div style={{ fontSize: 10, color: C.text3 }}>{u.status}</div>
              </div>
            </div>
            <Badge label={u.role} variant={u.role} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigDialog({ onClose }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [url, setUrl] = useStateP('https://api.smith.langchain.com');
  const [aid, setAid] = useStateP('vsda-deep-agent');
  const [key, setKey] = useStateP('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)', animation: 'fadeIn 150ms ease forwards' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 460, boxShadow: C.shadowLg, animation: 'loginEntry 250ms ease forwards' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text1, letterSpacing: '-0.02em' }}>Settings</h2>
            <p style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>Configure your LangSmith deployment</p>
          </div>
          <button onClick={onClose} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text2 }}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>Deployment URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.smith.langchain.com" />
            <p style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>Your LangSmith deployment endpoint</p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>Assistant / Graph ID</label>
            <Input value={aid} onChange={e => setAid(e.target.value)} placeholder="graph-id or assistant UUID" />
            <p style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>UUID or graph name from your LangSmith project</p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.text1, display: 'block', marginBottom: 5 }}>LangSmith API Key <span style={{ color: C.text3, fontWeight: 400 }}>(optional)</span></label>
            <Input value={key} onChange={e => setKey(e.target.value)} placeholder="lsv2_sk_…" type="password" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Btn variant="outline" onClick={onClose} full>Cancel</Btn>
            <Btn variant="primary" onClick={onClose} full><Icon name="check" size={13} /> Save Configuration</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ThreadList, TokenSidebar, UserSidebar, ConfigDialog });
