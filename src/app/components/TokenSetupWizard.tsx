"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetTokens, apiUpdateTokens } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/app/hooks/useNotifications";
import {
  OPEN_TOKEN_WIZARD_EVENT,
  TOKEN_SERVICE_GUIDES,
  type TokenServiceGuide,
} from "@/app/components/tokenServiceGuides";
import { TokenGuideSteps } from "@/app/components/tokenSetupGuides";

/**
 * Per-user flag so we only auto-prompt for token setup once. Stored per user
 * id so that a shared machine prompts each distinct account separately.
 */
function dismissKey(userId: string): string {
  return `vsda_token_setup_dismissed_${userId}`;
}

/**
 * First-time guided setup for access tokens.
 *
 * Auto-opens once per user when one or more services have no stored token, so
 * new users are walked through getting each token (with the right link and
 * expiry notes). Users can skip individual services or dismiss entirely and
 * set up later. Can also be re-opened on demand via {@link OPEN_TOKEN_WIZARD_EVENT}.
 */
export function TokenSetupWizard() {
  const { user } = useAuth();
  const { applyClearedNotifications } = useNotifications();
  const username = user?.username ?? "";

  const [open, setOpen] = useState(false);
  const [guides, setGuides] = useState<TokenServiceGuide[]>([]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValue, setShowValue] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const markDismissed = useCallback(() => {
    if (user?.user_id) {
      window.localStorage.setItem(dismissKey(user.user_id), "1");
    }
  }, [user?.user_id]);

  // Auto-open once per user when tokens are missing.
  useEffect(() => {
    if (!user?.user_id) return;
    if (window.localStorage.getItem(dismissKey(user.user_id))) return;
    let cancelled = false;
    (async () => {
      try {
        const tokens = await apiGetTokens();
        if (cancelled) return;
        const missing = TOKEN_SERVICE_GUIDES.filter(
          (g) => !tokens[g.previewField],
        );
        if (missing.length > 0) {
          setGuides(missing);
          setStep(0);
          setValues({});
          setShowValue(false);
          setOpen(true);
        }
      } catch {
        // Best-effort onboarding — never block the app if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.user_id]);

  // Manual re-open from the Tokens sidebar. Show services still missing a
  // token, or all of them if everything is already configured.
  useEffect(() => {
    const handler = () => {
      void (async () => {
        let next = TOKEN_SERVICE_GUIDES;
        try {
          const tokens = await apiGetTokens();
          const missing = TOKEN_SERVICE_GUIDES.filter(
            (g) => !tokens[g.previewField],
          );
          if (missing.length > 0) next = missing;
        } catch {
          // Fall back to showing every service.
        }
        setGuides(next);
        setStep(0);
        setValues({});
        setShowValue(false);
        setOpen(true);
      })();
    };
    window.addEventListener(OPEN_TOKEN_WIZARD_EVENT, handler);
    return () => window.removeEventListener(OPEN_TOKEN_WIZARD_EVENT, handler);
  }, []);

  const current = guides[step];
  const isLast = step === guides.length - 1;

  const enteredCount = useMemo(
    () => guides.filter((g) => values[g.key]?.trim()).length,
    [guides, values],
  );

  const handleClose = useCallback(() => {
    markDismissed();
    setOpen(false);
  }, [markDismissed]);

  const handleFinish = useCallback(async () => {
    const payload: Record<string, string> = {};
    for (const guide of guides) {
      const value = values[guide.key]?.trim();
      if (value) payload[guide.payloadField] = value;
    }
    if (Object.keys(payload).length === 0) {
      handleClose();
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiUpdateTokens(payload);
      if (updated.cleared_notifications?.length) {
        applyClearedNotifications(updated.cleared_notifications);
      }
      toast.success(
        `Saved ${Object.keys(payload).length} token${Object.keys(payload).length === 1 ? "" : "s"}`,
      );
      markDismissed();
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save tokens",
      );
    } finally {
      setIsSaving(false);
    }
  }, [applyClearedNotifications, guides, handleClose, markDismissed, values]);

  const goNext = useCallback(() => {
    if (isLast) {
      void handleFinish();
    } else {
      setShowValue(false);
      setStep((s) => s + 1);
    }
  }, [handleFinish, isLast]);

  const goBack = useCallback(() => {
    setShowValue(false);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  if (!current) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up your access tokens</DialogTitle>
          <DialogDescription>
            Add your personal tokens so the assistant can reach these services
            on your behalf. You can skip any of these and add them later from
            the Tokens panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {step + 1} of {guides.length}
            </span>
            <span className="font-medium text-foreground">{current.label}</span>
          </div>
          {/* Progress rail */}
          <div className="flex gap-1.5">
            {guides.map((g, i) => (
              <div
                key={g.key}
                className={i <= step ? "h-1 flex-1 rounded-full" : "h-1 flex-1 rounded-full bg-muted"}
                style={i <= step ? { background: "var(--aptiv-orange)" } : undefined}
                aria-hidden="true"
              />
            ))}
          </div>

          <TokenGuideSteps guide={current} username={username} />

          <div className="space-y-2">
            <Label htmlFor="wizardTokenInput" className="text-sm font-medium">
              Paste your {current.label}
            </Label>
            <div className="relative">
              <Input
                id="wizardTokenInput"
                type={showValue ? "text" : "password"}
                placeholder={`Enter your ${current.label}`}
                value={values[current.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [current.key]: e.target.value,
                  }))
                }
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showValue ? "Hide token" : "Show token"}
              >
                {showValue ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave this blank to skip — nothing is saved until you finish.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isSaving}
            className="sm:mr-auto"
          >
            Set up later
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={goBack}
                disabled={isSaving}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={goNext} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isLast ? (
                <>
                  <Check className="mr-1 h-4 w-4" />
                  {enteredCount > 0 ? "Save & finish" : "Finish"}
                </>
              ) : (
                <>
                  {values[current.key]?.trim() ? "Next" : "Skip"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
