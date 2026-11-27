import { ArrowUpRight } from "lucide-react";

import { EmptyState } from "@/app/components/admin/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RlSessionSummary } from "@/lib/rl-dataset";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function RlSessionList({
  rows,
  tagLabels,
  onInspect,
}: {
  rows: RlSessionSummary[];
  tagLabels: ReadonlyMap<string, string>;
  onInspect: (id: string, trigger: HTMLButtonElement) => void;
}) {
  if (!rows.length)
    return <EmptyState title="No sessions match the applied filters." />;

  return (
    <>
      <ul
        aria-label="Anonymized sessions"
        className="grid gap-2 @[960px]/panel:hidden"
      >
        {rows.map((row) => (
          <li
            key={row.session_id}
            className="settings-surface min-w-0 space-y-3 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <SessionLink
                row={row}
                onInspect={onInspect}
              />
              <SessionStatus row={row} />
            </div>
            <SessionGraph row={row} />
            <dl className="border-border/70 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-xs">
              <div>
                <dt className="text-muted-foreground mb-1">Rating</dt>
                <dd>
                  <SessionScore row={row} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">
                  Messages / tools / runs
                </dt>
                <dd className="tabular-nums">
                  <SessionActivity row={row} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground mb-1">Last rated (UTC)</dt>
                <dd>
                  <SessionDate row={row} />
                </dd>
              </div>
            </dl>
            <SessionTags
              row={row}
              tagLabels={tagLabels}
            />
          </li>
        ))}
      </ul>
      <div className="settings-surface hidden overflow-hidden @[960px]/panel:block">
        <table className="w-full border-collapse text-start text-xs [overflow-wrap:anywhere]">
          <caption className="sr-only">Anonymized sessions</caption>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {[
                "Session",
                "Last rated (UTC)",
                "Messages / tools / runs",
                "Rating",
                "Reason tags",
                "Curation",
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-2 text-start font-medium"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((row) => (
              <tr
                key={row.session_id}
                className="border-border border-t align-top"
              >
                <th
                  scope="row"
                  className="px-3 pb-3 text-start font-normal"
                >
                  <SessionLink
                    row={row}
                    onInspect={onInspect}
                  />
                  <SessionGraph row={row} />
                </th>
                <td className="px-3 py-3">
                  <SessionDate row={row} />
                </td>
                <td className="px-3 py-3 tabular-nums">
                  <SessionActivity row={row} />
                </td>
                <td className="px-3 py-3">
                  <SessionScore row={row} />
                </td>
                <td className="px-3 py-3">
                  <SessionTags
                    row={row}
                    tagLabels={tagLabels}
                  />
                </td>
                <td className="px-3 py-3">
                  <SessionStatus row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SessionLink({
  row,
  onInspect,
}: {
  row: RlSessionSummary;
  onInspect: (id: string, trigger: HTMLButtonElement) => void;
}) {
  const shortId = row.session_id.slice(0, 8);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="min-h-touch text-primary -ms-2 font-mono text-xs"
      aria-label={`Inspect session ${shortId}`}
      onClick={(event) => onInspect(row.session_id, event.currentTarget)}
    >
      {shortId}{" "}
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5"
      />
    </Button>
  );
}

function SessionGraph({ row }: { row: RlSessionSummary }) {
  return (
    <div className="space-y-0.5 text-xs [overflow-wrap:anywhere]">
      <p className="font-semibold">{row.graph_id}</p>
      {row.models.length > 0 && (
        <p className="text-muted-foreground">{row.models.join(", ")}</p>
      )}
    </div>
  );
}

function SessionDate({ row }: { row: RlSessionSummary }) {
  return (
    <time dateTime={row.last_rated_at}>
      {dateFormatter.format(new Date(row.last_rated_at))}
    </time>
  );
}

function SessionActivity({ row }: { row: RlSessionSummary }) {
  return (
    <>
      {row.message_count} / {row.tool_call_count} / {row.subagent_count}
    </>
  );
}

function SessionScore({ row }: { row: RlSessionSummary }) {
  if (row.avg_score === null) return "—";
  return (
    <div className="tabular-nums">
      <span className="font-semibold">{row.avg_score.toFixed(1)}/5</span>
      <span className="text-muted-foreground mt-1 block">
        {row.min_score}–{row.max_score} · {row.rating_count}{" "}
        {row.rating_count === 1 ? "rating" : "ratings"}
      </span>
    </div>
  );
}

function SessionTags({
  row,
  tagLabels,
}: {
  row: RlSessionSummary;
  tagLabels: ReadonlyMap<string, string>;
}) {
  if (!row.tags.length)
    return (
      <span className="text-muted-foreground hidden @[960px]/panel:inline">
        —
      </span>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {row.tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="max-w-full [overflow-wrap:anywhere]"
        >
          {tagLabels.get(tag) ?? tag.replaceAll("_", " ")}
        </Badge>
      ))}
    </div>
  );
}

function SessionStatus({ row }: { row: RlSessionSummary }) {
  return (
    <div className="space-y-1">
      <Badge
        className="capitalize"
        variant={row.curation_status === "approved" ? "secondary" : "outline"}
      >
        {row.curation_status}
      </Badge>
      {row.capture_status !== "ready" && (
        <p className="text-muted-foreground text-xs">
          {row.capture_status === "partial"
            ? "Partial capture"
            : "Capture failed"}
        </p>
      )}
    </div>
  );
}
