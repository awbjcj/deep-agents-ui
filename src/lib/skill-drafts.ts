import { dump, load } from "js-yaml";
import {
  SkillsApiError,
  type PersonalSkill,
  type SkillDiagnostic,
  type SkillFile,
  type SkillLimits,
  type SystemSkill,
} from "./skills";

export interface SkillDraft {
  accountId: string;
  sourceId: string | null;
  baseRevision: number | null;
  files: SkillFile[];
  baselineFiles: SkillFile[];
}

/** Defaults used before a catalog is available; editors always use its live limits. */
export const DEFAULT_SKILL_LIMITS: SkillLimits = {
  skill_file_bytes: 65536,
  supporting_file_bytes: 524288,
  package_bytes: 2097152,
  files_per_package: 100,
  skills_per_account: 50,
  account_text_bytes: 10485760,
  upload_bytes: 2097152,
  path_characters: 240,
  path_segments: 8,
  name_characters: 64,
  description_characters: 1024,
  worker_request_bytes: 524288,
  broker_response_bytes: 2097152,
  snapshot_chunk_bytes: 131072,
};
const cloneFiles = (files: SkillFile[]) => files.map((file) => ({ ...file }));
const pathKey = (path: string) => path.normalize("NFC").toLowerCase();
function hasInvalidText(text: string, allowWhitespace: boolean): boolean {
  return Array.from(text).some((character) => {
    const point = character.codePointAt(0)!;
    return (
      (point >= 0xd800 && point <= 0xdfff) ||
      ((point < 32 || (point >= 127 && point <= 159)) &&
        !(allowWhitespace && "\t\r\n".includes(character)))
    );
  });
}
export const skillTextBytes = (text: string): number =>
  new TextEncoder().encode(text).length;

export function createSkillDraft(
  accountId: string,
  skill: PersonalSkill | null
): SkillDraft {
  return {
    accountId,
    sourceId: skill?.id ?? null,
    baseRevision: skill?.revision ?? null,
    files: skill
      ? cloneFiles(skill.files)
      : [
          {
            path: "SKILL.md",
            content: '---\nname: new-skill\ndescription: ""\n---\n\n',
          },
        ],
    baselineFiles: skill ? cloneFiles(skill.files) : [],
  };
}
export function isSkillDraftDirty(draft: SkillDraft): boolean {
  return (
    draft.files.length !== draft.baselineFiles.length ||
    draft.files.some(
      (file, index) =>
        file.path !== draft.baselineFiles[index]?.path ||
        file.content !== draft.baselineFiles[index]?.content
    )
  );
}

/** Parse safe YAML while keeping the instruction body byte-for-byte. */
export function readSkillFrontmatter(
  content: string,
  maxBytes = DEFAULT_SKILL_LIMITS.skill_file_bytes
): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)^---(?:\r?\n|$)([\s\S]*)$/m.exec(content);
  if (!match || match.index !== 0 || skillTextBytes(content) > maxBytes) {
    throw new Error(
      "SKILL.md must begin with bounded YAML frontmatter and a closing delimiter."
    );
  }
  const metadata: unknown = load(match[1]);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error("Skill frontmatter must be a mapping.");
  // Bound traversal and reject shared objects before noRefs serialization expands aliases.
  const seen = new Set<object>();
  let count = 0;
  function visit(value: unknown, depth: number): void {
    if (++count > 4096 || depth > 32)
      throw new Error("Skill metadata exceeds supported complexity.");
    if (!value || typeof value !== "object") return;
    if (seen.has(value))
      throw new Error("Skill metadata aliases are not supported.");
    seen.add(value);
    Object.values(value).forEach((child) => visit(child, depth + 1));
  }
  visit(metadata, 0);
  return { metadata: metadata as Record<string, unknown>, body: match[2] };
}

