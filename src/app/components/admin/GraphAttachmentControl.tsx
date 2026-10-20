"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  graphAttachmentMode,
  type GraphAttachmentMode,
  type SourceImagePolicy,
} from "@/lib/source-images";

interface GraphAttachmentControlProps {
  tier: string;
  policy: SourceImagePolicy;
  isSaving: boolean;
  onChange: (mode: GraphAttachmentMode) => void;
}

/** One explicit attachment mode, with an honest label for older custom policies. */
export function GraphAttachmentControl({
  tier,
  policy,
  isSaving,
  onChange,
}: GraphAttachmentControlProps) {
  const id = `source-images-${tier}-graph-mode`;
  const mode = graphAttachmentMode(policy);

  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-xs font-medium"
      >
        Attachment access
      </Label>
      <Select
        value={mode}
        onValueChange={(value) => {
          if (value === "none" || value === "embedded" || value === "all") {
            onChange(value);
          }
        }}
        disabled={isSaving}
      >
        <SelectTrigger
          id={id}
          className="h-10 w-full min-w-0 border-border/70 bg-background text-xs shadow-none"
          aria-label={`Microsoft Graph attachment access for ${tier} tier`}
          aria-describedby={`${id}-description`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {mode === "custom" && (
            <SelectItem
              value="custom"
              disabled
            >
              Embedded default · all on request
            </SelectItem>
          )}
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="embedded">Embedded only</SelectItem>
          <SelectItem value="all">All attachments</SelectItem>
        </SelectContent>
      </Select>
      <p
        id={`${id}-description`}
        className="text-xs leading-relaxed text-muted-foreground"
      >
        Applies to images and documents. Embedded includes inline email files
        and files referenced in Teams messages. Images also require the user’s
        image opt-in.
      </p>
      <span
        role="status"
        className="sr-only"
      >
        {isSaving ? "Saving attachment access" : ""}
      </span>
    </div>
  );
}
