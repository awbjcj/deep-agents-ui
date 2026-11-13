import type { ReactNode } from "react";
import { FolderGit2 } from "lucide-react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Fixed chrome and one scrolling content area follow the settings panel layout. */
export function WorkspaceDialog({ children }: { children: ReactNode }) {
  return (
    <DialogContent
      className="flex h-[calc(100dvh-2rem)] max-h-[48rem] max-w-[calc(100%-1rem)] !animate-none flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl [&_button:focus-visible]:transform-none [&_button:focus-visible]:transition-none [&_p]:mb-0"
      overlayClassName="!animate-none"
    >
      <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-4 pr-12 text-left sm:px-6 sm:pr-14">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <FolderGit2
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />{" "}
          Repository workspace
        </DialogTitle>
        <DialogDescription className="text-xs leading-relaxed sm:text-sm">
          Prepare source revisions together, then investigate them in this
          conversation.
        </DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  );
}
