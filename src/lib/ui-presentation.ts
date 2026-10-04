import { z } from "zod";

const label = z.string().trim().min(1).max(200);
const text = z.string().max(6000);
const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("markdown"), text }).strict(),
  z
    .object({
      type: z.literal("table"),
      columns: z.array(label).min(1).max(12),
      rows: z.array(z.array(z.string().max(1000)).max(12)).max(100),
    })
    .strict()
    .refine((value) =>
      value.rows.every((row) => row.length === value.columns.length)
    ),
  z
    .object({
      type: z.literal("metrics"),
      items: z
        .array(
          z
            .object({
              label,
              value: label,
              detail: z.string().max(500).optional(),
            })
            .strict()
        )
        .min(1)
        .max(12),
    })
    .strict(),
  z
    .object({
      type: z.literal("chart"),
      items: z
        .array(
          z
            .object({ label, value: z.number().finite().min(0).max(1e12) })
            .strict()
        )
        .min(1)
        .max(30),
      unit: z.string().max(40).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("links"),
      items: z
        .array(
          z
            .object({
              label,
              url: safeUrl,
              description: z.string().max(500).optional(),
            })
            .strict()
        )
        .min(1)
        .max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("suggestions"),
      items: z.array(z.string().trim().min(1).max(1000)).min(1).max(6),
    })
    .strict(),
]);
export const presentationSchema = z
  .object({
    kind: z.literal("ui_presentation"),
    version: z.literal(1),
    title: label,
    blocks: z.array(block).min(1).max(12),
  })
  .strict();
export type UiPresentation = z.infer<typeof presentationSchema>;

/** Render only the bounded catalog produced by the registered tool. */
export function parsePresentation(
  name: string,
  result: unknown
): UiPresentation | null {
  if (name !== "present_result") return null;
  try {
    if (
      (typeof result === "string"
        ? result.length
        : JSON.stringify(result)?.length ?? 0) > 200000
    )
      return null;
    const parsed = presentationSchema.safeParse(
      typeof result === "string" ? JSON.parse(result) : result
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const clarificationSchema = z
  .object({
    kind: z.literal("clarification"),
    version: z.literal(1),
    title: label,
    description: z.string().max(2000).default(""),
    fields: z
      .array(
        z
          .object({
            id: z
              .string()
              .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/)
              .refine(
                (id) => !["constructor", "prototype", "__proto__"].includes(id)
              ),
            label,
            type: z.enum([
              "text",
              "number",
              "boolean",
              "select",
              "multiselect",
            ]),
            required: z.boolean().default(true),
            options: z.array(label).max(12).default([]),
          })
          .strict()
          .refine(
            (field) =>
              !["select", "multiselect"].includes(field.type) ||
              (field.options.length > 0 &&
                new Set(field.options).size === field.options.length)
          )
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (form) =>
      new Set(form.fields.map((field) => field.id)).size === form.fields.length
  );
export type Clarification = z.infer<typeof clarificationSchema>;
export type ClarificationAnswer =
  | { answers: Record<string, string | number | boolean | string[]> }
  | { cancelled: true };

export function parseClarification(value: unknown): Clarification | null {
  const parsed = clarificationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keep field drafts separate from typed answers and never coerce blank to zero. */
export function clarificationAnswers(
  form: Clarification,
  drafts: Record<string, unknown>
): {
  answers: Record<string, string | number | boolean | string[]>;
  errors: Record<string, string>;
} {
  const answers: Record<string, string | number | boolean | string[]> = {};
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    const raw = drafts[field.id];
    const missing =
      raw === undefined ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);
    if (missing) {
      if (field.required) errors[field.id] = "A response is required.";
      continue;
    }
    let value = raw;
    if (field.type === "number" && typeof raw === "string" && raw.trim())
      value = Number(raw);
    const valid =
      field.type === "text"
        ? typeof value === "string" &&
          value.trim().length > 0 &&
          value.length <= 6000
        : field.type === "number"
        ? typeof value === "number" &&
          Number.isFinite(value) &&
          Math.abs(value) <= 1e12
        : field.type === "boolean"
        ? typeof value === "boolean"
        : field.type === "select"
        ? typeof value === "string" && field.options.includes(value)
        : Array.isArray(value) &&
          value.length <= 12 &&
          new Set(value).size === value.length &&
          value.every(
            (item) => typeof item === "string" && field.options.includes(item)
          );
    if (!valid) errors[field.id] = "Enter a valid response.";
    else answers[field.id] = value as string | number | boolean | string[];
  }
  return { answers, errors };
}
