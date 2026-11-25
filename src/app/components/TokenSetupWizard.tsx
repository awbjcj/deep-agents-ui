"use client";

import { CredentialTest } from "@/app/components/settings/CredentialTest";
import { useCredentialTests } from "@/app/hooks/useCredentialTests";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { MaskedTokenInput } from "@/app/components/settings/MaskedTokenInput";
import { Label } from "@/components/ui/label";
import { apiGetTokens, apiUpdateTokens } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/app/hooks/useNotifications";
import {
  hasSavedToken,
  OPEN_TOKEN_WIZARD_EVENT,
  SERVICE_TOKENS_UPDATED_EVENT,
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
          (g) => !hasSavedToken(tokens[g.previewField])
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
            (g) => !hasSavedToken(tokens[g.previewField])
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
    [guides, values]
  );

  const connection = useCredentialTests();
  const handleClose = () => {
    for (const guide of guides) connection.clear(guide.key);
    setValues({});
    markDismissed();
    setOpen(false);
  };

  const handleFinish = async () => {
    if (isSaving || connection.isTesting) return;
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
      for (const guide of guides) {
        const secret = payload[guide.payloadField];
        if (secret)
          connection.record(
            guide.key,
            { service: guide.payloadField, secret },
            updated.credential_revisions?.[guide.payloadField]
          );
      }
      window.dispatchEvent(
        new CustomEvent(SERVICE_TOKENS_UPDATED_EVENT, { detail: updated })
      );
      applyClearedNotifications(updated.cleared_notifications);
      toast.success(
        `Saved ${Object.keys(payload).length} token${
          Object.keys(payload).length === 1 ? "" : "s"
        }`
      );
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tokens");
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      void handleFinish();
    } else {
      setShowValue(false);
      setStep((s) => s + 1);
    }
  };

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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current.label}</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {guides.length}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress rail */}
          <div className="flex gap-1.5">
            {guides.map((g, i) => (
              <div
                key={g.key}
                className={
                  i <= step
                    ? "h-1 flex-1 rounded-full"
                    : "bg-muted h-1 flex-1 rounded-full"
                }
                style={
                  i <= step ? { background: "var(--aptiv-orange)" } : undefined
                }
                aria-hidden="true"
              />
            ))}
          </div>

          <TokenGuideSteps
            guide={current}
            username={username}
          />

          <div className="space-y-2">
            <Label
              htmlFor="wizardTokenInput"
              className="text-sm font-medium"
            >
              Paste token
            </Label>
            <MaskedTokenInput
              id="wizardTokenInput"
              tokenLabel="token"
              revealed={showValue}
              onToggle={() => setShowValue((visible) => !visible)}
              disabled={isSaving}
              value={values[current.key] ?? ""}
              onChange={(event) => {
                connection.clear(current.key);
                setValues((previous) => ({
                  ...previous,
                  [current.key]: event.target.value,
                }));
              }}
            />
            {values[current.key]?.trim() && (
              <CredentialTest
                result={connection.results[current.key]}
                disabled={isSaving}
                onTest={() =>
                  void connection.test(current.key, {
                    service: current.payloadField,
                    secret: values[current.key].trim(),
                  })
                }
              />
            )}
            <p className="text-muted-foreground text-xs">
              Tokens are saved when you finish.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={isSaving}
            className="text-muted-foreground hover:text-foreground h-8 px-3 text-xs font-semibold sm:mr-auto"
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
                className="h-8 gap-1.5 px-3 text-xs font-semibold"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={goNext}
              disabled={isSaving || (isLast && connection.isTesting)}
              className="h-8 gap-1.5 px-3 text-xs font-semibold"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : isLast ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {enteredCount > 0 ? "Save & finish" : "Finish"}
                </>
              ) : (
                <>
                  {values[current.key]?.trim() ? "Next" : "Skip"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
