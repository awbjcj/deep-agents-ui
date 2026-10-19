"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Check, RefreshCw, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { usePersonalSkills } from "@/app/hooks/usePersonalSkills";
import { cn } from "@/lib/utils";
import { SkillCatalog } from "./skills/SkillCatalog";
import { SkillDetails } from "./skills/SkillDetails";
import { SkillEditor } from "./skills/SkillEditor";
import { SkillImportDialog } from "./skills/SkillImportDialog";
import { SkillDiagnostics, SkillFilePreview } from "./skills/SkillFileList";

export interface SkillsSidebarProps {
  onCreateWithAgent: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Remount before rendering another account, so private state never flashes. */
export function SkillsSidebar(props: SkillsSidebarProps) {
  const { user } = useAuth();
  return user ? (
    <AccountSkills
      key={user.user_id}
      accountId={user.user_id}
      {...props}
    />
  ) : null;
}

function AccountSkills({
  accountId,
  onCreateWithAgent,
  onDirtyChange,
}: SkillsSidebarProps & { accountId: string }) {
  const skills = usePersonalSkills(accountId);
  const scrollArea = useRef<HTMLDivElement>(null);
  const catalogArea = useRef<HTMLDivElement>(null);
  const taskArea = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const importTrigger = useRef<HTMLElement | null>(null);
  const importApplied = useRef(false);
  const openImport = () => {
    importTrigger.current = document.activeElement as HTMLElement;
    importApplied.current = false;
    skills.openImport();
  };
  const mode = skills.draft
    ? "editor"
    : skills.selected
    ? "details"
    : "catalog";
  const previousMode = useRef(mode);
  useEffect(() => {
    if (mode === previousMode.current) return;
    if (mode === "catalog") {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      else
        catalogArea.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else {
      if (scrollArea.current) scrollArea.current.scrollTop = 0;
      taskArea.current?.focus({ preventScroll: true });
    }
    previousMode.current = mode;
  }, [mode]);
  useEffect(() => {
    onDirtyChange(skills.dirty);
    return () => onDirtyChange(false);
  }, [skills.dirty, onDirtyChange]);
  const key = `${accountId}:${skills.selected?.origin ?? "new"}:${
    skills.selected?.id ?? "draft"
  }:${skills.selectionKey}`;
  return (
    <div
      ref={scrollArea}
      className="absolute inset-0 scroll-pb-28 overflow-y-auto overscroll-contain p-4 @container"
    >
      <div className="flex min-h-full min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          {mode !== "catalog" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={skills.busy}
              onClick={skills.discard}
            >
              <ArrowLeft aria-hidden="true" /> Back to skills
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateWithAgent}
              aria-label="Create with vsda-deep-agent"
            >
              <Sparkles aria-hidden="true" /> Create with agent
            </Button>
          )}
          <div className="flex items-center gap-1">
            {mode !== "catalog" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={skills.busy}
                onClick={openImport}
              >
                <Upload aria-hidden="true" /> Import
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Refresh catalog"
              title="Refresh catalog"
              disabled={skills.loading || skills.busy}
              onClick={() => void skills.refresh()}
            >
              <RefreshCw
                aria-hidden="true"
                className="size-4"
              />
            </Button>
          </div>
        </div>
        {skills.error && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"
          >
            <p>{skills.error}</p>
            <SkillDiagnostics diagnostics={skills.diagnostics} />
          </div>
        )}
        {skills.catalogError && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"
          >
            <p>{skills.catalogError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void skills.refresh()}
            >
              Retry catalog
            </Button>
          </div>
        )}
        {skills.success && (
          <p
            role="status"
            className="border-success/30 bg-success/5 flex items-center gap-2 rounded-lg border p-3 text-sm text-success"
          >
            <Check
              aria-hidden="true"
              className="size-4 shrink-0"
            />
            {skills.success}
          </p>
        )}
        <div
          ref={catalogArea}
          hidden={mode !== "catalog"}
        >
          <SkillCatalog
            entries={skills.catalog?.entries ?? []}
            loading={skills.loading}
            unavailable={!skills.catalog && !!skills.catalogError}
            selectedKey={
              skills.selected
                ? `${skills.selected.origin}:${skills.selected.id}`
                : null
            }
            onSelect={(entry) => {
              returnFocus.current = document.activeElement as HTMLElement;
              void skills.select(entry);
            }}
            onCreate={skills.create}
            onImport={openImport}
          />
        </div>
        <div
          ref={taskArea}
          role="group"
          tabIndex={-1}
          className={cn(
            "min-w-0 outline-none",
            mode === "details" ? "flex flex-1 flex-col gap-4" : "space-y-4"
          )}
          hidden={mode === "catalog"}
          aria-label={
            mode === "editor" ? "Edit skill package" : "Selected skill package"
          }
        >
          {skills.nameConflict && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/50 p-3 text-sm"
            >
              This name is already in use. Your draft is still here. Change the
              name in SKILL.md, or import a package and explicitly choose an
              owned replacement target.
            </p>
          )}
          {skills.conflict &&
            (skills.draft?.sourceId ||
              (skills.detail && !("resources" in skills.detail))) && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
              >
                <p>
                  The saved package changed. Your draft is still here. View the
                  latest version before deciding whether to discard your
                  changes.
                </p>
                <Button
                  variant="outline"
                  disabled={skills.busy}
                  onClick={() => void skills.viewLatest()}
                >
                  View latest version
                </Button>
              </div>
            )}
          {skills.latest && (
            <section
              aria-label="Latest saved skill"
              className="min-w-0 space-y-3 rounded-lg border p-3"
            >
              <h3 className="font-semibold">
                Latest saved version · revision {skills.latest.revision}
              </h3>
              {skills.latest.files.map((file) => (
                <SkillFilePreview
                  key={file.path}
                  file={file}
                  mode="source"
                />
              ))}
              <Button
                variant="outline"
                onClick={skills.reloadLatest}
              >
                Reload latest and discard draft
              </Button>
            </section>
          )}
          {skills.draft ? (
            <SkillEditor
              key={`${key}:editor`}
              draft={skills.draft}
              limits={skills.limits}
              diagnostics={skills.diagnostics}
              saving={skills.busy}
              onChange={skills.changeDraft}
              onSave={() => void skills.save()}
              onDiscard={skills.discard}
            />
          ) : skills.detail ? (
            <SkillDetails
              key={`${key}:details`}
              skill={skills.detail}
              files={skills.files}
              limits={skills.limits}
              occupiedNames={
                skills.catalog?.entries.map((entry) => entry.name) ?? []
              }
              availability={
                skills.catalog?.entries.find(
                  (entry) =>
                    entry.id === skills.detail?.id &&
                    entry.origin === "personal"
                )?.availability
              }
              loading={skills.detailLoading}
              busy={skills.busy}
              diagnostics={skills.diagnostics}
              onReadFile={(path) => void skills.readFile(path)}
              onCopy={(name) => void skills.copy(name)}
              onEdit={skills.edit}
              onDelete={() => void skills.remove()}
            />
          ) : skills.detailLoading ? (
            <p role="status">Loading skill package…</p>
          ) : skills.selected && skills.error ? (
            <Button
              variant="outline"
              onClick={() =>
                skills.selected && void skills.select(skills.selected)
              }
            >
              Retry skill
            </Button>
          ) : null}
        </div>
      </div>
      <SkillImportDialog
        key={`${accountId}:${skills.importSession}`}
        open={skills.importOpen}
        preview={skills.preview}
        diagnostics={[
          ...skills.importDiagnostics,
          ...(skills.importError
            ? [
                {
                  code: "import_error",
                  message: skills.importError,
                  path: null,
                },
              ]
            : []),
        ]}
        loading={skills.importLoading}
        limits={skills.limits}
        onOpenChange={skills.closeImport}
        onFile={(file) => void skills.previewImport(file)}
        onImport={(preview) => {
          importApplied.current = skills.importDraft(preview);
        }}
        onReturnFocus={() => {
          if (importApplied.current)
            taskArea.current?.focus({ preventScroll: true });
          else importTrigger.current?.focus();
        }}
        targets={skills.catalog?.entries ?? []}
        targetId={skills.importTargetId}
        target={skills.importTarget}
        targetLoading={skills.importTargetLoading}
        onTarget={(id) => void skills.selectImportTarget(id)}
      />
    </div>
  );
}
