"use client";

import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface MarkdownContentProps {
  content: string;
  className?: string;
  /** Conversation files resolve virtual artifact links without server requests. */
  files?: Record<string, unknown>;
  /** Files preserve authored Markdown; chat also repairs provider dialects. */
  mode?: "assistant" | "document";
  /** Stabilize incomplete emphasis while this message is receiving tokens. */
  isStreaming?: boolean;
}

const Renderer = lazy(() =>
  import("./MarkdownRenderer").then(({ MarkdownRenderer }) => ({
    default: MarkdownRenderer,
  }))
);

// Only batch appended text. Replacements, document previews and the final
// frame must use the incoming content in the same render.
function useDisplayedMarkdown(content: string, live: boolean) {
  const [displayed, setDisplayed] = useState(content);
  const pending = displayed !== content;
  if (pending && (!live || !displayed || !content.startsWith(displayed))) {
    setDisplayed(content);
  }

  const flush = useEffectEvent(() => setDisplayed(content));
  useEffect(() => {
    if (!pending || !live) return;
    const timer = window.setTimeout(flush, 50);
    return () => window.clearTimeout(timer);
  }, [pending, live, displayed]);

  return displayed;
}

function MarkdownFallback({
  content,
  className,
}: Pick<MarkdownContentProps, "content" | "className">) {
  return (
    <div
      aria-busy="true"
      className={cn("min-w-0 wrap-anywhere whitespace-pre-wrap", className)}
    >
      {/data:[^\s,]*;base64,/i.test(content) ? "Loading preview…" : content}
    </div>
  );
}

export const MarkdownContent = memo(function MarkdownContent(
  props: MarkdownContentProps
) {
  const content = useDisplayedMarkdown(
    props.content,
    props.isStreaming === true && props.mode !== "document"
  );
  return (
    <Suspense
      fallback={
        <MarkdownFallback
          content={content}
          className={props.className}
        />
      }
    >
      <Renderer
        {...props}
        content={content}
      />
    </Suspense>
  );
});
