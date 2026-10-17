"use client";

import React, { useId, useState } from "react";
import { Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SkillCatalogEntry } from "@/lib/skills";
import { cn } from "@/lib/utils";

export interface SkillCatalogProps {
  entries: SkillCatalogEntry[];
  loading?: boolean;
  selectedKey?: string | null;
  onSelect: (entry: SkillCatalogEntry) => void;
  onCreate: () => void;
  onImport: () => void;
}

export function SkillCatalog({
  entries,
  loading,
  selectedKey,
  onSelect,
  onCreate,
  onImport,
}: SkillCatalogProps) {
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("all");
  const id = useId();
  const matches = entries.filter(
    (entry) =>
      (origin === "all" || entry.origin === origin) &&
      `${entry.name} ${entry.description}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  );
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Skill catalog"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Your skills</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse system instructions and build your personal library.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onImport}
          >
            <Upload aria-hidden="true" />
            Import
          </Button>
          <Button
            type="button"
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
            New skill
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label
            htmlFor={`${id}-search`}
            className="sr-only"
          >
            Search skills
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          />
          <Input
            id={`${id}-search`}
            type="search"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search names and descriptions"
          />
        </div>
        <div>
          <label
            htmlFor={`${id}-origin`}
            className="sr-only"
          >
            Filter skill origin
          </label>
          <select
            id={`${id}-origin`}
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <option value="all">All origins</option>
            <option value="personal">Personal</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>
      {loading ? (
        <p
          role="status"
          className="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          Loading skills…
        </p>
      ) : matches.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {matches.map((entry) => (
            <li key={`${entry.origin}:${entry.id}`}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                aria-pressed={selectedKey === `${entry.origin}:${entry.id}`}
                className={cn(
                  "block w-full min-w-0 space-y-2 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                  selectedKey === `${entry.origin}:${entry.id}` && "bg-accent"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all text-sm font-medium">
                    {entry.name}
                  </span>
                  <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                    {entry.origin === "system"
                      ? "System · read only"
                      : "Personal"}
                  </span>
                  {entry.availability !== "available" && (
                    <span className="text-xs text-destructive">
                      {entry.availability === "name_conflict"
                        ? "Name conflict"
                        : "Unavailable"}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                  {entry.description}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div
          role="status"
          className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
        >
          {entries.length
            ? "No skills match your search and filter."
            : "No skills yet. Create a skill or import a SKILL.md package."}
        </div>
      )}
    </section>
  );
}
