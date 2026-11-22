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
import {
  scmProviderLabels,
  type ScmProvider,
  type ScmServerView,
} from "@/lib/scm";
import { SourceResults } from "./SourceResults";
import { fieldClass, WorkspaceSelect } from "./WorkspaceFields";
import {
  sourceResourceLabel,
  type BrowseState,
  type DraftSetter,
  type SourceDraft,
} from "./types";

const sourceFields: Record<
  ScmProvider,
  {
    repository: string;
    revision: string;
    hint: string;
    resources: SourceResource[];
  }
> = {
  gerrit: {
    repository: "team/repository",
    revision: "refs/heads/main",
    hint: "Branch, tag, commit SHA, or Gerrit change selector.",
    resources: ["branches", "tags", "reviews"],
  },
  gitlab: {
    repository: "group/project",
    revision: "main or HEAD",
    hint: "Branch, tag, commit SHA, or HEAD for the default branch.",
    resources: ["branches", "tags", "commits", "reviews"],
  },
  plastic: {
    repository: "Project repository",
    revision: "br:/main or cs:123",
    hint: "Branch (br:), label (lb:), or changeset (cs:).",
    resources: ["branches", "tags", "commits"],
  },
};

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
  const repositoryBrowse = useRef<HTMLButtonElement>(null);
  const revisionBrowse = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const server =
    servers.find((item) => item.id === draft.serverId) ?? servers[0];
  const ref = {
    server_id: server?.id ?? "",
    repository: draft.repository.trim(),
  };
  const provider = server?.provider ?? "gerrit";
  const fields = sourceFields[provider];
  const revisionKinds = fields.resources;
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
                {item.display_name === scmProviderLabels[item.provider]
                  ? item.display_name
                  : `${item.display_name} · ${scmProviderLabels[item.provider]}`}
              </option>
            ))}
          </WorkspaceSelect>
          {server &&
            ["missing", "reconnect_required"].includes(
              server.credential_state ?? ""
            ) && (
              <p className="text-muted-foreground text-sm">
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
              placeholder={fields.repository}
              onChange={(event) => change({ repository: event.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              ref={repositoryBrowse}
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
            placeholder={fields.revision}
            onChange={(event) => change({ selector: event.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <p
            id={`${id}-hint`}
            className="text-muted-foreground text-xs leading-relaxed"
          >
            {fields.hint}
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
                  {sourceResourceLabel(kind, provider)}
                </option>
              ))}
            </WorkspaceSelect>
            <Button
              ref={revisionBrowse}
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
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm wrap-anywhere outline-none"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="outline"
          className="min-h-touch h-auto w-full min-w-0 py-2 whitespace-normal"
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
          className="text-muted-foreground mt-4 text-sm"
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
            const returnFocus =
              browse.query.resource === "repositories"
                ? repositoryBrowse
                : browse.query.resource === "externals"
                  ? repositoryInput
                  : revisionBrowse;
            requestAnimationFrame(() => returnFocus.current?.focus());
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
