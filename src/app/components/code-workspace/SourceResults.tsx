"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sourceChoice, type SourceQuery } from "@/lib/code-workspace";
import type { ScmServerView } from "@/lib/scm";
import { resourceLabels, type BrowseState } from "./types";
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
      aria-label={resourceLabels[query.resource]}
      className="mt-4 space-y-3 border-t border-border pt-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h4
            ref={heading}
            tabIndex={-1}
            className="text-sm font-medium outline-none"
          >
            {resourceLabels[query.resource]}
          </h4>
          {query.ref && (
            <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
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
      <ul className="m-0 list-none divide-y divide-border p-0">
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
                className="group flex min-h-touch w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer enabled:hover:bg-muted disabled:text-muted-foreground"
                disabled={disabled || !selectable}
                onClick={() => onChoose(choice)}
              >
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block font-medium">{choice.label}</span>
                  {choice.detail && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {choice.detail}
                    </span>
                  )}
                </span>
                {selectable &&
                  (external ? (
                    <Plus
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ) : (
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ))}
              </button>
            </li>
          );
        })}
      </ul>
      {!choices.length && (
        <p className="text-sm text-muted-foreground">
          {filter
            ? "No matches in the loaded results."
            : "No results returned."}
        </p>
      )}
      {page.completeness === "partial" && (
        <p className="text-sm text-muted-foreground">
          This list is incomplete.
        </p>
      )}
      {page.warnings.map((warning, index) => (
        <p
          key={index}
          className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
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
