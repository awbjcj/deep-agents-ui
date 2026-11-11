"use client";

import { useId, useRef } from "react";
import { GitBranch, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  RepositoryRef,
  SourceQuery,
  SourceResource,
} from "@/lib/code-workspace";
import type { ScmServerView } from "@/lib/scm";
import { SourceResults } from "./SourceResults";
import { fieldClass, WorkspaceSelect } from "./WorkspaceFields";
import {
  resourceLabels,
  type BrowseState,
  type DraftSetter,
  type SourceDraft,
} from "./types";

export function SourcePicker({
  servers,
  browse,
  loading,
  disabled,
  error,
  draft,
  onDraftChange,
  onBrowse,
  onDismiss,
  onResolve,
}: {
  servers: ScmServerView[];
  browse: BrowseState | null;
  loading: "browse" | "resolve" | null;
  disabled: boolean;
  error: string | null;
  draft: SourceDraft;
  onDraftChange: DraftSetter<SourceDraft>;
  onBrowse: (query: SourceQuery, append?: boolean) => void;
  onDismiss: () => void;
  onResolve: (ref: RepositoryRef, selector: string) => Promise<boolean>;
}) {
  const id = useId();
  const revisionInput = useRef<HTMLInputElement>(null);
  const repositoryInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const server =
    servers.find((item) => item.id === draft.serverId) ?? servers[0];
  const ref = {
    server_id: server?.id ?? "",
    repository: draft.repository.trim(),
  };
  const isPlastic = server?.provider === "plastic";
  const revisionKinds: SourceResource[] = [
    "branches",
    "tags",
    isPlastic ? "commits" : "reviews",
  ];
  const resource = revisionKinds.includes(draft.resource)
    ? draft.resource
    : "branches";
  const locked = disabled || !!loading;
  const change = (patch: Partial<SourceDraft>) =>
    onDraftChange((previous) => ({ ...previous, ...patch }));
  const resolve = async (targetRef: RepositoryRef, selector: string) => {
    const added = await onResolve(targetRef, selector);
    if (added) change({ selector: "" });
    requestAnimationFrame(() =>
      (added ? revisionInput.current : errorRef.current)?.focus()
    );
  };
  return (
    <div className="min-w-0">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!server || !ref.repository || !draft.selector.trim() || locked)
            return;
          void resolve(ref, draft.selector.trim());
        }}
      >
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <Label htmlFor={`${id}-server`}>Source server</Label>
          <WorkspaceSelect
            id={`${id}-server`}
            value={server?.id ?? ""}
            disabled={locked || !server}
            onChange={(event) => {
              change({
                serverId: event.target.value,
                repository: "",
                selector: "",
                resource: "branches",
              });
              onDismiss();
            }}
          >
            {!server && <option value="">No enabled source servers</option>}
            {servers.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.display_name} ·{" "}
                {item.provider === "gerrit" ? "Gerrit" : "Plastic"}
              </option>
            ))}
          </WorkspaceSelect>
          {server &&
            ["missing", "reconnect_required"].includes(
              server.credential_state ?? ""
            ) && (
              <p className="text-sm text-muted-foreground">
                Connect this server in Workspace → Tokens before looking up
                source.
              </p>
            )}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <Label htmlFor={`${id}-repo`}>Repository</Label>
          <div className="flex gap-2">
            <Input
              ref={repositoryInput}
              id={`${id}-repo`}
              className={`${fieldClass} flex-1`}
              value={draft.repository}
              maxLength={500}
              required
              disabled={locked || !server}
              placeholder={isPlastic ? "Project repository" : "team/repository"}
              onChange={(event) => change({ repository: event.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-touch px-3"
              disabled={locked || !server}
              onClick={() =>
                onBrowse({
                  server_id: ref.server_id,
                  resource: "repositories",
                  filters: {},
                })
              }
            >
              <Search aria-hidden="true" />
              <span className="hidden sm:inline">Browse</span>
              <span className="sr-only sm:hidden">Browse</span>
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <Label htmlFor={`${id}-revision`}>Revision selector</Label>
          <Input
            ref={revisionInput}
            id={`${id}-revision`}
            className={fieldClass}
            value={draft.selector}
            maxLength={500}
            required
            disabled={locked || !server}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            placeholder={
              isPlastic ? "br:/main or cs:123" : "refs/heads/main or commit SHA"
            }
            onChange={(event) => change({ selector: event.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <p
            id={`${id}-hint`}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {isPlastic
              ? "Branch (br:), label (lb:), or changeset (cs:)."
              : "Branch, tag, commit SHA, or Gerrit change selector."}
          </p>
          <div className="flex flex-wrap gap-2 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:basis-24">
            <WorkspaceSelect
              aria-label="Revision list type"
              value={resource}
              disabled={locked || !ref.repository}
              onChange={(event) =>
                change({ resource: event.target.value as SourceResource })
              }
            >
              {revisionKinds.map((kind) => (
                <option
                  key={kind}
                  value={kind}
                >
                  {resourceLabels[kind]}
                </option>
              ))}
            </WorkspaceSelect>
            <Button
              type="button"
              variant="outline"
              className="min-h-touch px-3"
              disabled={locked || !server || !ref.repository}
              onClick={() =>
                onBrowse({
                  server_id: ref.server_id,
                  resource,
                  ref,
                  filters: {},
                })
              }
            >
              <GitBranch aria-hidden="true" /> Browse refs
            </Button>
          </div>
        </div>
        {error && (
          <p
            ref={errorRef}
            id={`${id}-error`}
            role="alert"
            tabIndex={-1}
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="outline"
          className="h-auto min-h-touch w-full min-w-0 whitespace-normal py-2"
          disabled={
            locked || !server || !ref.repository || !draft.selector.trim()
          }
        >
          {loading === "resolve" ? (
            <Loader2
              className="motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {loading === "resolve" ? "Resolving revision…" : "Resolve and add"}
        </Button>
      </form>
      {loading === "browse" && (
        <p
          role="status"
          className="mt-4 text-sm text-muted-foreground"
        >
          Looking up source…
        </p>
      )}
      {browse && (
        <SourceResults
          key={JSON.stringify([
            browse.query.server_id,
            browse.query.resource,
            browse.query.ref,
            browse.query.filters,
          ])}
          browse={browse}
          servers={servers}
          disabled={locked}
          onBrowse={onBrowse}
          onDismiss={() => {
            onDismiss();
            repositoryInput.current?.focus();
          }}
          onChoose={(choice) => {
            if (
              browse.query.resource === "externals" &&
              choice.serverId &&
              choice.repository
            ) {
              void resolve(
                { server_id: choice.serverId, repository: choice.repository },
                choice.selector
              );
              return;
            }
            change({
              serverId: browse.query.server_id,
              repository:
                choice.repository || browse.query.ref?.repository || "",
              selector: choice.selector,
            });
            onDismiss();
            revisionInput.current?.focus();
          }}
        />
      )}
    </div>
  );
}
