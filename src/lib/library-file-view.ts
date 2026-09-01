import type { LibraryFile } from "@/lib/library-admin";

/**
 * Deterministic newest-first ordering for shelf file inventory.
 *
 * Files uploaded within the same timestamp resolution are tie-broken by
 * `file_id` so the list order is reproducible across renders. This is not a
 * stable sort: equal timestamps are reordered by id rather than keeping the
 * order they arrived in.
 */
export function sortLibraryFiles(files: readonly LibraryFile[]): LibraryFile[] {
  return [...files].sort(
    (left, right) =>
      right.uploaded_at.localeCompare(left.uploaded_at) ||
      right.file_id.localeCompare(left.file_id)
  );
}
