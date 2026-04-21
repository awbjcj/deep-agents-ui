// components/shared.jsx
// Tokens, ThemeCtx, and all primitive UI components
// Exports to window: ThemeCtx, TOKENS, useTheme, Icon, Btn, Input, Badge, Skeleton, SectionLabel

const { useState, useEffect, useRef, useContext, createContext } = React;

const ThemeCtx = createContext({ dark: false, toggle: () => {} });
const useTheme = () => useContext(ThemeCtx);

const TOKENS = {
  light: {
    bg: '#f4f6fa', surface: '#eef1f8', surface2: '#e8ecf5', card: '#ffffff',
    border: '#d4dae8', borderL: '#e8ecf5',
    primary: '#0b6e64', primaryBg: '#e6f5f3', primaryHover: '#095c53',
    text1: '#0f1c2d', text2: '#536070', text3: '#8094a8',
    success: '#059669', warning: '#d97706', error: '#dc2626',
    userBg: '#e6f5f3', avatarBg: '#d0eae8',
    orange: '#F84018', inputBg: '#ffffff',
    shadow:   '0 1px 3px rgba(15,28,45,0.08), 0 1px 2px rgba(15,28,45,0.04)',
    shadowMd: '0 4px 12px rgba(15,28,45,0.10)',
    shadowLg: '0 12px 40px rgba(15,28,45,0.16)',
  },
  dark: {
    bg: '#0c1220', surface: '#111a2e', surface2: '#162036', card: '#141f2e',
    border: '#1c2d48', borderL: '#162036',
    primary: '#e8a020', primaryBg: 'rgba(232,160,32,0.12)', primaryHover: '#d4911c',
    text1: '#dde6f0', text2: '#8090a4', text3: '#4e6278',
    success: '#34d399', warning: '#fbbf24', error: '#f87171',
    userBg: '#141f38', avatarBg: '#1f3050',
    orange: '#F84018', inputBg: '#0c1220',
    shadow:   '0 1px 3px rgba(0,0,0,0.4)',
    shadowMd: '0 4px 12px rgba(0,0,0,0.50)',
    shadowLg: '0 12px 40px rgba(0,0,0,0.70)',
  },
};

function Icon({ name, size = 16 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    ref.current.innerHTML = '';
    const el = document.createElement('i');
    el.setAttribute('data-lucide', name);
    ref.current.appendChild(el);
    lucide.createIcons({ icons: lucide, rootElement: ref.current });
    const svg = ref.current.querySelector('svg');
    if (svg) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  }, [name, size]);
  return <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }} />;
}

function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, style: x = {}, full }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [hov, setHov] = useState(false);
  const sz = size === 'sm'
    ? { fontSize: 12, padding: '5px 12px', borderRadius: 7 }
    : { fontSize: 13, padding: '8px 16px', borderRadius: 8 };
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit', fontWeight: 500, transition: 'all 150ms ease', border: 'none',
    ...(full && { width: '100%', justifyContent: 'center' }), ...sz,
  };
  const v = {
    primary: { background: hov && !disabled ? C.primaryHover : C.primary, color: '#fff' },
    outline: { background: hov && !disabled ? C.surface : 'transparent', color: C.text2, border: `1px solid ${C.border}` },
    ghost:   { background: hov && !disabled ? C.surface2 : 'transparent', color: C.text2 },
    danger:  { background: hov && !disabled ? '#b91c1c' : C.error, color: '#fff' },
  };
  return (
    <button style={{ ...base, ...(v[variant] || v.primary), ...x }}
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled, style: x = {} }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
      style={{
        width: '100%', background: C.inputBg, borderRadius: 8,
        border: `1.5px solid ${focused ? C.primary : C.border}`,
        padding: '9px 12px', fontSize: 14, color: C.text1, fontFamily: 'inherit',
        outline: 'none', transition: 'all 150ms',
        boxShadow: focused ? `0 0 0 3px ${C.primaryBg}` : 'none', ...x,
      }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
  );
}

function Badge({ label, variant = 'default' }) {
  const clr = { admin: '#0b6e64', user: '#059669', viewer: '#d97706', active: '#059669', inactive: '#8094a8', error: '#dc2626', default: '#8094a8' };
  const c = clr[variant] || clr.default;
  return <span style={{ background: c + '18', color: c, border: `1px solid ${c}28`, borderRadius: 9999, fontSize: 10, padding: '2px 8px', fontWeight: 600 }}>{label}</span>;
}

function Skeleton({ w, h, r = 6 }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return <div style={{ width: w, height: h, borderRadius: r, background: C.surface2, animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />;
}

function SectionLabel({ children }) {
  const { dark } = useTheme();
  const C = TOKENS[dark ? 'dark' : 'light'];
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>{children}</div>;
}

Object.assign(window, { ThemeCtx, TOKENS, useTheme, Icon, Btn, Input, Badge, Skeleton, SectionLabel });
