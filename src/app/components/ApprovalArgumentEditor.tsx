"use client";

import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

function resizeArgumentTextarea(textarea: HTMLTextAreaElement) {
  const scrollTop = textarea.scrollTop;
  textarea.style.height = "auto";
  textarea.style.overflowY = "hidden";
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
  textarea.style.overflowY = "";
  textarea.scrollTop = scrollTop;
}

function ArgumentTextarea({
  value,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "ref">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) resizeArgumentTextarea(ref.current);
  }, [value]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    let width = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      // Height changes also trigger the observer. Remeasure only when text can rewrap.
      const nextWidth =
        entry.borderBoxSize?.[0]?.inlineSize ??
        textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      resizeArgumentTextarea(textarea);
    });
    observer.observe(textarea, { box: "border-box" });
    return () => observer.disconnect();
  }, []);

  return (
    <Textarea
      {...props}
      ref={ref}
      value={value}
      rows={2}
      className="max-h-[min(24rem,50dvh)] resize-none overflow-y-auto font-mono text-sm"
    />
  );
}

interface ApprovalArgumentEditorProps {
  original: Record<string, unknown>;
  drafts: Record<string, string>;
  editedArgs: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  fieldPrefix: string;
  onDraftChange: (key: string, value: string) => void;
  isLoading?: boolean;
}

export function ApprovalArgumentEditor({
  original,
  drafts,
  editedArgs,
  fieldErrors,
  fieldPrefix,
  onDraftChange,
  isLoading,
}: ApprovalArgumentEditorProps) {
  return (
    <div className="divide-border min-w-0 divide-y">
      {Object.entries(original).map(([key, value], index) => {
        const id = `${fieldPrefix}-${index}`;
        const changed =
          !fieldErrors[key] &&
          JSON.stringify(value) !== JSON.stringify(editedArgs[key]);
        return (
          <div
            key={key}
            className="space-y-2 px-3 py-3"
          >
            <label
              htmlFor={id}
              className="block font-mono text-xs font-medium wrap-anywhere wrap-break-word"
            >
              {key}{" "}
              <span className="text-muted-foreground font-sans font-normal">
                (
                {value === null
                  ? "null"
                  : Array.isArray(value)
                    ? "array"
                    : typeof value}
                )
              </span>
            </label>
            {typeof value === "boolean" ? (
              <select
                id={id}
                value={drafts[key] ?? String(value)}
                onChange={(event) => onDraftChange(key, event.target.value)}
                disabled={isLoading}
                className="border-input bg-background focus-visible:ring-ring h-9 w-full min-w-32 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : (
              <ArgumentTextarea
                id={id}
                value={drafts[key] ?? ""}
                onChange={(event) => onDraftChange(key, event.target.value)}
                aria-invalid={!!fieldErrors[key]}
                aria-describedby={fieldErrors[key] ? `${id}-error` : undefined}
                disabled={isLoading}
              />
            )}
            {fieldErrors[key] && (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-error text-xs"
              >
                {fieldErrors[key]}
              </p>
            )}
            {changed && (
              <div
                role="region"
                aria-label={`Changes to ${key}`}
                tabIndex={0}
                className="focus-visible:ring-ring grid max-h-36 min-w-0 gap-2 overflow-y-auto overscroll-contain rounded-md text-xs focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-2"
              >
                <div className="border-border bg-background min-w-0 rounded-md border p-2">
                  <p className="text-muted-foreground mb-1 font-medium">
                    Before
                  </p>
                  <pre className="text-muted-foreground m-0 rounded-none border-0 bg-transparent p-0 font-mono text-xs wrap-anywhere whitespace-pre-wrap">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                </div>
                <div className="border-success bg-success-primary min-w-0 rounded-md border p-2">
                  <p className="text-success mb-1 font-medium">After</p>
                  <pre className="text-foreground m-0 rounded-none border-0 bg-transparent p-0 font-mono text-xs wrap-anywhere whitespace-pre-wrap">
                    {JSON.stringify(editedArgs[key], null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
