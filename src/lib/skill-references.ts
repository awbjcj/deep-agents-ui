import type { SkillCatalogEntry } from "./skills";

/** Offsets refer to the visible message text, including the leading dollar. */
export interface SkillReference {
  id: string;
  origin: SkillCatalogEntry["origin"];
  name: string;
  start: number;
  end: number;
}

export interface SkillQuery {
  start: number;
  end: number;
  query: string;
}

export const MAX_SKILL_REFERENCES = 20;

const nameCharacter = /[\p{L}\p{N}_:-]/u;

function intact(text: string, reference: SkillReference): boolean {
  return (
    Number.isInteger(reference.start) &&
    Number.isInteger(reference.end) &&
    reference.start >= 0 &&
    reference.end <= text.length &&
    text.slice(reference.start, reference.end) === `$${reference.name}` &&
    (reference.start === 0 || /[\s([{]/.test(text[reference.start - 1])) &&
    (reference.end === text.length || !nameCharacter.test(text[reference.end]))
  );
}

export function activeSkillQuery(
  text: string,
  caret: number,
  references: SkillReference[]
): SkillQuery | null {
  if (references.some((ref) => caret > ref.start && caret <= ref.end))
    return null;
  const match = /(?:^|[\s([{])\$([^\r\n$]*)$/u.exec(text.slice(0, caret));
  if (!match) return null;
  const start = caret - match[1].length - 1;
  if (references.some((ref) => ref.start === start)) return null;
  return {
    start,
    end: caret,
    query: match[1],
  };
}

export function searchSkills(entries: SkillCatalogEntry[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return entries
    .filter(
      (entry) =>
        entry.availability === "available" &&
        `${entry.name} ${entry.description}`
          .toLocaleLowerCase()
          .includes(needle)
    )
    .sort((a, b) => {
      const aName = a.name.toLocaleLowerCase().startsWith(needle);
      const bName = b.name.toLocaleLowerCase().startsWith(needle);
      return Number(bName) - Number(aName) || a.name.localeCompare(b.name);
    });
}

/** Preserve selections outside an edit; editing a token makes it plain text. */
export function reconcileSkillReferences(
  before: string,
  after: string,
  references: SkillReference[]
): SkillReference[] {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return references.flatMap((ref) => {
    const next =
      ref.end <= start
        ? ref
        : ref.start >= oldEnd
        ? { ...ref, start: ref.start + delta, end: ref.end + delta }
        : null;
    return next && intact(after, next) ? [next] : [];
  });
}

export function insertSkillReference(
  text: string,
  query: SkillQuery,
  skill: SkillCatalogEntry,
  references: SkillReference[]
) {
  const token = `$${skill.name}`;
  const suffix = text.slice(query.end);
  const separator = suffix.startsWith(" ") ? "" : " ";
  const next = text.slice(0, query.start) + token + separator + suffix;
  const reference: SkillReference = {
    id: skill.id,
    origin: skill.origin,
    name: skill.name,
    start: query.start,
    end: query.start + token.length,
  };
  return {
    text: next,
    caret: reference.end + 1,
    references: [
      ...reconcileSkillReferences(text, next, references),
      reference,
    ].sort((a, b) => a.start - b.start),
  };
}

export function submittedSkillReferences(
  text: string,
  references: SkillReference[]
): SkillReference[] {
  const trim = text.length - text.trimStart().length;
  return references
    .filter((ref) => intact(text, ref))
    .map((ref) => ({ ...ref, start: ref.start - trim, end: ref.end - trim }));
}

/** Validate persisted message metadata before using it to highlight history. */
export function parseSkillReferences(
  raw: unknown,
  text: string
): SkillReference[] {
  if (!Array.isArray(raw)) return [];
  let previousEnd = 0;
  return raw.filter((value): value is SkillReference => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      !["personal", "system"].includes(value.origin) ||
      !intact(text, value) ||
      value.start < previousEnd
    )
      return false;
    previousEnd = value.end;
    return true;
  });
}
