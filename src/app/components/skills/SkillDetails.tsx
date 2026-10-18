"use client";

import React, { useId, useState } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  PersonalSkill,
  SkillDiagnostic,
  SkillFile,
  SkillLimits,
  SystemSkill,
} from "@/lib/skills";
import { DEFAULT_SKILL_LIMITS, suggestSkillCopyName } from "@/lib/skill-drafts";
import {
  SkillDiagnostics,
  SkillFileList,
  SkillFilePreview,
} from "./SkillFileList";

export interface SkillDetailsProps {
  skill: PersonalSkill | SystemSkill;
  files: SkillFile[];
  limits?: SkillLimits;
  loading?: boolean;
  busy?: boolean;
  diagnostics?: SkillDiagnostic[];
  onReadFile?: (path: string) => void;
  onCopy: (distinctName: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  occupiedNames?: string[];
  availability?: "available" | "name_conflict" | "unavailable";
}

export function SkillDetails({
  skill,
  files,
  limits = DEFAULT_SKILL_LIMITS,
  loading,
  busy,
  diagnostics = [],
  onReadFile,
  onCopy,
  onEdit,
  onDelete,
  occupiedNames = [],
  availability,
}: SkillDetailsProps) {
  const id = useId();
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  const [mode, setMode] = useState<"source" | "preview">("preview");
  const [copyName, setCopyName] = useState(() =>
    suggestSkillCopyName(skill.name, occupiedNames, limits.name_characters)
  );
  const system = "resources" in skill ? skill : null;
  const resources = system?.resources ?? files;
  const selected = files.find((file) => file.path === selectedPath);
  const copyBlockers = system
    ? [
        ...system.diagnostics,
        ...system.resources.flatMap((resource) => [
          ...resource.diagnostics,
          ...(!resource.copyable && !resource.diagnostics.length
            ? [
                {
                  code: "uncopyable_skill_resource",
                  message: "This resource cannot be copied as personal text.",
                  path: resource.path,
                },
              ]
            : []),
          ...(resource.size_bytes !== null &&
          resource.size_bytes >
            (resource.path === "SKILL.md"
              ? limits.skill_file_bytes
              : limits.supporting_file_bytes)
            ? [
                {
                  code: "skill_file_too_large",
                  message: "This resource exceeds the personal file limit.",
                  path: resource.path,
                },
              ]
            : []),
        ]),
        ...(system.resources.length > limits.files_per_package
          ? [
              {
                code: "too_many_skill_files",
                message:
                  "This package has more files than a personal skill allows.",
                path: null,
              },
            ]
          : []),
        ...(system.resources.reduce(
          (total, resource) => total + (resource.size_bytes ?? 0),
          0
        ) > limits.package_bytes
          ? [
              {
                code: "skill_package_too_large",
                message: "This package exceeds the personal package limit.",
                path: null,
              },
            ]
          : []),
      ]
    : [];
  // External references restrict copying, not access to the deployed skill.
  const referenceWarnings = copyBlockers.filter(
    (diagnostic) => diagnostic.code === "system_skill_resource_escape"
  );
  const detailDiagnostics = [
    ...diagnostics,
    ...copyBlockers.filter(
      (diagnostic) => diagnostic.code !== "system_skill_resource_escape"
    ),
  ];
  const validName =
    copyName !== skill.name &&
    !occupiedNames.includes(copyName) &&
    copyName.length <= limits.name_characters &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(copyName);
  return (
    <section
      aria-label="Skill details"
      className="min-w-0 space-y-4 @container"
      aria-busy={loading || busy}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {system
              ? "System · read only"
              : `Personal · revision ${skill.revision}`}
          </p>
          <h3 className="break-all text-lg font-semibold">{skill.name}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {skill.description}
          </p>
        </div>
        {!system && (
          <div className="flex flex-wrap gap-2">
            {onEdit && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onEdit}
              >
                <Pencil aria-hidden="true" />
                {availability === "name_conflict" ? "Rename" : "Edit"}
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
      {!system && availability === "name_conflict" && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/50 p-3 text-sm"
        >
          A deployed system skill now reserves this name. Discovery is paused
          until you rename this personal skill. You can still read and edit the
          complete package. Choose Rename and change the name in SKILL.md, then
          Save.
        </p>
      )}
      <SkillDiagnostics diagnostics={detailDiagnostics} />
      <div className="grid min-w-0 gap-4 @[36rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <SkillFileList
          files={resources}
          selectedPath={selectedPath}
          disabled={busy}
          onSelect={(path) => {
            setSelectedPath(path);
            if (!files.some((file) => file.path === path)) onReadFile?.(path);
          }}
        />
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-all font-mono text-xs">{selectedPath}</span>
            <div
              className="flex gap-1 rounded-lg border bg-muted/30 p-0.5"
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
          {selected ? (
            <SkillFilePreview
              file={selected}
              mode={mode}
            />
          ) : (
            <p
              role="status"
              className="rounded-lg border p-4 text-sm text-muted-foreground"
            >
              {loading
                ? "Loading file…"
                : resources.find(
                    (resource) =>
                      resource.path === selectedPath &&
                      "copyable" in resource &&
                      !resource.copyable
                  )
                ? "This resource is unavailable as text. See its diagnostics above."
                : "Select a file to read its contents."}
            </p>
          )}
        </div>
      </div>
      {system && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (validName && !copyBlockers.length && !busy && !loading)
              onCopy(copyName);
          }}
          className="space-y-2 rounded-lg border bg-muted/20 p-3"
        >
          <label
            htmlFor={`${id}-copy-name`}
            className="text-sm font-medium"
          >
            Copy to personal library
          </label>
          <p
            id={`${id}-copy-help`}
            className="text-xs text-muted-foreground"
          >
            Choose a distinct name. Copying changes only the name in SKILL.md;
            other metadata and resources keep their source. Review before
            saving.
          </p>
          {referenceWarnings.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                This skill links to files outside its package. Those files would
                be missing from a personal copy. This restriction only applies
                to copying.
              </p>
              <SkillDiagnostics
                diagnostics={referenceWarnings}
                title="Cannot copy this skill as-is"
                tone="neutral"
              />
            </>
          )}
          <div className="flex flex-col gap-2 @[28rem]:flex-row">
            <Input
              id={`${id}-copy-name`}
              aria-describedby={`${id}-copy-help`}
              value={copyName}
              disabled={busy}
              placeholder={`${skill.name.slice(0, 59)}-copy`}
              onChange={(event) => setCopyName(event.target.value)}
            />
            <Button
              type="submit"
              disabled={
                !validName || copyBlockers.length > 0 || busy || loading
              }
            >
              <Copy aria-hidden="true" />
              Copy as draft
            </Button>
          </div>
          {copyName && !validName && (
            <p
              role="status"
              className="text-xs text-destructive"
            >
              Use a different name with up to {limits.name_characters} lowercase
              letters, digits, and single internal hyphens.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
