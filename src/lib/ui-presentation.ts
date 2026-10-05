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
