"use client";

import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SkillDiagnostic,
  SkillImportPreview,
  SkillLimits,
  SkillCatalogEntry,
  PersonalSkill,
} from "@/lib/skills";
import {
  SkillDiagnostics,
  SkillFileList,
  SkillFilePreview,
} from "./SkillFileList";

export interface SkillImportDialogProps {
  open: boolean;
  preview: SkillImportPreview | null;
  diagnostics: SkillDiagnostic[];
  loading: boolean;
  limits: SkillLimits;
  onOpenChange: (open: boolean) => void;
  onFile: (file: File) => void;
  onImport: (preview: SkillImportPreview) => void;
  targets: SkillCatalogEntry[];
  targetId: string | null;
  target: PersonalSkill | null;
  targetLoading: boolean;
  onTarget: (id: string | null) => void;
}

export function SkillImportDialog({
  open,
  preview,
  diagnostics,
  loading,
  limits,
  onOpenChange,
  onFile,
  onImport,
  targets,
  targetId,
  target,
  targetLoading,
  onTarget,
}: SkillImportDialogProps) {
  const id = useId();
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  const [localDiagnostics, setLocalDiagnostics] = useState<SkillDiagnostic[]>(
    []
  );
  const [invalidatedPreview, setInvalidatedPreview] =
    useState<SkillImportPreview | null>(null);
  const selected =
    preview?.package.files.find((file) => file.path === selectedPath) ??
    preview?.package.files[0];
  const previewDiagnostics = (preview?.diagnostics ?? []).flatMap(
    (diagnostic) => {
      if (diagnostic.code !== "skill_name_conflict") return [diagnostic];
      if (
        target &&
        preview &&
        target.name === preview.package.name &&
        !targets.some(
          (entry) => entry.origin === "system" && entry.name === target.name
        )
      )
        return [];
      return [
        {
          ...diagnostic,
          message:
            "This name is already in use. Choose a distinct name or explicitly select its owned replacement target. System names stay reserved.",
        },
      ];
    }
  );
  // Never import a previous preview after another upload was chosen or rejected.
  const canImport =
    !!preview &&
    !loading &&
    !targetLoading &&
    (targetId === null || target?.id === targetId) &&
    !localDiagnostics.length &&
    preview !== invalidatedPreview;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-3xl"
        aria-busy={loading}
      >
        <DialogHeader>
          <DialogTitle>Import skill package</DialogTitle>
          <DialogDescription>
            Choose SKILL.md or a ZIP of text resources. Preview the complete
            package before opening an unsaved draft.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor={`${id}-destination`}
              className="text-sm font-medium"
            >
              Import destination
            </label>
            <select
              id={`${id}-destination`}
              className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              value={targetId ?? ""}
              onChange={(event) => onTarget(event.target.value || null)}
            >
              <option value="">New personal skill</option>
              {targets
                .filter((entry) => entry.origin === "personal")
                .map((entry) => (
                  <option
                    key={entry.id}
                    value={entry.id}
                  >
                    Replace {entry.id === target?.id ? target.name : entry.name}{" "}
                    · revision{" "}
                    {entry.id === target?.id ? target.revision : entry.revision}
                  </option>
                ))}
            </select>
            {targetLoading ? (
              <p
                role="status"
                className="text-sm text-muted-foreground"
              >
                Loading current replacement package…
              </p>
            ) : target ? (
              <p className="break-words text-sm text-muted-foreground">
                Replace {target.name} · revision {target.revision}. All saved
                files will be replaced by the imported package only when you
                Save the draft.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose an owned package explicitly to replace it. Matching names
                never select a replacement automatically.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor={`${id}-upload`}
              className="text-sm font-medium"
            >
              Skill file or ZIP
            </label>
            <Input
              id={`${id}-upload`}
              type="file"
              accept=".md,.zip,text/markdown,application/zip"
              disabled={loading}
              aria-describedby={`${id}-upload-help`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setSelectedPath("SKILL.md");
                setInvalidatedPreview(preview);
                if (file.size > limits.upload_bytes) {
                  setLocalDiagnostics([
                    {
                      code: "skill_upload_too_large",
                      message: `Choose a file of at most ${limits.upload_bytes.toLocaleString()} bytes.`,
                      path: file.name,
                    },
                  ]);
                } else {
                  setLocalDiagnostics([]);
                  onFile(file);
                }
                event.target.value = "";
              }}
            />
            <p
              id={`${id}-upload-help`}
              className="text-xs text-muted-foreground"
            >
              Up to {limits.upload_bytes.toLocaleString()} bytes. Binary
              resources cannot be imported.
            </p>
          </div>
          <SkillDiagnostics
            diagnostics={[
              ...diagnostics,
              ...localDiagnostics,
              ...previewDiagnostics,
            ]}
          />
          {loading && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              Validating package…
            </p>
          )}
          {preview && !loading && preview !== invalidatedPreview && (
            <>
              <div>
                <h4 className="break-all text-sm font-semibold">
                  {preview.package.name}
                </h4>
                <p className="break-words text-sm text-muted-foreground">
                  {preview.package.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preview.package.files.length} files ·{" "}
                  {preview.package.total_bytes.toLocaleString()} UTF-8 bytes
                </p>
              </div>
              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                <SkillFileList
                  files={preview.package.files}
                  selectedPath={selected?.path ?? null}
                  onSelect={setSelectedPath}
                />
                {selected && (
                  <SkillFilePreview
                    file={selected}
                    mode="preview"
                  />
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canImport}
            onClick={() => {
              if (canImport && preview) onImport(preview);
            }}
          >
            Open draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
