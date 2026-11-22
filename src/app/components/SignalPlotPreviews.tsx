"use client";

import React from "react";
import { useFileOpener } from "@/app/components/FileOpener";
import type { SignalPlot } from "@/lib/signal-plots";

/** Show each PNG at transcript width and open it in the shared file viewer. */
export function SignalPlotPreviews({ plots }: { plots: SignalPlot[] }) {
  const opener = useFileOpener();
  return plots.map(({ path, content }) => (
    <button
      key={path}
      type="button"
      onClick={() => opener?.open(path)}
      className="border-border focus-visible:ring-ring my-3 block w-full overflow-hidden rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
    >
      <img
        src={`data:image/png;base64,${content}`}
        alt="MAT signal plot. Open full-size plot."
        className="h-auto w-full"
        loading="lazy"
      />
    </button>
  ));
}
