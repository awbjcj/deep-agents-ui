/** Notify the active chat when a background operation changes persisted files. */
export const CONVERSATION_FILES_CHANGED_EVENT =
  "vsda:conversation-files-changed";

export function notifyConversationFilesChanged(threadId: string): void {
  window.dispatchEvent(
    new CustomEvent(CONVERSATION_FILES_CHANGED_EVENT, { detail: { threadId } })
  );
}
