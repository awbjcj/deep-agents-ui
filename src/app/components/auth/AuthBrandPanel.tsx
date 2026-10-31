import { Database, ListChecks, MessagesSquare } from "lucide-react";

const FEATURES = [
  {
    icon: ListChecks,
    text: "Triage failed runs and new issues into root causes",
  },
  {
    icon: Database,
    text: "Search defect and requirements databases with sub‑agents",
  },
  {
    icon: MessagesSquare,
    text: "Draft Teams updates and post them after your approval",
  },
] as const;

/** Aptiv brand column beside auth forms on wide screens; follows the theme. */
export function AuthBrandPanel() {
  return (
    <aside
      className="auth-brand"
      aria-label="About VSDA Deep Agent"
    >
      <header
        className="auth-brand__top"
        translate="no"
      >
        <img
          className="auth-logo auth-logo--light h-6"
          src="/assets/aptiv_logo_color.svg"
          alt="Aptiv"
          width={107}
          height={24}
        />
        <img
          className="auth-logo auth-logo--dark h-6"
          src="/assets/aptiv_logo_white.svg"
          alt="Aptiv"
          width={107}
          height={24}
        />
      </header>

      <div className="auth-brand__body">
        <p
          className="auth-eyebrow auth-eyebrow--brand"
          translate="no"
        >
          VSDA Deep Agent
        </p>
        <p className="auth-brand__headline">
          Engineering work, planned, delegated and{" "}
          <span className="auth-brand__highlight">approved</span>.
        </p>
        <p className="auth-brand__lede">
          Plan, delegate, and review multi-step work with AI agents. Every
          critical action waits for your approval.
        </p>
        <ul className="auth-brand__features">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon
                className="auth-icon"
                aria-hidden="true"
              />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="auth-brand__footer">Precision. Innovation. Safety.</p>
    </aside>
  );
}
