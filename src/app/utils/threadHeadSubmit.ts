/**
 * Submit options that continue a thread from the server's latest checkpoint.
 *
 * With `fetchStateHistory` enabled, `useStream().submit` otherwise pins every
 * run to the head of its locally cached history. Chat uploads, attachment
 * deletes and file edits advance the thread outside the chat stream without
 * refreshing that cache, so a pinned run forks from the stale checkpoint and
 * silently drops those writes -- an uploaded image disappears from
 * `state.files` even though its upload succeeded. `checkpoint: null` tells the
 * SDK to omit the checkpoint so the server resumes from its real head.
 *
 * Use this for every submit that continues the live conversation. Only
 * deliberate rewinds (retrying from a chosen message) pass an explicit
 * checkpoint instead.
 */
export function fromLatestCheckpoint<T extends object>(
  options: T
): T & { checkpoint: null } {
  return { ...options, checkpoint: null };
}
