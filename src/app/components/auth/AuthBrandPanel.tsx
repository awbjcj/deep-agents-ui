import { FolderOpen, ShieldCheck, Workflow } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Workflow,
    title: "Multi-agent planning",
    body: "Delegate complex, multi-step work to specialized sub-agents.",
  },
  {
    icon: ShieldCheck,
    title: "Human-in-the-loop control",
    body: "Review and approve sensitive tool calls before they run.",
  },
  {
    icon: FolderOpen,
    title: "Shared workspace",
    body: "Preview and download every file your agents produce.",
  },
] as const;

function SignalRings() {
  return (
    <svg
      className="pointer-events-none absolute -bottom-40 -right-40 h-[620px] w-[620px] text-white/[0.08]"
      viewBox="0 0 620 620"
      fill="none"
      aria-hidden="true"
    >
      {[300, 240, 180, 120, 60].map((r) => (
        <circle
          key={r}
          cx="310"
          cy="310"
          r={r}
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
      <path
        d="M310 310 L430 30"
        stroke="var(--aptiv-orange)"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <circle
        cx="430"
        cy="30"
        r="4"
        fill="var(--aptiv-orange)"
      />
    </svg>
  );
}

/** Always-dark Aptiv brand column, shown beside auth forms on large screens. */
export function AuthBrandPanel() {
  return (
    <aside
      className="auth-brand-panel relative hidden overflow-hidden lg:flex lg:w-[46%] lg:max-w-[720px] lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      aria-label="About VSDA Deep Agent"
    >
      <div
        className="auth-brand-grid pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <SignalRings />

      <img
        src="/assets/aptiv_logo_white.svg"
        alt="Aptiv"
        className="relative h-7 w-auto self-start"
      />

      <div className="auth-stagger relative max-w-[460px]">
        <span className="aptiv-eyebrow block">VSDA Deep Agent</span>
        <p className="mb-0 mt-4 font-[family-name:var(--font-family-heading)] text-[40px] font-bold leading-[1.08] text-white xl:text-[46px]">
          Deep agents for engineering teams
          <span className="text-status-orange">.</span>
        </p>
        <p className="mb-0 mt-5 text-base leading-relaxed text-white/70">
          Plan, delegate, and review complex work with AI agents — with you in
          control of every critical step.
        </p>

        <ul className="mb-0 mt-10 list-none space-y-5 pl-0">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="mb-0 flex gap-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[color:var(--aptiv-turquoise)]">
                <Icon
                  className="h-[18px] w-[18px]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <p className="mb-0 text-sm font-semibold text-white">{title}</p>
                <p className="mb-0 mt-0.5 text-sm text-white/65">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mb-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
        Precision. Innovation. Safety.
      </p>
    </aside>
  );
}
