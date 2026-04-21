// components/chat.jsx
// ToolCallBox, ChatMsg, TodoPanel, Composer, ChatInterface
// Depends on: TOKENS, useTheme, Icon, Btn, SectionLabel (window globals)

const { useState: useStateC, useRef: useRefC, useEffect: useEffectC } = React;

const MOCK_MESSAGES = [
  { id: '1', role: 'user', content: 'Analyze the vehicle sensor data from last week\'s W47 test run and flag any anomalies.' },
  { id: '2', role: 'agent', content: 'I\'ll analyze the W47 sensor data. Starting by reading the data files and running the analysis pipeline.', tools: [
    { name: 'read_file', args: 'sensor_data_w47.csv', status: 'done' },
    { name: 'bash_exec', args: 'python analyze.py --input sensor_data_w47.csv --output results/', status: 'done' },
  ]},
  { id: '3', role: 'subagent', label: 'researcher', content: 'Scanning 1,240 data points across 18 sensor channels…' },
  { id: '4', role: 'agent', content: 'Analysis complete. Found **3 anomalies** in the lateral acceleration sensor (channel 7) between timestamps 14:23:05–14:23:41. Peak deviation: **2.4σ** above the calibrated baseline.\n\nFull report written to `output/w47_analysis.md`.', tools: [
    { name: 'write_file', args: 'output/w47_analysis.md', status: 'done' },
  ]},
  { id: '5', role: 'interrupt', content: 'The agent wants to write to `/etc/config/adas.json`. This modifies vehicle safety configuration. Approve this action?' },
];

const MOCK_TODOS = [
  { label: 'Read sensor data files', status: 'completed' },
  { label: 'Run analysis pipeline', status: 'completed' },
  { label: 'Detect anomalies', status: 'completed' },
  { label: 'Write output report', status: 'in_progress' },
  { label: 'Summarize findings', status: 'pending' },
];

