"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function SavedSetting({
  title,
  status,
  children,
  triggerId,
}: {
  title: string;
  status?: string;
  children: ReactNode;
  triggerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!status) return <>{children}</>;
  return (
    <div className="border-border rounded-lg border px-3">
      <button
        type="button"
        id={triggerId}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="focus-visible:outline-primary flex min-h-11 w-full items-center gap-2 rounded text-left text-sm font-medium"
      >
        <span className="min-w-0 flex-1 wrap-anywhere">{title}</span>
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
          {status}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={expanded ? "size-4 rotate-180" : "size-4"}
        />
      </button>
      {expanded && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}
