import type { ReactNode, Ref } from "react";
import { ClipboardList } from "lucide-react";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RequestDialogHeader({
  title,
  description,
  titleRef,
}: {
  title: string;
  description: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <DialogHeader className="border-border/70 flex-row items-start gap-3 border-b pr-9 pb-4">
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <ClipboardList
          className="size-4"
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 space-y-1 wrap-anywhere">
        <DialogTitle
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="leading-snug"
        >
          {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
    </DialogHeader>
  );
}
