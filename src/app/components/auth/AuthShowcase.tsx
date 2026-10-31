import { Check, FileText, MessageSquare } from "lucide-react";

const STEPS = [
  { label: "Triaged 18 failed test runs into 4 root causes" },
  { label: "Sub-agent db-search matched 3 known defects in the database" },
] as const;

/**
 * Static preview of an agent run. It illustrates triage, delegated database
 * search and a human-approved Teams post, and follows the page theme.
 */
function AgentRunPreview() {
  return (
    <figure className="relative m-0">
      <figcaption className="sr-only">
        Example agent run: the agent triaged 18 failed test runs into 4 root
        causes, a db-search sub-agent matched 3 known defects in the database,
        and posting the summary to a Microsoft Teams channel is waiting for your
        approval.
      </figcaption>
      <div
        aria-hidden="true"
        className="max-w-[520px] rounded-lg border border-[var(--auth-panel-border)] bg-[var(--auth-panel-card)] text-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--auth-panel-border)] px-4 py-3">
          <span className="font-bold text-primary">Agent run</span>
          <span className="rounded-full border border-[var(--auth-panel-border)] px-2.5 py-0.5 text-xs text-secondary">
            Awaiting approval
          </span>
        </div>

        <div className="space-y-4 p-4">
          <p className="mb-0 rounded-md bg-[var(--auth-panel-bg)] px-3 py-2.5 leading-normal text-primary">
            Triage last night’s failed HIL runs, search the defect database for
            matches, and post a summary to the team on Teams.
          </p>

          <ol className="mb-0 list-none space-y-2.5 pl-0">
            {STEPS.map((step) => (
              <li
                key={step.label}
                className="mb-0 flex items-start gap-2.5 text-secondary"
              >
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--auth-cta-bg)] text-[var(--auth-cta-fg)]">
                  <Check className="h-3 w-3" />
                </span>
                {step.label}
              </li>
            ))}
            <li className="mb-0 flex items-start gap-2.5 text-primary">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--auth-panel-border)]">
                <MessageSquare className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                Approval needed to post in Teams{" "}
                <code className="rounded bg-[var(--auth-panel-bg)] px-1 py-0.5 font-mono text-xs">
                  #sw-validation
                </code>
                <span className="mt-3 flex gap-2">
                  <span className="rounded-md border border-[var(--auth-panel-border)] px-3 py-1.5 text-xs text-secondary">
                    Reject
                  </span>
                  <span className="rounded-md bg-[var(--auth-cta-bg)] px-3 py-1.5 text-xs font-bold text-[var(--auth-cta-fg)]">
                    Approve
                  </span>
                </span>
              </span>
            </li>
          </ol>

          <div className="flex items-center gap-2.5 rounded-md border border-dashed border-[var(--auth-panel-border)] px-3 py-2 text-secondary">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-primary">
              triage-report.md
            </span>
            <span className="text-xs">Draft</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Theme-aware Aptiv showcase column, shown beside auth forms on large screens. */
export function AuthShowcase() {
  return (
    <aside
      aria-labelledby="auth-showcase-title"
      className="relative hidden min-w-0 overflow-hidden rounded-xl border border-[var(--auth-panel-border)] bg-[var(--auth-panel-bg)] lg:flex lg:w-[52%] lg:flex-col lg:justify-center lg:gap-14 lg:p-12 xl:p-16"
    >
      <div
        className="auth-pattern pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="auth-stagger relative max-w-[480px]">
        <div className="flex items-center gap-3">
          <span
            className="aptiv-point"
            aria-hidden="true"
          />
          <span
            className="text-xs font-bold uppercase tracking-[0.18em] text-secondary"
            translate="no"
          >
            VSDA Deep Agent
          </span>
        </div>
        <h2
          id="auth-showcase-title"
          className="mb-0 mt-6 font-[family-name:var(--font-family-heading)] text-[40px] font-bold leading-[1.15] text-primary [text-wrap:balance] xl:text-[46px]"
        >
          Deep Agents for Engineering Teams
        </h2>
        <p className="mb-0 mt-5 max-w-[44ch] text-base leading-normal text-secondary">
          Plan, delegate, and review multi-step work with AI agents — and
          approve every critical action before it runs.
        </p>
      </div>

      <div className="auth-stagger relative">
        <AgentRunPreview />
      </div>
    </aside>
  );
}
