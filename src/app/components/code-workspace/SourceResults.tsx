"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sourceChoice, type SourceQuery } from "@/lib/code-workspace";
import type { ScmServerView } from "@/lib/scm";
import { sourceResourceLabel, type BrowseState } from "./types";
import { fieldClass } from "./WorkspaceFields";

type SourceChoice = ReturnType<typeof sourceChoice>;

export function SourceResults({
  browse,
  servers,
  disabled,
  onBrowse,
  onDismiss,
  onChoose,
}: {
  browse: BrowseState;
  servers: ScmServerView[];
  disabled: boolean;
  onBrowse: (query: SourceQuery, append?: boolean) => void;
  onDismiss: () => void;
  onChoose: (choice: SourceChoice) => void;
}) {
  const [filter, setFilter] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const { query, page } = browse;
  const provider =
    servers.find(({ id }) => id === query.server_id)?.provider ?? "gerrit";
  const title = sourceResourceLabel(query.resource, provider);
  const choices = page.items
    .map((item) => sourceChoice(item, query.resource, provider))
    .filter(
      (choice) =>
        choice.label &&
        choice.label.toLowerCase().includes(filter.trim().toLowerCase())
    );
  const external = query.resource === "externals";
  return (
    <section
      aria-label={title}
      className="border-border mt-4 space-y-3 border-t pt-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h4
            ref={heading}
            tabIndex={-1}
            className="text-sm font-medium outline-none"
          >
            {title}
          </h4>
          {query.ref && (
            <p className="text-muted-foreground mt-1 text-xs wrap-anywhere">
              {query.ref.repository}
              {external && " · declared dependencies"}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-touch"
          aria-label="Close source results"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <Input
        aria-label="Filter loaded results"
        className={fieldClass}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter loaded results"
      />
      <ul className="divide-border m-0 list-none divide-y p-0">
        {choices.map((choice, index) => {
          const selectable = external
            ? Boolean(choice.serverId && choice.repository && choice.selector)
            : Boolean(choice.repository || choice.selector);
          return (
            <li
              key={`${choice.label}:${choice.selector}:${index}`}
              className="m-0"
            >
              <button
                type="button"
                className="min-h-touch focus-visible:ring-ring pointer-fine:enabled:hover:bg-muted enabled:active:bg-muted disabled:text-muted-foreground flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none enabled:cursor-pointer"
                disabled={disabled || !selectable}
                onClick={() => onChoose(choice)}
              >
                <span className="min-w-0 flex-1 wrap-anywhere">
                  <span className="block font-medium">{choice.label}</span>
                  {choice.detail && (
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {choice.detail}
                    </span>
                  )}
                </span>
                {selectable &&
                  (external ? (
                    <Plus
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  ) : (
                    <ArrowRight
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  ))}
              </button>
            </li>
          );
        })}
      </ul>
      {!choices.length && (
        <p className="text-muted-foreground text-sm">
          {filter
            ? "No matches in the loaded results."
            : "No results returned."}
        </p>
      )}
      {page.completeness === "partial" && (
        <p className="text-muted-foreground text-sm">
          This list is incomplete.
        </p>
      )}
      {page.warnings.map((warning, index) => (
        <p
          key={index}
          className="text-muted-foreground text-xs wrap-anywhere"
        >
          {warning}
        </p>
      ))}
      {page.next_cursor && (
        <Button
          type="button"
          variant="outline"
          className="min-h-touch"
          disabled={disabled}
          onClick={() =>
            onBrowse({ ...query, cursor: page.next_cursor ?? undefined }, true)
          }
        >
          <ArrowDown aria-hidden="true" /> Load more
        </Button>
      )}
    </section>
  );
}
