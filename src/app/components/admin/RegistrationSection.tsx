"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  apiCreateInvitationCode,
  apiGetRegistrationSettings,
  apiListInvitationCodes,
  apiRevokeInvitationCode,
  apiSetRegistrationSettings,
  CreatedInvitationCode,
  InvitationCode,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DisclosureSection,
  EmptyState,
  LoadingRow,
} from "@/app/components/admin/primitives";

export function RegistrationSection() {
  const [requireCode, setRequireCode] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isTogglingRequire, setIsTogglingRequire] = useState(false);

  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(true);

  const [note, setNote] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreatedInvitationCode | null>(
    null
  );

  useEffect(() => {
    setIsLoadingSettings(true);
    apiGetRegistrationSettings()
      .then((s) => setRequireCode(s.require_invitation_code))
      .catch(() => toast.error("Failed to load registration settings"))
      .finally(() => setIsLoadingSettings(false));
  }, []);

  const loadCodes = useCallback(() => {
    setIsLoadingCodes(true);
    apiListInvitationCodes()
      .then(setCodes)
      .catch(() => toast.error("Failed to load invitation codes"))
      .finally(() => setIsLoadingCodes(false));
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  const handleToggleRequire = async (checked: boolean) => {
    const prev = requireCode;
    setRequireCode(checked);
    setIsTogglingRequire(true);
    try {
      const updated = await apiSetRegistrationSettings(checked);
      setRequireCode(updated.require_invitation_code);
      toast.success(
        checked
          ? "Invitation code now required to register"
          : "Invitation code no longer required"
      );
    } catch (err) {
      setRequireCode(prev);
      toast.error(
        err instanceof Error ? err.message : "Failed to update setting"
      );
    } finally {
      setIsTogglingRequire(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const parsedDays = expiresDays.trim() ? Number(expiresDays.trim()) : null;
      if (
        parsedDays !== null &&
        (!Number.isInteger(parsedDays) || parsedDays < 1)
      ) {
        toast.error("Expiry must be a whole number of days (1 or more)");
        setIsGenerating(false);
        return;
      }
      const created = await apiCreateInvitationCode({
        note: note.trim() || null,
        expires_in_days: parsedDays,
      });
      setLastCreated(created);
      setNote("");
      setExpiresDays("");
      toast.success("Invitation code generated");
      loadCodes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate code"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (value: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard unavailable in this browser");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Invitation code copied to clipboard");
    } catch {
      toast.error("Failed to copy invitation code");
    }
  };

  const handleRevoke = async (codeId: string) => {
    try {
      await apiRevokeInvitationCode(codeId);
      setCodes((cs) => cs.filter((c) => c.id !== codeId));
      if (lastCreated?.id === codeId) setLastCreated(null);
      toast.success("Invitation code revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke code");
    }
  };

  return (
    <DisclosureSection
      title="Registration & invitations"
      subtitle={`${
        isLoadingSettings
          ? "Loading policy"
          : requireCode
          ? "Invitation required"
          : "Open registration"
      } · ${
        codes.filter((code) => code.status === "active").length
      } active code${
        codes.filter((code) => code.status === "active").length === 1 ? "" : "s"
      }`}
      contentClassName="space-y-5"
    >
      {isLoadingSettings ? (
        <LoadingRow />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/60 p-3">
          <div className="pr-4">
            <p className="text-sm font-semibold">Require invitation code</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When on, users must enter a valid one-time code to register.
            </p>
          </div>
          <Switch
            checked={requireCode}
            disabled={isTogglingRequire}
            onCheckedChange={handleToggleRequire}
            aria-label="Require invitation code for registration"
          />
        </div>
      )}

      <section className="space-y-3 border-t border-border/60 pt-4">
        <div>
          <h4 className="text-sm font-semibold">Generate code</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Create a single-use invitation for one new user
          </p>
        </div>
        <div className="space-y-3 rounded-lg border border-border/70 bg-card/60 p-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="invite-note"
              className="text-[13px] font-medium"
            >
              Note (optional)
            </Label>
            <Input
              id="invite-note"
              type="text"
              placeholder="e.g. Jane Doe — contractor"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              disabled={isGenerating}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="invite-expiry"
              className="text-[13px] font-medium"
            >
              Expires after (days, optional)
            </Label>
            <Input
              id="invite-expiry"
              type="number"
              min={1}
              placeholder="Never"
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              disabled={isGenerating}
            />
          </div>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="h-10 w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Generate invitation code
              </>
            )}
          </Button>

          {lastCreated && (
            <div className="border-[var(--aptiv-orange)]/40 bg-[var(--aptiv-orange)]/10 rounded-md border p-3">
              <p className="text-xs font-semibold text-foreground">
                New code — copy it now, it won&apos;t be shown again
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background/70 px-2 py-1.5 font-mono text-sm">
                  {lastCreated.code}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(lastCreated.code)}
                >
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border/60 pt-4">
        <div>
          <h4 className="text-sm font-semibold">Invitation codes</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Plaintext is only shown when a code is created
          </p>
        </div>
        {isLoadingCodes ? (
          <LoadingRow />
        ) : codes.length === 0 ? (
          <EmptyState
            title="No invitation codes"
            subtitle="Generate a code above to invite a new user."
          />
        ) : (
          <div className="space-y-2">
            {codes.map((code) => (
              <div
                key={code.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">
                      {code.code_prefix}…
                    </code>
                    <InvitationStatusBadge status={code.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {code.note ? `${code.note} · ` : ""}
                    by {code.created_by}
                    {code.expires_at
                      ? ` · expires ${formatTimestamp(code.expires_at)}`
                      : ""}
                    {code.used_by ? ` · used by ${code.used_by}` : ""}
                  </p>
                </div>
                {code.status === "active" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-destructive"
                    onClick={() => handleRevoke(code.id)}
                    aria-label="Revoke invitation code"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </DisclosureSection>
  );
}

function InvitationStatusBadge({
  status,
}: {
  status: InvitationCode["status"];
}) {
  const styles: Record<InvitationCode["status"], string> = {
    active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    used: "bg-muted text-muted-foreground",
    expired: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}
