"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  History,
  Loader2,
  Mail,
  Monitor,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";
import {
  apiCreateNewsletter,
  apiDeleteNewsletter,
  apiGetNewsletter,
  apiListNewsletters,
  apiSendNewsletter,
  apiTestNewsletter,
  apiUpdateNewsletter,
  newsletterProgress,
  type NewsletterDetail,
  type NewsletterSummary,
} from "@/lib/newsletters";

type WorkspaceView = "compose" | "history";
type ComposerView = "write" | "preview";

const ROLES: Role[] = ["user", "developer", "admin"];

const STARTERS = [
  {
    label: "Product update",
    subject: "What’s new in VSDA Deep Agent",
    body: "Hello team,\n\n## What’s new\n\n- Add the first improvement\n- Add another helpful change\n\n## What you need to know\n\nShare the impact and any action people should take.\n\nThanks,\nThe VSDA team",
  },
  {
    label: "Maintenance",
    subject: "Planned maintenance: [date and time]",
    body: "Hello team,\n\nVSDA Deep Agent will be unavailable during a planned maintenance window.\n\n**When:** [date, start time–end time]\n\n**Expected impact:** [describe the impact]\n\nNo action is required. We’ll send an update when service is restored.",
  },
  {
    label: "Team note",
    subject: "A note from the VSDA team",
    body: "Hello team,\n\nShare your announcement here. Keep the opening concise, then add any supporting details below.\n\n## Next steps\n\n- Add an action, owner, or date\n\nThank you,\nThe VSDA team",
  },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "Not sent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function audienceLabel(targetTiers: Role[] | null): string {
  if (targetTiers === null) return "Everyone";
  return targetTiers
    .map((tier) => `${tier[0]?.toUpperCase()}${tier.slice(1)}`)
    .join(", ");
}

