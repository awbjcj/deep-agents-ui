/**
 * Weekly-usage display helpers.
 *
 * The backend tracks two independent weekly caps — weighted tokens and LLM-call
 * count — but enforces exactly one, chosen by `RUN_MODE` (`calls` under proxy,
 * `tokens` for remote/gateway). The usage summary carries both plus an
 * `enforced` marker. UI meters must render the *enforced* dimension as the
 * primary bar; the other is context only. Keeping this selection in one tested
 * place prevents the per-surface drift that let the admin panel keep showing the
 * token % after the workspace bar had moved to the enforced dimension.
 */

export type EnforcedDimension = "tokens" | "calls";

/** The subset of a usage summary needed to pick the enforced dimension. */
export interface EnforcedUsageFields {
  used: number;
  limit: number;
  pct: number;
  is_unlimited: boolean;
  calls_used: number;
  calls_limit: number;
  calls_pct: number;
  calls_is_unlimited: boolean;
  enforced: EnforcedDimension;
}

/** A single meter's values, dimension-agnostic. */
export interface UsageMeterView {
  used: number;
  limit: number;
  pct: number;
  isUnlimited: boolean;
  dimension: EnforcedDimension;
}

export interface SplitUsageView {
  /** The actively-enforced cap — drives the primary bar and percentage. */
  primary: UsageMeterView;
  /** The other (tracked but not enforced) cap — shown as secondary context. */
  secondary: UsageMeterView;
}

/**
 * Split a usage summary into the enforced (primary) and non-enforced
 * (secondary) meters.
 *
 * By default the actively-enforced dimension (`u.enforced`) drives the primary
 * meter. Pass `override` to force a specific dimension primary instead — this
 * backs the local, per-view display switch, letting a viewer inspect either cap
 * without altering which one the backend enforces.
 */
export function splitUsageByEnforcement(
  u: EnforcedUsageFields,
  override?: EnforcedDimension,
): SplitUsageView {
  const tokens: UsageMeterView = {
    used: u.used,
    limit: u.limit,
    pct: u.pct,
    isUnlimited: u.is_unlimited,
    dimension: "tokens",
  };
  const calls: UsageMeterView = {
    used: u.calls_used,
    limit: u.calls_limit,
    pct: u.calls_pct,
    isUnlimited: u.calls_is_unlimited,
    dimension: "calls",
  };
  const primaryDimension = override ?? u.enforced;
  return primaryDimension === "calls"
    ? { primary: calls, secondary: tokens }
    : { primary: tokens, secondary: calls };
}
