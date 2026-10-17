"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { usePersonalSkills } from "@/app/hooks/usePersonalSkills";
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
  useEffect(() => {
    onDirtyChange(skills.dirty);
    return () => onDirtyChange(false);
  }, [skills.dirty, onDirtyChange]);
  const key = `${accountId}:${skills.selected?.origin ?? "new"}:${
    skills.selected?.id ?? "draft"
  }:${skills.selectionKey}`;
  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onCreateWithAgent}
          >
            Create with vsda-deep-agent
          </Button>
          <Button
            variant="ghost"
            disabled={skills.loading || skills.busy}
            onClick={() => void skills.refresh()}
          >
            Refresh catalog
          </Button>
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
            className="text-sm text-success"
          >
            {skills.success}
          </p>
        )}
        <SkillCatalog
          entries={skills.catalog?.entries ?? []}
          loading={skills.loading}
          selectedKey={
            skills.selected
              ? `${skills.selected.origin}:${skills.selected.id}`
              : null
          }
          onSelect={(entry) => void skills.select(entry)}
          onCreate={skills.create}
          onImport={skills.openImport}
        />
        {skills.nameConflict && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/50 p-3 text-sm"
          >
            This name is already in use. Your draft is still here. Change the
            name in SKILL.md, or import a package and explicitly choose an owned
            replacement target.
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
                latest version before deciding whether to discard your changes.
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
                  entry.id === skills.detail?.id && entry.origin === "personal"
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
        ) : null}
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
        onImport={skills.importDraft}
        targets={skills.catalog?.entries ?? []}
        targetId={skills.importTargetId}
        target={skills.importTarget}
        targetLoading={skills.importTargetLoading}
        onTarget={(id) => void skills.selectImportTarget(id)}
      />
    </div>
  );
}