function issue(
  code: string,
  message: string,
  path: string | null = null
): SkillDiagnostic {
  return { code, message, path };
}
function pathDiagnostic(
  path: string,
  limits: SkillLimits
): SkillDiagnostic | null {
  const parts = path.split("/");
  if (
    !path ||
    [...path].length > limits.path_characters ||
    parts.length > limits.path_segments ||
    /[\\<>:"|?*]/.test(path) ||
    hasInvalidText(path, false) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[ .]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
    )
  ) {
    return issue(
      "invalid_skill_path",
      "Use a bounded relative resource path with safe segments.",
      path
    );
  }
  if (parts.some((part) => pathKey(part) === "skill.md") && path !== "SKILL.md")
    return issue(
      "invalid_skill_entrypoint",
      "Only the root SKILL.md entrypoint is allowed.",
      path
    );
  return null;
}

/** Feedback only: the server remains authoritative for validation and quotas. */
export function validateSkillDraft(
  draft: SkillDraft,
  limits: SkillLimits
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  if (draft.files.length > limits.files_per_package)
    diagnostics.push(
      issue(
        "too_many_skill_files",
        `Use at most ${limits.files_per_package} files.`
      )
    );
  const seen = new Set<string>();
  let total = 0;
  for (const file of draft.files) {
    const invalidPath = pathDiagnostic(file.path, limits);
    if (invalidPath) diagnostics.push(invalidPath);
    const key = pathKey(file.path);
    if (seen.has(key))
      diagnostics.push(
        issue(
          "duplicate_skill_path",
          "Resource paths must be unique, including letter case.",
          file.path
        )
      );
    seen.add(key);
    if (hasInvalidText(file.content, true))
      diagnostics.push(
        issue(
          "invalid_skill_text",
          "Resources must contain valid text without binary controls.",
          file.path
        )
      );
    const size = skillTextBytes(file.content);
    total += size;
    const limit =
      file.path === "SKILL.md"
        ? limits.skill_file_bytes
        : limits.supporting_file_bytes;
    if (size > limit)
      diagnostics.push(
        issue(
          "skill_file_too_large",
          `This resource exceeds ${limit.toLocaleString()} UTF-8 bytes.`,
          file.path
        )
      );
  }
  for (const file of draft.files) {
    const parts = pathKey(file.path).split("/");
    if (
      parts.some(
        (_, index) => index > 0 && seen.has(parts.slice(0, index).join("/"))
      )
    )
      diagnostics.push(
        issue(
          "invalid_skill_path",
          "A resource cannot also be a directory.",
          file.path
        )
      );
  }
  if (total > limits.package_bytes)
    diagnostics.push(
      issue(
        "skill_package_too_large",
        `The package exceeds ${limits.package_bytes.toLocaleString()} UTF-8 bytes.`
      )
    );
  const root = draft.files.find((file) => file.path === "SKILL.md");
  if (!root)
    diagnostics.push(
      issue(
        "invalid_skill_entrypoint",
        "The package needs a root SKILL.md.",
        "SKILL.md"
      )
    );
  else {
    try {
      const { metadata, body } = readSkillFrontmatter(
        root.content,
        limits.skill_file_bytes
      );
      if (
        typeof metadata.name !== "string" ||
        metadata.name.length > limits.name_characters ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)
      )
        diagnostics.push(
          issue(
            "invalid_skill_metadata",
            `Use a name with up to ${limits.name_characters} lowercase ASCII letters, digits, and single internal hyphens.`,
            "SKILL.md"
          )
        );
      if (
        typeof metadata.description !== "string" ||
        !metadata.description.trim() ||
        [...metadata.description].length > limits.description_characters
      )
        diagnostics.push(
          issue(
            "invalid_skill_metadata",
            `Add a nonblank description of at most ${limits.description_characters} characters.`,
            "SKILL.md"
          )
        );
      if (!body.trim())
        diagnostics.push(
          issue(
            "invalid_skill_body",
            "Add instructions after the frontmatter.",
            "SKILL.md"
          )
        );
    } catch {
      diagnostics.push(
        issue(
          "invalid_skill_metadata",
          "SKILL.md needs safe, bounded YAML frontmatter with unique keys.",
          "SKILL.md"
        )
      );
    }
  }
  return diagnostics;
}

