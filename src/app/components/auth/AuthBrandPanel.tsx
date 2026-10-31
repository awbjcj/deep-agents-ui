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

const LANES = [54, 110, 166] as const;
const STEPS = [144, 192, 240, 288, 336] as const;
// Each sub-agent is its own wire: it branches off the orchestrator's line,
// runs its steps, and merges back before the approval point.
const LANE_WIRES = [
  "M96 110 V66 Q96 54 108 54 H372 Q384 54 384 66 V110",
  "M96 110 H384",
  "M96 110 V154 Q96 166 108 166 H372 Q384 166 384 154 V110",
] as const;
// The third sub-agent is still working: its last two steps are pending.
const isPending = (lane: number, step: number) => lane === 2 && step >= 3;

/**
 * Delegation motif: an orchestrator fans work out to sub-agent lanes, which
 * converge on one human-approval point (the single Aptiv orange point).
 * Routed orthogonally, like a vehicle wiring harness, from here to there.
 */
function DelegationFlow() {
  return (
    <svg
      className="auth-flow"
      viewBox="0 0 480 220"
      aria-hidden="true"
      focusable="false"
    >
      <g className="auth-flow__wires">
        <path
          pathLength={1}
          d="M52 110 H96"
        />
        {LANE_WIRES.map((d, lane) => (
          <path
            key={d}
            pathLength={1}
            d={d}
            style={{ animationDelay: `${100 + lane * 80}ms` }}
          />
        ))}
        <path
          pathLength={1}
          d="M384 110 H426"
          style={{ animationDelay: "420ms" }}
        />
      </g>

      <g className="auth-flow__nodes">
        {LANES.map((y, lane) =>
          STEPS.map((x, step) => (
            <circle
              key={`${x}-${y}`}
              className={
                isPending(lane, step)
                  ? "auth-flow__step auth-flow__step--pending"
                  : "auth-flow__step"
              }
              cx={x}
              cy={y}
              r="4"
              style={{ animationDelay: `${260 + step * 40 + lane * 60}ms` }}
            />
          ))
        )}
        <circle
          className="auth-flow__agent-ring"
          cx="40"
          cy="110"
          r="12"
        />
        <circle
          className="auth-flow__agent"
          cx="40"
          cy="110"
          r="5"
        />
      </g>

      <circle
        className="auth-flow__await"
        cx="440"
        cy="110"
        r="16"
      />
      <circle
        className="auth-flow__approval"
        cx="440"
        cy="110"
        r="8"
      />
    </svg>
  );
}

/** Aptiv brand column beside auth forms on wide screens; follows the theme. */
export function AuthBrandPanel() {
  return (
    <aside
      className="auth-brand"
      aria-label="About VSDA Deep Agent"
    >
      <DelegationFlow />

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