export function NewsletterSection() {
  const [view, setView] = useState<WorkspaceView>("compose");
  const [composerView, setComposerView] = useState<ComposerView>("write");
  const [newsletters, setNewsletters] = useState<NewsletterSummary[]>([]);
  const [selected, setSelected] = useState<NewsletterDetail | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetTiers, setTargetTiers] = useState<Role[] | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isActioning, setIsActioning] = useState<
    "test" | "send" | "delete" | null
  >(null);

  const loadList = useCallback(async (signal?: AbortSignal) => {
    try {
      setNewsletters(await apiListNewsletters(signal));
    } catch (error) {
      if (signal?.aborted) return;
      toast.error(
        error instanceof Error ? error.message : "Could not load newsletters"
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    if (selected?.status !== "sending") return;
    const interval = window.setInterval(() => {
      void Promise.all([apiGetNewsletter(selected.id), apiListNewsletters()])
        .then(([detail, list]) => {
          setSelected(detail);
          setNewsletters(list);
        })
        .catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [selected?.id, selected?.status]);

  const stats = useMemo(() => {
    const drafts = newsletters.filter((item) => item.status === "draft").length;
    const sending = newsletters.filter(
      (item) => item.status === "sending"
    ).length;
    const delivered = newsletters.reduce(
      (sum, item) => sum + item.sent_count,
      0
    );
    return { drafts, sending, delivered };
  }, [newsletters]);

  const isDirty = subject.trim().length > 0 || body.trim().length > 0;

  const resetComposer = () => {
    setEditingId(null);
    setSubject("");
    setBody("");
    setTargetTiers(null);
    setPreviewHtml("");
    setRecipientCount(null);
    setComposerView("write");
    setSelected(null);
    setView("compose");
  };

  const applyStarter = (starter: (typeof STARTERS)[number]) => {
    if (
      isDirty &&
      !confirm("Replace the current draft with this starting point?")
    )
      return;
    setSubject(starter.subject);
    setBody(starter.body);
    setComposerView("write");
  };

  const toggleTier = (role: Role) => {
    setTargetTiers((current) => {
      const next =
        current === null
          ? [role]
          : current.includes(role)
          ? current.filter((item) => item !== role)
          : [...current, role];
      return next.length === 0 || next.length === ROLES.length ? null : next;
    });
  };

  const saveDraft = async () => {
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    if (!cleanSubject || !cleanBody) {
      toast.error("Add a subject and message before previewing");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        subject: cleanSubject,
        body_markdown: cleanBody,
        target_tiers: targetTiers,
      };
      const preview = editingId
        ? await apiUpdateNewsletter(editingId, payload)
        : await apiCreateNewsletter(payload);
      setEditingId(preview.id);
      setPreviewHtml(preview.body_html);
      setRecipientCount(preview.recipient_count);
      setComposerView("preview");
      await loadList();
      toast.success(editingId ? "Draft updated" : "Draft saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save draft"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openNewsletter = async (summary: NewsletterSummary) => {
    try {
      const detail = await apiGetNewsletter(summary.id);
      setSelected(detail);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load newsletter"
      );
    }
  };

  const editSelected = () => {
    if (!selected || selected.status !== "draft") return;
    setEditingId(selected.id);
    setSubject(selected.subject);
    setBody(selected.body_markdown);
    setTargetTiers(selected.target_tiers);
    setPreviewHtml(selected.body_html);
    setRecipientCount(selected.total_recipients);
    setComposerView("write");
    setView("compose");
  };

  const testSend = async () => {
    if (!editingId) return;
    setIsActioning("test");
    try {
      await apiTestNewsletter(editingId);
      toast.success("Test email sent to your inbox");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test email failed");
    } finally {
      setIsActioning(null);
    }
  };

  const sendNewsletter = async () => {
    if (!editingId || recipientCount === null) return;
    if (
      !confirm(
        `Send this newsletter to ${recipientCount} recipient${
          recipientCount === 1 ? "" : "s"
        }?`
      )
    )
      return;
    setIsActioning("send");
    try {
      await apiSendNewsletter(editingId);
      const detail = await apiGetNewsletter(editingId);
      setSelected(detail);
      await loadList();
      setView("history");
      toast.success("Newsletter queued for delivery");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send newsletter"
      );
    } finally {
      setIsActioning(null);
    }
  };

  const deleteDraft = async (id: string) => {
    if (!confirm("Delete this newsletter draft?")) return;
    setIsActioning("delete");
    try {
      await apiDeleteNewsletter(id);
      resetComposer();
      await loadList();
      toast.success("Draft deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete draft"
      );
    } finally {
      setIsActioning(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-[#283541] bg-[#101820] text-white shadow-lg shadow-black/10">
        <div className="h-1 bg-[var(--aptiv-orange)]" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ff9a56]">
                Communications studio
              </p>
              <h3 className="mt-1.5 text-xl font-semibold tracking-tight">
                Newsletters that feel considered.
              </h3>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-300">
                Write in Markdown, preview the final email, send yourself a
                proof, then publish with confidence.
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#ff8a3d]">
              <Mail className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
            <Metric
              label="Drafts"
              value={stats.drafts}
            />
            <Metric
              label="Sending"
              value={stats.sending}
            />
            <Metric
              label="Delivered"
              value={stats.delivered}
            />
          </div>
        </div>
      </section>

      <div
        role="tablist"
        aria-label="Newsletter workspace"
        className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1"
      >
        <WorkspaceTab
          active={view === "compose"}
          icon={FileText}
          label="Compose"
          onClick={() => setView("compose")}
        />
        <WorkspaceTab
          active={view === "history"}
          icon={History}
          label="History"
          onClick={() => setView("history")}
        />
      </div>

      {view === "compose" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {editingId ? "Edit draft" : "New newsletter"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {editingId
                  ? "Changes stay private until you send."
                  : "Choose a starting point or begin from scratch."}
              </p>
            </div>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetComposer}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>

          {!editingId && !isDirty && (
            <div className="grid gap-2 sm:grid-cols-3">
              {STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => applyStarter(starter)}
                  className="hover:border-[var(--aptiv-orange)]/50 group rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-[border-color,transform,box-shadow] duration-150 ease-out hover:shadow-md active:scale-[.98]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[var(--aptiv-orange)]" />
                  <span className="mt-2 block text-xs font-semibold">
                    {starter.label}
                  </span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    Pre-filled structure
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="aptiv-glass-soft overflow-hidden rounded-xl shadow-sm">
            <div className="flex border-b border-border bg-muted/30 p-1.5">
              <ComposerTab
                active={composerView === "write"}
                icon={Pencil}
                label="Write"
                onClick={() => setComposerView("write")}
              />
              <ComposerTab
                active={composerView === "preview"}
                icon={Monitor}
                label="Preview"
                disabled={!previewHtml}
                onClick={() => setComposerView("preview")}
              />
            </div>

            {composerView === "write" ? (
              <div className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="newsletter-subject"
                    className="text-xs"
                  >
                    Subject
                  </Label>
                  <Input
                    id="newsletter-subject"
                    value={subject}
                    maxLength={180}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="A clear, useful subject line"
                    className="h-10"
                  />
                  <p className="text-right text-[10px] tabular-nums text-muted-foreground">
                    {subject.length}/180
                  </p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium">Audience</legend>
                  <div className="flex flex-wrap gap-1.5">
                    <AudienceButton
                      label="Everyone"
                      selected={targetTiers === null}
                      onClick={() => setTargetTiers(null)}
                    />
                    {ROLES.map((role) => (
                      <AudienceButton
                        key={role}
                        label={`${role[0]?.toUpperCase()}${role.slice(1)}`}
                        selected={targetTiers?.includes(role) ?? false}
                        onClick={() => toggleTier(role)}
                      />
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-1.5">
                  <div className="flex items-end justify-between gap-2">
                    <Label
                      htmlFor="newsletter-body"
                      className="text-xs"
                    >
                      Message
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Markdown supported
                    </span>
                  </div>
                  <Textarea
                    id="newsletter-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Hello team,\n\nShare your update…"
                    className="min-h-[260px] resize-y font-mono text-[13px] leading-relaxed"
                  />
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    Use <strong>**bold**</strong>, headings with{" "}
                    <strong>##</strong>, and lists with <strong>-</strong>. Raw
                    HTML is escaped for safety.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={saveDraft}
                  disabled={isSaving || !subject.trim() || !body.trim()}
                  className="w-full"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                  {editingId
                    ? "Save changes & preview"
                    : "Save draft & preview"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {recipientCount ?? 0} recipients
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {audienceLabel(targetTiers)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status="draft" />
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-[#eef1f3] shadow-inner">
                  <iframe
                    title="Newsletter email preview"
                    srcDoc={previewHtml}
                    sandbox=""
                    className="h-[480px] w-full bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testSend}
                    disabled={isActioning !== null}
                  >
                    <Mail className="h-4 w-4" />
                    {isActioning === "test" ? "Sending…" : "Send test"}
                  </Button>
                  <Button
                    type="button"
                    onClick={sendNewsletter}
                    disabled={isActioning !== null || !recipientCount}
                  >
                    <Send className="h-4 w-4" />
                    {isActioning === "send" ? "Queuing…" : "Send now"}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setComposerView("write")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Keep editing
                  </Button>
                  {editingId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteDraft(editingId)}
                      disabled={isActioning !== null}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <HistoryView
          newsletters={newsletters}
          selected={selected}
          isLoading={isLoading}
          onSelect={openNewsletter}
          onBack={() => setSelected(null)}
          onEdit={editSelected}
          onDelete={deleteDraft}
          isActioning={isActioning}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function WorkspaceTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Mail;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[.98]",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ComposerTab({
  active,
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  icon: typeof Mail;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function AudienceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-[border-color,background-color,color,transform] duration-150 ease-out active:scale-[.97]",
        selected
          ? "border-[var(--aptiv-orange)]/50 bg-[var(--aptiv-orange)]/10 text-[var(--aptiv-orange)]"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {selected && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "sent"
      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
      : status === "sending"
      ? "bg-sky-500/12 text-sky-600 dark:text-sky-400"
      : "bg-amber-500/12 text-amber-700 dark:text-amber-400";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]",
        styles
      )}
    >
      {status}
    </span>
  );
}

function HistoryView({
  newsletters,
  selected,
  isLoading,
  onSelect,
  onBack,
  onEdit,
  onDelete,
  isActioning,
}: {
  newsletters: NewsletterSummary[];
  selected: NewsletterDetail | null;
  isLoading: boolean;
  onSelect: (item: NewsletterSummary) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  isActioning: string | null;
}) {
  if (selected)
    return (
      <NewsletterDetailView
        newsletter={selected}
        onBack={onBack}
        onEdit={onEdit}
        onDelete={onDelete}
        isActioning={isActioning}
      />
    );
  if (isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (newsletters.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
        <Mail className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">No newsletters yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Saved drafts and sent messages will appear here.
        </p>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Recent newsletters</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Newest first · {newsletters.length} total
          </p>
        </div>
        <Clock3 className="mb-1 h-4 w-4 text-muted-foreground" />
      </div>
      {newsletters.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="hover:border-[var(--aptiv-orange)]/35 group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:shadow-md active:scale-[.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-[var(--aptiv-orange)]">
            <Mail className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-xs font-semibold">
                {item.subject}
              </span>
              <StatusBadge status={item.status} />
            </span>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {formatDate(item.created_at)} · {item.total_recipients} recipients
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  );
}

function NewsletterDetailView({
  newsletter,
  onBack,
  onEdit,
  onDelete,
  isActioning,
}: {
  newsletter: NewsletterDetail;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  isActioning: string | null;
}) {
  const progress = newsletterProgress(newsletter);
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All newsletters
      </button>
      <div className="aptiv-glass-soft rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="aptiv-eyebrow">
              {newsletter.status === "draft"
                ? "Saved draft"
                : "Delivery report"}
            </p>
            <h3 className="mt-2 text-lg font-semibold leading-tight tracking-tight">
              {newsletter.subject}
            </h3>
          </div>
          <StatusBadge status={newsletter.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Audience
            </dt>
            <dd className="mt-1 font-semibold">
              {audienceLabel(newsletter.target_tiers)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Created
            </dt>
            <dd className="mt-1 font-semibold">
              {formatDate(newsletter.created_at)}
            </dd>
          </div>
        </dl>
        {newsletter.status !== "draft" && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="font-semibold">Delivery progress</span>
              <span className="tabular-nums text-muted-foreground">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--aptiv-orange)] transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <DeliveryMetric
                label="Sent"
                value={newsletter.sent}
              />
              <DeliveryMetric
                label="Pending"
                value={newsletter.pending}
              />
              <DeliveryMetric
                label="Failed"
                value={newsletter.failed}
                warning={newsletter.failed > 0}
              />
            </div>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-[#eef1f3] shadow-inner">
        <iframe
          title={`Preview of ${newsletter.subject}`}
          srcDoc={newsletter.body_html}
          sandbox=""
          className="h-[440px] w-full bg-white"
        />
      </div>
      {newsletter.status === "draft" && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            type="button"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
            Edit draft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Delete draft"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(newsletter.id)}
            disabled={isActioning !== null}
          >
            {isActioning === "delete" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
      {newsletter.failed > 0 && (
        <div className="bg-amber-500/8 flex gap-2 rounded-lg border border-amber-500/25 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {newsletter.failed} delivery{" "}
            {newsletter.failed === 1 ? "has" : "have"} failed after retrying.
            Open the backend delivery log for recipient-level errors.
          </p>
        </div>
      )}
    </div>
  );
}

function DeliveryMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-2">
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          warning && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