export function addSkillDraftFile(
  draft: SkillDraft,
  file: SkillFile,
  limits: SkillLimits
): SkillDraft {
  const next = { ...draft, files: [...draft.files, { ...file }] };
  const diagnostics = validateSkillDraft(next, limits).filter(
    (item) =>
      item.path === file.path ||
      item.code === "invalid_skill_path" ||
      item.code === "duplicate_skill_path" ||
      item.code === "too_many_skill_files" ||
      item.code === "skill_package_too_large"
  );
  if (diagnostics.length)
    throw new SkillsApiError(
      422,
      diagnostics[0].code,
      diagnostics[0].message,
      diagnostics
    );
  return next;
}
export function removeSkillDraftFile(
  draft: SkillDraft,
  path: string
): SkillDraft {
  if (path === "SKILL.md")
    throw new Error("The root SKILL.md cannot be removed.");
  return { ...draft, files: draft.files.filter((file) => file.path !== path) };
}

/** Keep unavailable resources visible and require a complete manifest before copying. */
export function assessSystemSkillCopy(
  skill: SystemSkill,
  files: SkillFile[],
  limits: SkillLimits
): SkillDiagnostic[] {
  const diagnostics = [...skill.diagnostics];
  for (const resource of skill.resources) {
    diagnostics.push(...resource.diagnostics);
    if (!resource.copyable && !resource.diagnostics.length)
      diagnostics.push(
        issue(
          "uncopyable_skill_resource",
          "This resource cannot be copied as personal text.",
          resource.path
        )
      );
    if (resource.copyable && !files.some((file) => file.path === resource.path))
      diagnostics.push(
        issue(
          "missing_skill_resource",
          "Read this resource before copying the complete package.",
          resource.path
        )
      );
    if (
      resource.size_bytes !== null &&
      resource.size_bytes >
        (resource.path === "SKILL.md"
          ? limits.skill_file_bytes
          : limits.supporting_file_bytes)
    )
      diagnostics.push(
        issue(
          "skill_file_too_large",
          "This resource exceeds the personal file limit.",
          resource.path
        )
      );
  }
  return [
    ...diagnostics,
    ...validateSkillDraft(
      {
        accountId: "",
        sourceId: null,
        baseRevision: null,
        files,
        baselineFiles: [],
      },
      limits
    ),
  ];
}

/** Copy every supplied resource; invalid packages fail with visible diagnostics. */
export function copySystemSkillDraft(
  accountId: string,
  files: SkillFile[],
  distinctName: string,
  limits: SkillLimits = DEFAULT_SKILL_LIMITS
): SkillDraft {
  const draft: SkillDraft = {
    accountId,
    sourceId: null,
    baseRevision: null,
    files: cloneFiles(files),
    baselineFiles: [],
  };
  const root = draft.files.find((file) => file.path === "SKILL.md");
  if (!root)
    throw new SkillsApiError(
      422,
      "invalid_skill_entrypoint",
      "The package needs a root SKILL.md.",
      [issue("invalid_skill_entrypoint", "Missing root SKILL.md.", "SKILL.md")]
    );
  try {
    const { metadata, body } = readSkillFrontmatter(
      root.content,
      limits.skill_file_bytes
    );
    if (distinctName === metadata.name)
      throw new Error("Choose a distinct name for your personal copy.");
    if (
      distinctName.length > limits.name_characters ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(distinctName)
    )
      throw new Error("Choose a valid lowercase skill name.");
    root.content = `---\n${dump(
      { ...metadata, name: distinctName },
      { noRefs: true, lineWidth: -1 }
    )}---\n${body}`;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not copy skill frontmatter.";
    throw new SkillsApiError(422, "invalid_skill_metadata", message, [
      issue("invalid_skill_metadata", message, "SKILL.md"),
    ]);
  }
  const diagnostics = validateSkillDraft(draft, limits);
  if (diagnostics.length)
    throw new SkillsApiError(
      422,
      diagnostics[0].code,
      diagnostics[0].message,
      diagnostics
    );
  return draft;
}
