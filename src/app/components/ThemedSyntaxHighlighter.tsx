"use client";

import { lazy } from "react";

/** Load Prism and its theme together so the first code render is legible. */
export const ThemedSyntaxHighlighter = lazy(() =>
  Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism"),
  ]).then(([{ Prism }, { oneDark }]) => ({
    default: function ThemedPrism(props: React.ComponentProps<typeof Prism>) {
      return (
        <Prism
          {...props}
          style={oneDark}
        />
      );
    },
  }))
);
