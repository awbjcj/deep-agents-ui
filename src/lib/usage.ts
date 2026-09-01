/**
 * Weekly-usage display helpers.
 *
 * The backend tracks weekly weighted-token, LLM-call, and estimated model-cost
 * caps. `RUN_MODE` still supplies the default token/call display dimension, while
 * enabled caps are enforced independently. Keeping display selection in one
 * tested place prevents per-surface drift without changing server enforcement.
 */

export type EnforcedDimension = "tokens" | "calls";
export type UsageDimension = EnforcedDimension | "cost";

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
  cost_used_usd: number;
  cost_limit_usd: number;
  cost_pct: number;
  cost_is_unlimited: boolean;
  enforced: EnforcedDimension;
}

/** A single meter's values, dimension-agnostic. */
export interface UsageMeterView {
  used: number;
  limit: number;
  pct: number;
  isUnlimited: boolean;
  dimension: UsageDimension;
}

export interface SplitUsageView {
  /** The selected cap — drives the primary bar and percentage. */
  primary: UsageMeterView;
  /** Token/call context retained for existing consumers. */
  secondary: UsageMeterView;
}

/**
 * Split a usage summary into the meter to feature (primary) and one kept
 * alongside it for context (secondary).
 *
 * The primary meter is whichever dimension is being displayed: the backend's
 * run-mode dimension (`u.enforced`) by default, or `override` when the viewer
 * has picked one via the local display switch. Selecting a dimension only
 * changes what is shown — it never alters server-side enforcement.
 *
 * The secondary meter is the token or call counterpart, so a cost-primary view
 * still surfaces the count-based cap the backend is actually enforcing.
 */
export function splitUsageByEnforcement(
  u: EnforcedUsageFields,
  override?: UsageDimension
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
  const cost: UsageMeterView = {
    used: u.cost_used_usd,
    limit: u.cost_limit_usd,
    pct: u.cost_pct,
    isUnlimited: u.cost_is_unlimited,
    dimension: "cost",
  };
  const primaryDimension = override ?? u.enforced;
  if (primaryDimension === "cost") {
    return {
      primary: cost,
      secondary: u.enforced === "calls" ? calls : tokens,
    };
  }
  return primaryDimension === "calls"
    ? { primary: calls, secondary: tokens }
    : { primary: tokens, secondary: calls };
}

/** Format a usage amount with dimension-appropriate units. */
export function formatUsageAmount(
  value: number,
  dimension: UsageDimension
): string {
  if (dimension !== "cost") {
    return Math.round(value).toLocaleString("en-US");
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}
