import { shiftSpans, spansOverlap, type TextSpan } from "./reference-spans";
import type { SkillCatalogEntry } from "./skills";

/** Offsets refer to the visible name, including a dollar prefix when present. */
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

const nameCharacter = /[\p{L}\p{M}\p{N}_:-]/u;

function intact(text: string, reference: SkillReference): boolean {
  if (
    !Number.isInteger(reference.start) ||
    !Number.isInteger(reference.end) ||
    reference.start < 0 ||
    reference.end > text.length ||
    reference.end <= reference.start
  )
    return false;
  const token = text.slice(reference.start, reference.end);
  const prefixed = token.startsWith("$");
  const nextCharacter = String.fromCodePoint(
    text.codePointAt(reference.end) ?? 0
  );
  return (
    (prefixed ? token.slice(1) : token).toLowerCase() ===
      reference.name.toLowerCase() &&
    (reference.start === 0 ||
      (prefixed ? /[\s([{]/u : /[\s([{'"“‘，、。！？；：]/u).test(
        text[reference.start - 1]
      )) &&
    (reference.end === text.length || !nameCharacter.test(nextCharacter)) &&
    !/[\\/]/u.test(text[reference.end] ?? "") &&
    !(
      text[reference.end] === "." &&
      nameCharacter.test(text[reference.end + 1] ?? "")
    )
  );
}

/**
 * Resolve exact catalog names without changing text or guessing ambiguous IDs.
 * `excluded` spans (such as `@file` mentions) are never matched as skills.
 */
export function matchSkillReferences(
  text: string,
  entries: SkillCatalogEntry[],
  selected: SkillReference[] = [],
  excluded: TextSpan[] = []
): SkillReference[] {
  const references = selected
    .filter((ref) => intact(text, ref))
    .slice(0, MAX_SKILL_REFERENCES);
  const names = new Map<string, SkillCatalogEntry | null>();
  for (const entry of entries) {
    if (entry.availability !== "available" || !entry.name) continue;
    const name = entry.name.toLowerCase();
    const previous = names.get(name);
    names.set(
      name,
      previous === undefined ||
        (previous?.id === entry.id && previous.origin === entry.origin)
        ? entry
        : null
    );
  }
  const candidates = [...names.keys()].filter((name) => names.get(name));
  if (!candidates.length) return references.sort((a, b) => a.start - b.start);
  const pattern = candidates
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  // Code, URLs, and email addresses describe literal content rather than skills.
  const literals = [
    ...text.matchAll(
      /(`+)[\s\S]*?(?:\1|$)|(~{3,})[\s\S]*?(?:\2|$)|(?:https?:\/\/|www\.)\S+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+/gu
    ),
  ]
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
    .concat(excluded);
  for (const match of text.matchAll(new RegExp(`\\$?(?:${pattern})`, "giu"))) {
    if (references.length >= MAX_SKILL_REFERENCES) break;
    const token = match[0];
    // Numeric skill names remain available through explicit dollar mentions.
    if (!token.startsWith("$") && !/\p{L}/u.test(token)) continue;
    const entry = names.get(token.replace(/^\$/, "").toLowerCase());
    if (!entry) continue;
    const reference = {
      id: entry.id,
      origin: entry.origin,
      name: entry.name,
      start: match.index,
      end: match.index + token.length,
    };
    if (
      intact(text, reference) &&
      ![...references, ...literals].some((span) =>
        spansOverlap(reference, span)
      )
    )
      references.push(reference);
  }
  return references.sort((a, b) => a.start - b.start);
}

/**
 * Find the `$` query ending at the caret. `blocked` spans (such as `@file`
 * mentions) may neither contain the caret nor fall inside the query.
 */
export function activeSkillQuery(
  text: string,
  caret: number,
  references: TextSpan[],
  blocked: TextSpan[] = []
): SkillQuery | null {
  if (
    [...references, ...blocked].some(
      (ref) => caret > ref.start && caret <= ref.end
    )
  )
    return null;
  const match = /(?:^|[\s([{])\$([^\r\n$]*)$/u.exec(text.slice(0, caret));
  if (!match) return null;
  const start = caret - match[1].length - 1;
  if (references.some((ref) => ref.start === start)) return null;
  if (blocked.some((span) => spansOverlap(span, { start, end: caret })))
    return null;
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
  return shiftSpans(before, after, references, intact);
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
