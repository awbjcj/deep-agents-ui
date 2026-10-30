"use client";

import React from "react";
import { AttachmentChip } from "@/app/components/AttachmentChip";
import type { AttachmentState } from "@/app/hooks/useAttachments";

interface Props {
  items: AttachmentState[];
  onRemove: (localId: string) => void;
  disabled?: boolean;
}

export const AttachmentsRow = React.memo<Props>(
  ({ items, onRemove, disabled }) => {
    if (items.length === 0) return null;
    return (
      <div
        role="list"
        aria-label="Attachments"
        className="flex flex-wrap gap-2 border-b border-border/70 px-4 py-3"
      >
        {items.map((item) => (
          <AttachmentChip
            key={item.localId}
            item={item}
            onRemove={onRemove}
            disabled={disabled}
          />
        ))}
      </div>
    );
  }
);

AttachmentsRow.displayName = "AttachmentsRow";
