"use client";

import { lazy } from "react";
import { cn } from "@/lib/utils";

/** Keep Prism colors in CSS so every block follows the active page theme. */
export const ThemedSyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then(({ Prism }) => ({
    default: function ThemedPrism(props: React.ComponentProps<typeof Prism>) {
      return (
        <Prism
          {...props}
          className={cn("code-block", props.className)}
          style={{}}
          useInlineStyles={false}
        />
      );
    },
  }))
);
