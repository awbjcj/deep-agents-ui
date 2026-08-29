"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  parseScopeManifest,
  type ScopeManifestEntry,
} from "@/lib/scope-manifest";

export interface ScopeImportResult {
  applied: number;
  failed: number;
}

export function ScopeImportCard({
  onApply,
}: {
  onApply: (entries: ScopeManifestEntry[]) => Promise<ScopeImportResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<ScopeManifestEntry[]>([]);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

  const reset = () => {
    setFileName("");
    setEntries([]);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    if (file.size > 1_000_000) {
      setEntries([]);
      setError("Config file must be smaller than 1 MB");
      return;
    }
    try {
      setEntries(parseScopeManifest(await file.text()));
    } catch (caught) {
      setEntries([]);
      setError(
        caught instanceof Error ? caught.message : "Invalid config file"
      );
    }
  };

  const handleApply = async () => {
    if (entries.length === 0) return;
    setApplying(true);
    try {
      const result = await onApply(entries);
      if (result.failed === 0) reset();
    } finally {
      setApplying(false);
    }
  };

  const memberCount = entries.reduce(
    (sum, entry) => sum + entry.members.length,
    0
  );

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".yaml,.yml,.json,application/json,application/yaml,text/yaml"
        className="sr-only"
        onChange={(event) => void handleFile(event)}
        aria-label="Knowledge scope config file"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={applying}
      >
        <FileUp className="mr-2 h-4 w-4" />
        Import YAML or JSON config
      </Button>

      {(fileName || error) && (
        <div
          className="rounded-lg border border-border bg-card/60 p-3"
          role={error ? "alert" : "status"}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{fileName}</p>
              {error ? (
                <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                  {error}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {entries.length} scope{entries.length === 1 ? "" : "s"}
                  {memberCount > 0
                    ? ` and ${memberCount} explicit member grant${
                        memberCount === 1 ? "" : "s"
                      }`
                    : ""}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-none"
              onClick={reset}
              disabled={applying}
              aria-label="Clear scope config file"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!error && entries.length > 0 && (
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full"
              onClick={() => void handleApply()}
              disabled={applying}
            >
              {applying ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-3.5 w-3.5" />
              )}
              {applying ? "Applying config" : "Apply config"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
