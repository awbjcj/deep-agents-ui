import type { LibraryShelf } from "@/lib/library-admin";

/** Match shelf metadata using the same forgiving search semantics as indices. */
export function filterShelves(
  shelves: readonly LibraryShelf[],
  query: string
): LibraryShelf[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return shelves as LibraryShelf[];

  return shelves.filter((shelf) =>
    [shelf.shelf_id, shelf.index_name, shelf.source_type, shelf.description]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(needle))
  );
}
