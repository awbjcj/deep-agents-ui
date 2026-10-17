"use client";

import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  SkillsApiError,
  type SkillDiagnostic,
  type SkillLimits,
} from "@/lib/skills";
import {
  addSkillDraftFile,
  isSkillDraftDirty,
  removeSkillDraftFile,
  skillTextBytes,
  validateSkillDraft,
  type SkillDraft,
} from "@/lib/skill-drafts";
import {
  SkillDiagnostics,
  SkillFileList,
  SkillFilePreview,
} from "./SkillFileList";

export interface SkillEditorProps {
  draft: SkillDraft;
  limits: SkillLimits;
  diagnostics: SkillDiagnostic[];
  saving: boolean;
  onChange: (draft: SkillDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function SkillEditor({
  draft,
  limits,
  diagnostics,
  saving,
  onChange,
  onSave,
  onDiscard,
}: SkillEditorProps) {
  const id = useId();
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [newPath, setNewPath] = useState("");
  const [fileDiagnostics, setFileDiagnostics] = useState<SkillDiagnostic[]>([]);
  const selected =
    draft.files.find((file) => file.path === selectedPath) ?? draft.files[0];
  const localDiagnostics = validateSkillDraft(draft, limits);
  const dirty = isSkillDraftDirty(draft);
  const total = draft.files.reduce(
    (sum, file) => sum + skillTextBytes(file.content),
    0
  );
  function addFile() {
    try {
      const next = addSkillDraftFile(
        draft,
        { path: newPath, content: "" },
        limits
      );
      onChange(next);
      setSelectedPath(newPath);
      setNewPath("");
      setFileDiagnostics([]);
      setMode("source");
    } catch (error) {
      setFileDiagnostics(
        error instanceof SkillsApiError
          ? error.diagnostics
          : [
              {
                code: "file_error",
                message: "Could not add this file.",
                path: newPath,
              },
            ]
      );
    }
  }
  return (
    <section
      aria-label="Skill editor"
      className="min-w-0 space-y-4"
      aria-busy={saving}
    >
      <div>
        <h3 className="text-base font-semibold">
          {draft.sourceId ? "Edit personal skill" : "New personal skill"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the name, description, and instructions in SKILL.md. Supporting
          resources stay in this package.
        </p>
      </div>
      <SkillDiagnostics
        diagnostics={[...diagnostics, ...fileDiagnostics, ...localDiagnostics]}
      />
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <SkillFileList
            files={draft.files}
            selectedPath={selected?.path ?? null}
            disabled={saving}
            onSelect={(path) => {
              setSelectedPath(path);
              setFileDiagnostics([]);
            }}
            onRemove={(path) => {
              onChange(removeSkillDraftFile(draft, path));
              setFileDiagnostics([]);
            }}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addFile();
            }}
            className="space-y-2"
          >
            <label
              htmlFor={`${id}-path`}
              className="text-xs font-medium"
            >
              New resource path
            </label>
            <Input
              id={`${id}-path`}
              value={newPath}
              disabled={saving}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="references/notes.md"
            />
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={saving || !newPath}
            >
              Add file
            </Button>
          </form>
        </div>
        <div className="min-w-0 space-y-2">
          {selected && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`${id}-content`}
                  className="break-all font-mono text-xs font-medium"
                >
                  {selected.path}
                </label>
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="File view"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "source" ? "secondary" : "ghost"}
                    aria-pressed={mode === "source"}
                    onClick={() => setMode("source")}
                  >
                    Source
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "preview" ? "secondary" : "ghost"}
                    aria-pressed={mode === "preview"}
                    onClick={() => setMode("preview")}
                  >
                    Preview
                  </Button>
                </div>
              </div>
              {mode === "source" ? (
                <Textarea
                  id={`${id}-content`}
                  spellCheck={false}
                  disabled={saving}
                  className="min-h-80 resize-y font-mono text-xs leading-6"
                  value={selected.content}
                  onChange={(event) => {
                    setFileDiagnostics([]);
                    onChange({
                      ...draft,
                      files: draft.files.map((file) =>
                        file.path === selected.path
                          ? { ...file, content: event.target.value }
                          : file
                      ),
                    });
                  }}
                />
              ) : (
                <SkillFilePreview
                  file={selected}
                  mode="preview"
                />
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {total.toLocaleString()} / {limits.package_bytes.toLocaleString()}{" "}
            UTF-8 bytes · {draft.files.length} / {limits.files_per_package}{" "}
            files
          </p>
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
        <p
          role="status"
          className="text-xs text-muted-foreground"
        >
          {saving
            ? "Saving package…"
            : dirty
            ? "Unsaved changes"
            : "All changes saved"}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty || localDiagnostics.length > 0}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}
