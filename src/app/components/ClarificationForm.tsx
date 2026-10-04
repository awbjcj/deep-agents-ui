"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clarificationAnswers,
  type Clarification,
  type ClarificationAnswer,
} from "@/lib/ui-presentation";

export function ClarificationForm({
  form,
  disabled,
  onReview,
}: {
  form: Clarification;
  disabled: boolean;
  onReview: (answer: ClarificationAnswer) => void;
}) {
  const id = useId();
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [attempted, setAttempted] = useState(false);
  const parsed = clarificationAnswers(form, drafts);
  const set = (key: string, value: unknown) =>
    setDrafts((previous) => ({ ...previous, [key]: value }));
  return (
    <form
      aria-label={form.title}
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (disabled) return;
        const firstInvalid = form.fields.find(
          (field) => parsed.errors[field.id]
        );
        if (firstInvalid) {
          const field = event.currentTarget.elements.namedItem(
            `${id}-${firstInvalid.id}`
          );
          if (field instanceof HTMLFieldSetElement)
            field.querySelector("input")?.focus();
          else if (field instanceof HTMLElement) field.focus();
          return;
        }
        onReview({ answers: parsed.answers });
      }}
    >
      <div>
        <h3 className="font-semibold">{form.title}</h3>
        {form.description && (
          <p className="break-words text-sm text-muted-foreground">
            {form.description}
          </p>
        )}
      </div>
      {form.fields.map((field) => (
        <div
          key={field.id}
          className="space-y-1"
        >
          <label
            htmlFor={`${id}-${field.id}`}
            className="block text-sm font-medium"
          >
            {field.label}
            {field.required ? " *" : " (optional)"}
          </label>
          {field.type === "multiselect" ? (
            <fieldset
              id={`${id}-${field.id}`}
              name={`${id}-${field.id}`}
              aria-invalid={attempted && !!parsed.errors[field.id]}
              aria-describedby={
                attempted && parsed.errors[field.id]
                  ? `${id}-${field.id}-error`
                  : undefined
              }
              disabled={disabled}
              className="space-y-1"
            >
              <legend className="sr-only">{field.label}</legend>
              {field.options.map((option) => (
                <label
                  key={option}
                  className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm focus-within:ring-2 focus-within:ring-ring"
                >
                  <input
                    type="checkbox"
                    checked={((drafts[field.id] ?? []) as string[]).includes(
                      option
                    )}
                    onChange={(event) => {
                      const previous = (drafts[field.id] ?? []) as string[];
                      set(
                        field.id,
                        event.target.checked
                          ? [...previous, option]
                          : previous.filter((value) => value !== option)
                      );
                    }}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          ) : field.type === "select" || field.type === "boolean" ? (
            <select
              id={`${id}-${field.id}`}
              disabled={disabled}
              value={
                drafts[field.id] === undefined ? "" : String(drafts[field.id])
              }
              aria-invalid={attempted && !!parsed.errors[field.id]}
              aria-describedby={
                attempted && parsed.errors[field.id]
                  ? `${id}-${field.id}-error`
                  : undefined
              }
              onChange={(event) =>
                set(
                  field.id,
                  field.type === "boolean" && event.target.value !== ""
                    ? event.target.value === "true"
                    : event.target.value
                )
              }
              className="w-full rounded-md border border-border bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
            >
              <option value="">Choose a response</option>
              {(field.type === "boolean"
                ? ["true", "false"]
                : field.options
              ).map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {field.type === "boolean"
                    ? option === "true"
                      ? "Yes"
                      : "No"
                    : option}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${id}-${field.id}`}
              disabled={disabled}
              type={field.type === "number" ? "number" : "text"}
              step="any"
              maxLength={6000}
              value={String(drafts[field.id] ?? "")}
              aria-invalid={attempted && !!parsed.errors[field.id]}
              aria-describedby={
                attempted && parsed.errors[field.id]
                  ? `${id}-${field.id}-error`
                  : undefined
              }
              onChange={(event) => set(field.id, event.target.value)}
              className="w-full rounded-md border border-border bg-background p-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
            />
          )}
          {attempted && parsed.errors[field.id] && (
            <p
              role="alert"
              id={`${id}-${field.id}-error`}
              className="text-xs text-destructive"
            >
              {parsed.errors[field.id]}
            </p>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={disabled}
        >
          Review answers
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onReview({ cancelled: true })}
        >
          Skip this question
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Answers are sent when you resume the reviewed requests.
      </p>
    </form>
  );
}
