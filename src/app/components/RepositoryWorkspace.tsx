"use client";

import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { WorkspaceDialog } from "./code-workspace/WorkspaceDialog";
import { WorkspaceFlow } from "./code-workspace/WorkspaceFlow";

/** Open the repository workflow without sending a chat message. */
export function RepositoryWorkspace({
  threadId,
  accountId,
  ensureThreadId,
  chatBusy,
  onJobSubmitted,
}: {
  threadId: string | null;
  accountId: string;
  ensureThreadId: () => Promise<string>;
  chatBusy: boolean;
  onJobSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [threadError, setThreadError] = useState(false);
  async function createConversation() {
    if (threadId || creating) return;
    setCreating(true);
    setThreadError(false);
    try {
      await ensureThreadId();
    } catch {
      setThreadError(true);
    } finally {
      setCreating(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void createConversation();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="min-h-touch text-muted-foreground hover:text-foreground"
        >
          <FolderGit2 aria-hidden="true" /> Repository workspace
        </Button>
      </DialogTrigger>
      {threadId ? (
        <WorkspaceFlow
          key={`${accountId}:${threadId}`}
          threadId={threadId}
          accountId={accountId}
          open={open}
          chatBusy={chatBusy}
          onJobSubmitted={onJobSubmitted}
        />
      ) : (
        <WorkspaceDialog>
          <div className="p-4 sm:p-6">
            {threadError ? (
              <div
                role="alert"
                className="space-y-3 text-sm"
              >
                <p>Couldn’t create a conversation for this workspace.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-touch"
                  onClick={() => void createConversation()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <p
                role="status"
                className="text-sm text-muted-foreground"
              >
                Opening the conversation…
              </p>
            )}
          </div>
        </WorkspaceDialog>
      )}
    </Dialog>
  );
}
