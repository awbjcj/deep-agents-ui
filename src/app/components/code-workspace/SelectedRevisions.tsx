import { ChevronDown, FolderGit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_WORKSPACE_TARGETS,
  type ResolvedTarget,
} from "@/lib/code-workspace";
import type { ScmServerView } from "@/lib/scm";

export function SelectedRevisions({
  targets,
  servers,
  disabled = false,
  onRemove,
  onDependencies,
}: {
  targets: ResolvedTarget[];
  servers: ScmServerView[];
  disabled?: boolean;
  onRemove?: (handle: string) => void;
  onDependencies?: (target: ResolvedTarget) => void;
}) {
  return (
    <section
      aria-label="Selected revisions"
      className="min-w-0"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Selected revisions</h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {targets.length} / {MAX_WORKSPACE_TARGETS} targets
        </span>
      </div>
      {targets.length ? (
        <ul className="divide-border border-border m-0 list-none divide-y border-y p-0">
          {targets.map((item) => {
            const { target, target_handle } = item;
            const server =
              servers.find(({ id }) => id === target.ref.server_id)
                ?.display_name ?? target.ref.server_id;
            return (
              <li
                key={target_handle}
                className="m-0 py-3 first:pt-3 last:pb-3"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FolderGit2
                    aria-hidden="true"
                    className="text-muted-foreground mt-1 size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-1 wrap-anywhere">
                    <p className="text-sm font-medium">
                      {target.ref.repository}
                    </p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {server} · {target.selector}
                    </p>
                  </div>
                  {onRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-touch -mt-2 -mr-2 shrink-0"
                      disabled={disabled}
                      aria-label={`Remove ${target.ref.repository} at ${target.revision}`}
                      onClick={() => onRemove(target_handle)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-start justify-between gap-x-2 pl-6">
                  <details className="group/revision text-muted-foreground max-w-full min-w-0 text-xs">
                    <summary
                      className="min-h-touch focus-visible:ring-ring inline-flex max-w-full cursor-pointer list-none items-center gap-2 rounded-md py-1 outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
                      aria-label={`Revision details for ${target.ref.repository} at ${target.revision}`}
                    >
                      <span className="min-w-0 font-mono wrap-anywhere">
                        {target.revision.slice(0, 12)}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="size-3 shrink-0 group-open/revision:rotate-180"
                      />
                    </summary>
                    <p className="pb-2 font-mono wrap-anywhere">
                      {target.revision}
                    </p>
                  </details>
                  {onDependencies && target.provider === "gerrit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-touch text-muted-foreground -ml-1 h-auto max-w-full min-w-0 px-1 py-2 text-xs whitespace-normal"
                      disabled={
                        disabled || targets.length >= MAX_WORKSPACE_TARGETS
                      }
                      aria-label={`Find dependencies for ${target.ref.repository} at ${target.revision}`}
                      onClick={() => onDependencies(item)}
                    >
                      Find dependencies
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-border flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-5 py-6 text-center">
          <FolderGit2
            className="text-muted-foreground mb-1 size-6"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">Add your first repository</p>
          <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
            Choose a source and resolve a revision. Add more repositories to
            analyze them together.
          </p>
        </div>
      )}
      {targets.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          {targets.length >= MAX_WORKSPACE_TARGETS
            ? "Workspace limit reached. Remove a revision to add another."
            : "Each revision is pinned to the source shown. You can include multiple revisions of one repository."}
        </p>
      )}
    </section>
  );
}
