/** Recognize authored SCM summaries while leaving structured errors inspectable. */
export function scmToolMarkdown(name: string, result: unknown): string | null {
  if (typeof result !== "string") return null;
  const revision = result.startsWith("### SCM revision resolved\n");
  const resolution = result.startsWith("### SCM revision resolution\n");
  const validation = result.startsWith("### SCM access validation\n");
  if (
    (name === "get_scm_revision" && (revision || resolution)) ||
    (name === "validate_scm_access" && validation) ||
    (name === "get_code_analysis_job" && (resolution || validation))
  )
    return result;
  return null;
}
