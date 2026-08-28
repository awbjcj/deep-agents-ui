"use client";

import React from "react";
import { AttachmentChip } from "@/app/components/AttachmentChip";
import type { AttachmentState } from "@/app/hooks/useAttachments";

interface Props {
  items: AttachmentState[];
  onRemove: (localId: string) => void;
}

export const AttachmentsRow = React.memo<Props>(({ items, onRemove }) => {
  if (items.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="Attachments"
      className="flex flex-wrap gap-2 border-b border-border/70 bg-muted/15 px-[18px] py-2.5"
    >
      {items.map((item) => (
        <AttachmentChip
          key={item.localId}
          item={item}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
});

AttachmentsRow.displayName = "AttachmentsRow";
