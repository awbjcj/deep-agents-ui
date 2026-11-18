"use client";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
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
import { PanelTabs, type PanelTabDef } from "@/components/ui/panel-tabs";
import { panelTabPanelProps } from "@/components/ui/panel-tabs-utils";
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

const WORKSPACE_TABS: readonly PanelTabDef<WorkspaceView>[] = [
  { id: "compose", label: "Compose", icon: FileText },
  { id: "history", label: "History", icon: History },
];

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
  const [savedComposer, setSavedComposer] = useState({
    subject: "",
    body: "",
    targetTiers: null as Role[] | null,
  });
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
    const controller = new AbortController();
    const { signal } = controller;
    const interval = window.setInterval(() => {
      void Promise.all([
        apiGetNewsletter(selected.id, { signal }),
        apiListNewsletters(signal),
      ])
        .then(([detail, list]) => {
          // Selection changed or the section unmounted while polling.
          if (signal.aborted) return;
          setSelected(detail);
          setNewsletters(list);
        })
        .catch(() => undefined);
    }, 3500);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
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
  const unsaved =
    subject !== savedComposer.subject ||
    body !== savedComposer.body ||
    JSON.stringify(targetTiers) !== JSON.stringify(savedComposer.targetTiers);
  useSettingsDraft(unsaved || isSaving || isActioning !== null);

  const resetComposer = () => {
    if (unsaved && !window.confirm("Discard unsaved newsletter changes?"))
      return;
    setSavedComposer({ subject: "", body: "", targetTiers: null });
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
      setSavedComposer({ subject: cleanSubject, body: cleanBody, targetTiers });
      setSubject((current) => (current === subject ? cleanSubject : current));
      setBody((current) => (current === body ? cleanBody : current));
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
    if (unsaved && !window.confirm("Discard unsaved newsletter changes?"))
      return;
    setSavedComposer({
      subject: selected.subject,
      body: selected.body_markdown,
      targetTiers: selected.target_tiers,
    });
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
      <section
        className="settings-surface grid grid-cols-3 gap-2 p-3"
        aria-label="Newsletter status summary"
      >
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
      </section>

      <PanelTabs
        tabs={WORKSPACE_TABS}
        value={view}
        onValueChange={setView}
        idPrefix="newsletter"
        label="Newsletter workspace"
        variant="segmented"
      />

      {view === "compose" ? (
        <div
          {...panelTabPanelProps("newsletter", "compose")}
          className="space-y-4 focus-visible:outline-none"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {editingId ? "Edit draft" : "New newsletter"}
              </h3>
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
                  className="group border-border bg-card rounded-lg border p-3 text-left shadow-sm transition-[border-color,transform,box-shadow] duration-150 ease-out hover:border-(--aptiv-orange)/50 hover:shadow-md active:scale-[.98]"
                >
                  <Sparkles className="h-3.5 w-3.5 text-(--aptiv-orange)" />
                  <span className="mt-2 block text-xs font-semibold">
                    {starter.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="settings-surface overflow-hidden">
            <PanelTabs
              tabs={[
                { id: "write" as const, label: "Write", icon: Pencil },
                {
                  id: "preview" as const,
                  label: "Preview",
                  icon: Monitor,
                  disabled: !previewHtml,
                  disabledReason:
                    "Add subject and body content to generate a preview.",
                },
              ]}
              value={composerView}
              onValueChange={setComposerView}
              idPrefix="newsletter-composer"
              label="Composer view"
              variant="segmented"
              className="border-border bg-muted/30 rounded-none border-0 border-b p-1.5"
            />

            {composerView === "write" ? (
              <div
                {...panelTabPanelProps("newsletter-composer", "write")}
                className="grid gap-4 p-4 focus-visible:outline-none @5xl/panel:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
              >
                <div className="space-y-4">
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
                    <p className="text-muted-foreground text-right text-xs tabular-nums">
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
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-end justify-between gap-2">
                    <Label
                      htmlFor="newsletter-body"
                      className="text-xs"
                    >
                      Message
                    </Label>
                    <span className="text-muted-foreground text-xs">
                      Markdown supported
                    </span>
                  </div>
                  <Textarea
                    id="newsletter-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={"Hello team,\n\nShare your update…"}
                    className="min-h-[260px] resize-y font-mono text-xs leading-relaxed"
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Use <strong>**bold**</strong>, headings with{" "}
                    <strong>##</strong>, and lists with <strong>-</strong>. Raw
                    HTML is escaped for safety.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={saveDraft}
                  disabled={isSaving || !subject.trim() || !body.trim()}
                  className="w-full @5xl/panel:col-span-full"
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
              <div
                {...panelTabPanelProps("newsletter-composer", "preview")}
                className="space-y-3 p-3 focus-visible:outline-none"
              >
                <div className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {recipientCount ?? 0} recipients
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {audienceLabel(targetTiers)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status="draft" />
                </div>
                <div className="border-border overflow-hidden rounded-lg border bg-[#eef1f3] shadow-inner">
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
        <div
          {...panelTabPanelProps("newsletter", "history")}
          className="focus-visible:outline-none"
        >
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
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs font-bold tracking-[0.16em] uppercase">
        {label}
      </p>
    </div>
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
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-[border-color,background-color,color,transform] duration-150 ease-out active:scale-[.97]",
        selected
          ? "border-primary/50 bg-primary/10 text-primary"
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
        "rounded-full px-2 py-0.5 text-xs font-bold tracking-[0.12em] uppercase",
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
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  if (newsletters.length === 0)
    return (
      <div className="border-border bg-muted/20 rounded-xl border border-dashed px-5 py-10 text-center">
        <Mail className="text-muted-foreground mx-auto h-6 w-6" />
        <p className="mt-3 text-sm font-semibold">No newsletters yet</p>
      </div>
    );
  return (
    <div className="grid grid-cols-1 items-start gap-2 @5xl/panel:grid-cols-2">
      <div className="col-span-full flex items-end justify-between gap-3">
        <p className="text-muted-foreground text-xs tabular-nums">
          {newsletters.length}{" "}
          {newsletters.length === 1 ? "newsletter" : "newsletters"}
        </p>
      </div>
      {newsletters.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="group border-border bg-card flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-(--aptiv-orange)/35 hover:shadow-md active:scale-[.99]"
        >
          <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg group-hover:text-(--aptiv-orange)">
            <Mail className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-xs font-semibold">
                {item.subject}
              </span>
              <StatusBadge status={item.status} />
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">
              {formatDate(item.created_at)} · {item.total_recipients} recipients
            </span>
          </span>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
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
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All newsletters
      </button>
      <div className="settings-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg leading-tight font-semibold tracking-tight wrap-break-word">
              {newsletter.subject}
            </h3>
          </div>
          <StatusBadge status={newsletter.status} />
        </div>
        <dl className="border-border mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs">
          <div>
            <dt className="text-muted-foreground text-xs tracking-wider uppercase">
              Audience
            </dt>
            <dd className="mt-1 font-semibold">
              {audienceLabel(newsletter.target_tiers)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs tracking-wider uppercase">
              Created
            </dt>
            <dd className="mt-1 font-semibold">
              {formatDate(newsletter.created_at)}
            </dd>
          </div>
        </dl>
        {newsletter.status !== "draft" && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">Delivery progress</span>
              <span className="text-muted-foreground tabular-nums">
                {progress}%
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-(--aptiv-orange) transition-[width] duration-200 ease-out"
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
      <div className="border-border overflow-hidden rounded-lg border bg-[#eef1f3] shadow-inner">
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
        <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-amber-800 dark:text-amber-300">
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
    <div className="bg-muted/50 rounded-md px-2 py-2">
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          warning && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground text-xs tracking-wider uppercase">
        {label}
      </p>
    </div>
  );
}
