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
  onReturnFocus?: () => void;
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
  onReturnFocus,
}: SkillImportDialogProps) {
  const id = useId();
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  const [filename, setFilename] = useState("");
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
        className="flex max-h-[90dvh] min-w-0 flex-col overflow-hidden sm:max-w-3xl"
        aria-busy={loading}
        onCloseAutoFocus={(event) => {
          if (onReturnFocus) {
            event.preventDefault();
            onReturnFocus();
          }
        }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>Import skill package</DialogTitle>
          <DialogDescription>
            Preview a SKILL.md file or a ZIP of text resources before importing.
          </DialogDescription>
        </DialogHeader>
        <div className="@container min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain p-1">
          <div className="bg-muted/20 space-y-2 rounded-lg border p-3">
            <label
              htmlFor={`${id}-destination`}
              className="text-sm font-medium"
            >
              Import destination
            </label>
            <select
              id={`${id}-destination`}
              className="bg-background focus-visible:ring-ring h-10 w-full min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
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
                className="text-muted-foreground text-sm"
              >
                Loading current replacement package…
              </p>
            ) : target ? (
              <p className="text-muted-foreground text-sm wrap-break-word">
                Saving the draft replaces all files in this package.
              </p>
            ) : null}
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
                setFilename(file.name);
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
            {filename && (
              <p className="text-xs font-medium break-all">
                Selected: {filename}
              </p>
            )}
            <p
              id={`${id}-upload-help`}
              className="text-muted-foreground text-xs"
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
              className="text-muted-foreground text-sm"
            >
              Validating package…
            </p>
          )}
          {preview && !loading && preview !== invalidatedPreview && (
            <>
              <div>
                <h4 className="text-sm font-semibold break-all">
                  {preview.package.name}
                </h4>
                <p className="text-muted-foreground text-sm wrap-break-word">
                  {preview.package.description}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {preview.package.files.length} files ·{" "}
                  {preview.package.total_bytes.toLocaleString()} UTF-8 bytes
                </p>
              </div>
              <div className="grid min-w-0 gap-3 @xl:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
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
        <DialogFooter className="shrink-0 border-t pt-4">
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
