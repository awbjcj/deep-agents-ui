/**
 * Submit options that continue a thread from the server's latest checkpoint.
 *
 * Chat uploads, attachment deletes and file edits can advance the thread
 * outside the chat stream without refreshing locally cached history. Explicit
 * `checkpoint: null` tells the SDK to continue from the server's real head,
 * protecting those writes even if SDK checkpoint defaults change.
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
