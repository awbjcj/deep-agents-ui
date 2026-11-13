import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useRepositoryWorkspace } from "@/app/hooks/useRepositoryWorkspace";
import type { ResolvedTarget } from "@/lib/code-workspace";
import { SourcePicker } from "./SourcePicker";
import { SelectedRevisions } from "./SelectedRevisions";
import type { DraftSetter, SourceDraft } from "./types";

export function WorkspaceSources({
  state,
  locked,
  draft,
  onDraftChange,
  onRemove,
  onDependencies,
}: {
  state: ReturnType<typeof useRepositoryWorkspace>;
  locked: boolean;
  draft: SourceDraft;
  onDraftChange: DraftSetter<SourceDraft>;
  onRemove: (handle: string) => void;
  onDependencies: (target: ResolvedTarget) => void;
}) {
  const headingId = useId();
  const lookupError =
    state.error && ["browse", "resolve"].includes(state.error.operation)
      ? state.error.message
      : null;
  return (
    <div className="grid min-w-0 grid-cols-1 md:grid-cols-2">
      <section
        aria-labelledby={headingId}
        className="min-w-0 border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r"
      >
        <h3
          id={headingId}
          className="text-sm font-semibold"
        >
          Add source revisions
        </h3>
        <p className="mb-5 mt-2 text-sm leading-relaxed text-muted-foreground">
          Browse a repository or enter its name, then choose a revision to add.
        </p>
        <div className="mt-5">
          {state.serverLoading ? (
            <div
              role="status"
              aria-busy="true"
              className="space-y-4"
            >
              <span className="sr-only">Loading source servers</span>
              {[1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="space-y-2"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-touch w-full" />
                </div>
              ))}
            </div>
          ) : state.serverError ? (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-border p-4 text-sm"
            >
              <p>{state.serverError}</p>
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                onClick={state.retryServers}
              >
                Retry source servers
              </Button>
            </div>
          ) : !state.servers.length ? (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="font-medium">No source servers available</p>
              <p className="text-muted-foreground">
                Ask an administrator to enable Gerrit or Plastic, then refresh
                this list.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                onClick={state.retryServers}
              >
                Refresh source servers
              </Button>
            </div>
          ) : (
            <SourcePicker
              servers={state.servers}
              browse={state.browse}
              loading={
                state.busy === "browse" || state.busy === "resolve"
                  ? state.busy
                  : null
              }
              disabled={locked || state.targets.length >= 20}
              error={lookupError}
              draft={draft}
              onDraftChange={onDraftChange}
              onBrowse={state.browseSource}
              onDismiss={state.dismissBrowse}
              onResolve={state.addTarget}
            />
          )}
        </div>
      </section>
      <div className="min-w-0 bg-muted/20 p-4 sm:p-6">
        <SelectedRevisions
          targets={state.targets}
          servers={state.servers}
          disabled={locked}
          onRemove={onRemove}
          onDependencies={onDependencies}
        />
      </div>
    </div>
  );
}
