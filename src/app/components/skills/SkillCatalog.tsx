"use client";

import React, { useId, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SkillCatalogEntry } from "@/lib/skills";
import { cn } from "@/lib/utils";

export interface SkillCatalogProps {
  entries: SkillCatalogEntry[];
  loading?: boolean;
  unavailable?: boolean;
  selectedKey?: string | null;
  onSelect: (entry: SkillCatalogEntry) => void;
  onCreate: () => void;
  onImport: () => void;
}

export function SkillCatalog({
  entries,
  loading,
  unavailable,
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
      className="min-w-0 space-y-4 @container"
      aria-label="Skill catalog"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight">Your skills</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Reusable instructions for the way you work. Browse system skills or
            build your own.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2">
          <Button
            type="button"
            onClick={onCreate}
            className="flex-1"
          >
            <Plus aria-hidden="true" /> New skill
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImport}
            className="flex-1"
          >
            <Upload aria-hidden="true" />
            Import
          </Button>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole
          aria-hidden="true"
          className="size-3.5 shrink-0"
        />
        Personal skills are private to your account.
      </p>
      <div className="flex flex-col gap-2 @sm:flex-row">
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
            placeholder="Search skills…"
          />
        </div>
        <div className="relative shrink-0">
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
            className="h-10 w-full appearance-none rounded-lg border border-input bg-background bg-none pl-3 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring @sm:w-32"
          >
            <option value="all">All origins</option>
            <option value="personal">Personal</option>
            <option value="system">System</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 size-4 text-muted-foreground"
          />
        </div>
      </div>
      {!unavailable && (
        <p
          role="status"
          className="text-xs tabular-nums text-muted-foreground"
        >
          {loading
            ? "Updating library…"
            : `${matches.length} ${matches.length === 1 ? "skill" : "skills"}`}
          {!loading &&
            origin === "all" &&
            !search &&
            ` · ${
              entries.filter((entry) => entry.origin === "personal").length
            } personal`}
        </p>
      )}
      {loading && !entries.length ? (
        <p
          role="status"
          className="rounded-lg border p-6 text-sm text-muted-foreground"
        >
          Loading skills…
        </p>
      ) : unavailable ? null : matches.length ? (
        <ul className="m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0">
          {matches.map((entry) => (
            <li key={`${entry.origin}:${entry.id}`}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                aria-pressed={selectedKey === `${entry.origin}:${entry.id}`}
                className={cn(
                  "group flex w-full min-w-0 items-start gap-3 px-3 py-4 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent",
                  selectedKey === `${entry.origin}:${entry.id}` && "bg-accent"
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                  {entry.origin === "personal" ? (
                    <LockKeyhole
                      aria-hidden="true"
                      className="size-4"
                    />
                  ) : (
                    <BookOpen
                      aria-hidden="true"
                      className="size-4"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-all text-sm font-medium">
                      {entry.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
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
                  <p className="m-0 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
                    {entry.description}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="mt-1.5 size-4 shrink-0 text-muted-foreground"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div
          role="status"
          className="space-y-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          <Search
            aria-hidden="true"
            className="mx-auto size-5"
          />
          <p>
            {entries.length
              ? "No skills match your search and filter."
              : "No skills yet. Create a skill or import a SKILL.md package."}
          </p>
          {(search || origin !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setOrigin("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
