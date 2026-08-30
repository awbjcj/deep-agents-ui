import type { LibraryFile } from "@/lib/library-admin";

/** Human-readable byte count for compact file rows. */
export function formatLibraryFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Stable newest-first ordering for shelf file inventory. */
export function sortLibraryFiles(files: readonly LibraryFile[]): LibraryFile[] {
  return [...files].sort(
    (left, right) =>
      right.uploaded_at.localeCompare(left.uploaded_at) ||
      right.file_id.localeCompare(left.file_id)
  );
}
