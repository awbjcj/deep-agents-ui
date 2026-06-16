"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TokenServiceGuide } from "@/app/components/tokenServiceGuides";

/** Ordered steps + link for one service, used inside the wizard (always open). */
export function TokenGuideSteps({
  guide,
  username,
}: {
  guide: TokenServiceGuide;
  username: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-foreground/80">
        {guide.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {guide.note && (
        <p className="text-xs text-muted-foreground">{guide.note}</p>
      )}
      <p className="text-xs font-medium text-muted-foreground">{guide.expiry}</p>
      <a
        href={guide.url(username)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Open token page
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/** Collapsible "How to get this token" guide rendered under each sidebar field. */
export function TokenSetupGuide({
  guide,
  username,
}: {
  guide: TokenServiceGuide;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          How to get this token
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 py-2.5">
          <TokenGuideSteps guide={guide} username={username} />
        </div>
      )}
    </div>
  );
}
