"use client";

import React from "react";
import { Maximize2 } from "lucide-react";
import { useFileOpener } from "@/app/components/FileOpener";
import type { SignalPlot } from "@/lib/signal-plots";

/** Show compact plot previews that open in the shared file viewer. */
export function SignalPlotPreviews({ plots }: { plots: SignalPlot[] }) {
  const opener = useFileOpener();
  if (plots.length === 0) return null;

  return (
    <div className="my-3 flex flex-wrap gap-2">
      {plots.map(({ path, content }) => (
        <button
          key={path}
          type="button"
          onClick={() => opener?.open(path)}
          aria-label="Open full-size plot"
          className="border-border focus-visible:ring-ring hover:border-ring relative h-40 w-56 max-w-full overflow-hidden rounded-lg border bg-white focus-visible:ring-2 focus-visible:outline-none"
        >
          <img
            src={`data:image/png;base64,${content}`}
            alt="MAT signal plot"
            className="size-full object-contain"
            loading="lazy"
          />
          <span className="border-border bg-background text-foreground absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-md border">
            <Maximize2
              aria-hidden="true"
              className="size-3.5"
            />
          </span>
        </button>
      ))}
    </div>
  );
}