function ToolCallBox({ tool }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [open, setOpen] = useStateC(false);
  const statusColor = tool.status === 'done' ? C.success : tool.status === 'running' ? C.warning : C.text3;
  const statusLabel = tool.status === 'done' ? 'Completed' : tool.status === 'running' ? 'Running' : 'Pending';
  const statusIcon = tool.status === 'done' ? 'check-circle-2' : tool.status === 'running' ? 'circle-dashed' : 'circle';
  return (
    <div onClick={() => setOpen(!open)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 11px', marginBottom: 6, cursor: 'pointer', transition: 'background 100ms', animation: 'fadeInUp 200ms ease forwards' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: statusColor, display: 'inline-flex' }}><Icon name={statusIcon} size={13} /></span>
          <span style={{ fontSize: 12, fontFamily: '"Formular Mono", monospace', color: C.text2 }}>{tool.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
          <span style={{ color: C.text3, display: 'inline-flex' }}><Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} /></span>
        </div>
      </div>
      {open && <div style={{ marginTop: 7, fontSize: 11, fontFamily: '"Formular Mono", monospace', color: C.text3, background: dark ? C.bg : C.surface2, borderRadius: 5, padding: '6px 9px', wordBreak: 'break-all' }}>{tool.args}</div>}
    </div>
  );
}

function ChatMsg({ msg, delay = 0 }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [approved, setApproved] = useStateC(null);

  if (msg.role === 'user') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
      <div style={{ background: C.userBg, color: C.text1, borderRadius: '12px 12px 2px 12px', padding: '10px 14px', maxWidth: '70%', fontSize: 14, lineHeight: 1.65, border: `1px solid ${C.border}` }}>{msg.content}</div>
    </div>
  );

  if (msg.role === 'subagent') return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, opacity: 0.7 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        <Icon name="corner-down-right" size={10} />
      </div>
      <div style={{ fontSize: 12, color: C.text3, alignSelf: 'center' }}>
        <span style={{ color: C.primary, fontWeight: 600, marginRight: 5 }}>{msg.label}</span>{msg.content}
      </div>
    </div>
  );

  if (msg.role === 'interrupt') return (
    <div style={{ background: dark ? 'rgba(251,191,36,0.06)' : '#fffbeb', border: `1px solid ${dark ? 'rgba(251,191,36,0.2)' : '#fde68a'}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: dark ? '#fbbf24' : '#92400e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="triangle-alert" size={14} /> Approval Required
      </div>
      <div style={{ fontSize: 13, color: dark ? '#e5d49a' : '#78350f', lineHeight: 1.6, marginBottom: 12 }}>{msg.content}</div>
      {approved === null ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setApproved(true)} style={{ background: C.success, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 150ms' }}>
            <Icon name="check" size={13} /> Approve
          </button>
          <button onClick={() => setApproved(false)} style={{ background: 'transparent', border: `1px solid ${C.error}`, color: C.error, borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 150ms' }}>
            <Icon name="x" size={13} /> Reject
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: approved ? C.success : C.error, fontWeight: 500 }}>
          <Icon name={approved ? 'check-circle' : 'x-circle'} size={14} />
          {approved ? 'Action approved — continuing execution' : 'Action rejected — agent will skip this step'}
        </div>
      )}
    </div>
  );

  // Agent message
  const formatted = msg.content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, `<code style="background:${C.surface};padding:2px 6px;border-radius:4px;font-family:'Formular Mono',monospace;font-size:12px;color:${C.primary}">$1</code>`);

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.avatarBg, color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, border: `1px solid ${C.border}` }}>A</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.primary, marginBottom: 5 }}>VSDA Deep Agent</div>
        {msg.tools && msg.tools.map((t, i) => <ToolCallBox key={i} tool={t} />)}
        <div style={{ fontSize: 14, color: C.text1, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: formatted }} />
      </div>
    </div>
  );
}

function TodoPanel() {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const icons = { completed: 'check-circle-2', in_progress: 'clock', pending: 'circle' };
  const colors = { completed: C.success, in_progress: C.warning, pending: C.text3 };
  return (
    <div style={{ padding: '12px 14px' }}>
      <SectionLabel>Tasks</SectionLabel>
      {MOCK_TODOS.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <span style={{ color: colors[t.status], flexShrink: 0, display: 'inline-flex' }}><Icon name={icons[t.status]} size={13} /></span>
          <span style={{ fontSize: 12, color: t.status === 'completed' ? C.text3 : C.text1, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function Composer({ onSend, disabled }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [val, setVal] = useStateC('');
  const submit = () => { if (!val.trim() || disabled) return; onSend(val); setVal(''); };
  const canSend = !!val.trim() && !disabled;
  return (
    <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.card, flexShrink: 0 }}>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: C.shadow }}>
        <textarea value={val} onChange={e => setVal(e.target.value)} placeholder="Ask anything…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '11px 14px', fontSize: 14, color: C.text1, fontFamily: 'inherit', minHeight: 72, lineHeight: 1.6 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: `1px solid ${C.borderL}` }}>
          <button style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, color: C.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Icon name="paperclip" size={11} /> Attach
          </button>
          <button onClick={submit} disabled={!canSend} style={{ background: canSend ? C.primary : C.border, border: 'none', borderRadius: 7, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'default', transition: 'all 150ms', color: canSend ? '#fff' : C.text3 }}>
            <Icon name="arrow-up" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatInterface({ threadId, appState, onNewThread }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [messages, setMessages] = useStateC(MOCK_MESSAGES);
  const [metaOpen, setMetaOpen] = useStateC(null);
  const scrollRef = useRefC(null);

  useEffectC(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const handleSend = (text) => {
    setMessages(m => [...m, { id: Date.now() + '', role: 'user', content: text }]);
    setTimeout(() => setMessages(m => [...m, { id: (Date.now() + 1) + '', role: 'agent', content: 'I\'m processing your request. Let me look into that.', tools: [] }]), 700);
  };

  if (!threadId || appState === 'empty') return <EmptyState onNewThread={onNewThread} />;
  if (appState === 'loading') return <LoadingScreen />;
  if (appState === 'error') return <ErrorScreen onRetry={() => {}} />;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', background: C.bg }}>
      {/* Thread topbar */}
      <div style={{ padding: '0 16px', height: 44, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: C.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.warning }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>Sensor data analysis W47</span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {['tasks', 'files'].map(k => (
            <button key={k} onClick={() => setMetaOpen(metaOpen === k ? null : k)}
              style={{ background: metaOpen === k ? C.primaryBg : 'transparent', border: `1px solid ${metaOpen === k ? C.primary : C.border}`, borderRadius: 6, padding: '3px 9px', fontSize: 11, color: metaOpen === k ? C.primary : C.text2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontWeight: 500, transition: 'all 120ms' }}>
              <Icon name={k === 'tasks' ? 'check-circle' : 'file'} size={11} />{k === 'tasks' ? 'Tasks' : 'Files'}
            </button>
          ))}
        </div>
      </div>
      {/* Messages + meta */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: 880, width: '100%', margin: '0 auto' }}>
          {messages.map((m, i) => <ChatMsg key={m.id} msg={m} delay={i < 6 ? 0 : i * 40} />)}
          <div style={{ height: 8 }} />
        </div>
        {metaOpen && (
          <div style={{ width: 220, borderLeft: `1px solid ${C.border}`, background: C.card, overflowY: 'auto', flexShrink: 0, animation: 'slideInRight 200ms ease forwards' }}>
            {metaOpen === 'tasks' ? <TodoPanel /> : (
              <div style={{ padding: '12px 14px' }}>
                <SectionLabel>Files</SectionLabel>
                {['sensor_data_w47.csv', 'output/w47_analysis.md', 'analyze.py'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, fontSize: 12, color: C.text2, cursor: 'pointer' }}>
                    <Icon name="file" size={12} />{f}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Composer onSend={handleSend} disabled={false} />
    </div>
  );
}

Object.assign(window, { ChatInterface, ToolCallBox });
