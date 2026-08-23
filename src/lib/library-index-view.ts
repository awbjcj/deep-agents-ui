import type { LibraryIndexSummary } from "@/lib/library-admin";

export type IndexSortKey = "health" | "name" | "docs" | "size";

/** Sort options in the order the picker offers them. */
export const INDEX_SORT_OPTIONS: ReadonlyArray<{
  value: IndexSortKey;
  label: string;
}> = [
  { value: "health", label: "Health" },
  { value: "name", label: "Name" },
  { value: "docs", label: "Documents" },
  { value: "size", label: "Store size" },
];

// Unhealthy first: at a few hundred indices the operator is looking for the
// handful that need attention, not browsing the alphabet.
const HEALTH_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2 };

export function healthRank(health: string): number {
  return HEALTH_RANK[health] ?? 3;
}

/** Case-insensitive substring match on the index name. */
export function filterIndices(
  indices: readonly LibraryIndexSummary[],
  query: string
): LibraryIndexSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return indices as LibraryIndexSummary[];
  return indices.filter((index) => index.name.toLowerCase().includes(needle));
}

/**
 * Sort a copy of the list. `name` is ascending; every other key is descending,
 * because "biggest", "busiest", and "worst health" are what an operator scans
 * for. Ties always fall back to the name so the order is stable across reloads.
 */
export function sortIndices(
  indices: readonly LibraryIndexSummary[],
  key: IndexSortKey
): LibraryIndexSummary[] {
  const byName = (a: LibraryIndexSummary, b: LibraryIndexSummary) =>
    a.name.localeCompare(b.name);
  return [...indices].sort((a, b) => {
    switch (key) {
      case "docs":
        return b.doc_count - a.doc_count || byName(a, b);
      case "size":
        return b.store_size_bytes - a.store_size_bytes || byName(a, b);
      case "health":
        return healthRank(a.health) - healthRank(b.health) || byName(a, b);
      default:
        return byName(a, b);
    }
  });
}

/** Aggregate footer numbers for whatever subset is currently on screen. */
export function summarizeIndices(indices: readonly LibraryIndexSummary[]): {
  documents: number;
  bytes: number;
} {
  let documents = 0;
  let bytes = 0;
  for (const index of indices) {
    documents += index.doc_count;
    bytes += index.store_size_bytes;
  }
  return { documents, bytes };
}

/** Below this a shared prefix is too short to be worth dimming. */
const MIN_PREFIX_LENGTH = 4;

/**
 * The longest prefix shared by every name, trimmed back to a token boundary.
 *
 * Managed indices are generated from one naming scheme, so most of a 90
 * character name is noise repeated on every row. Returning it lets the list
 * render the shared half dimmed and the distinguishing half at full contrast.
 * Returns "" whenever collapsing would hide more than it reveals — a single
 * index, no boundary to cut on, or a prefix that swallows a whole name.
 */
export function commonIndexPrefix(names: readonly string[]): string {
  if (names.length < 2) return "";

  let prefix = names[0];
  for (const name of names) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return "";
  }

  // Cut back to a separator so the emphasised remainder starts on a token
  // boundary instead of mid-word.
  const boundary = Math.max(
    prefix.lastIndexOf("_"),
    prefix.lastIndexOf("-"),
    prefix.lastIndexOf(".")
  );
  if (boundary <= 0) return "";
  prefix = prefix.slice(0, boundary + 1);

  if (prefix.length < MIN_PREFIX_LENGTH) return "";
  // A row whose whole name is the prefix would render as blank.
  if (names.some((name) => name.length <= prefix.length)) return "";
  return prefix;
}
