"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOURCE_IMAGE_LABELS,
  type SourceImagePolicy,
  type SourceImagePolicyEdit,
  type SourceImageSource,
} from "@/lib/source-images";

interface SourceAttachmentControlProps {
  tier: string;
  source: SourceImageSource;
  policy: SourceImagePolicy;
  isSaving: boolean;
  onChange: (edit: SourceImagePolicyEdit) => void;
}

const PERMISSIONS = [
  { field: "enabled", title: "Images", hint: "images" },
  { field: "documents_enabled", title: "Documents", hint: "documents" },
] as const;

const switchClassName =
  "relative border-muted-foreground before:absolute before:-inset-x-1 before:-inset-y-3 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none [&>span]:motion-reduce:transition-none";

/** Independent grants with scope shared by images and documents. */
export function SourceAttachmentControl({
  tier,
  source,
  policy,
  isSaving,
  onChange,
}: SourceAttachmentControlProps) {
  const id = `source-images-${tier}-${source}`;
  const label = SOURCE_IMAGE_LABELS[source];
  const scopeDisabled =
    isSaving || (!policy.enabled && !policy.documents_enabled);

  return (
    <div className="grid min-w-0 grid-cols-2 items-end gap-x-5 gap-y-1 @2xl/permissions:grid-cols-[1fr_1fr_1.3fr_1fr]">
      {PERMISSIONS.map(({ field, title, hint }) => (
        <div
          key={field}
          className="flex min-w-0 items-center gap-3"
        >
          <Label
            htmlFor={`${id}-${field}`}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center text-xs font-medium leading-5"
          >
            {title}
            <span
              aria-hidden="true"
              className="text-xs font-normal text-muted-foreground"
            >
              {policy[field] ? "On" : "Off"}
            </span>
          </Label>
          <Switch
            id={`${id}-${field}`}
            className={switchClassName}
            checked={Boolean(policy[field])}
            disabled={isSaving}
            onCheckedChange={(value) => onChange({ field, value })}
            aria-label={`${label} ${title.toLowerCase()} for ${tier} tier`}
            aria-describedby={`source-attachment-${hint}-${tier}`}
          />
        </div>
      ))}
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={`${id}-default`}
          className="text-xs font-medium"
        >
          Default fetch
        </Label>
        <Select
          value={policy.default_scope}
          disabled={scopeDisabled}
          onValueChange={(value: "embedded" | "all") =>
            onChange({ field: "default_scope", value })
          }
        >
          <SelectTrigger
            id={`${id}-default`}
            className="h-auto min-h-11 min-w-0 gap-1 border-muted-foreground bg-background px-2 text-left text-xs shadow-none focus:ring-ring [&>span]:line-clamp-none [&>span]:whitespace-normal"
            aria-label={`Default ${label} attachment fetch for ${tier} tier`}
            aria-describedby={`source-attachment-scope-${tier}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="embedded">Embedded only</SelectItem>
            <SelectItem value="all">All attachments</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-h-11 min-w-0 items-center gap-3">
        <Label
          htmlFor={`${id}-allow-all`}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center text-xs font-medium leading-5"
        >
          Allow all
          <span
            aria-hidden="true"
            className="text-xs font-normal text-muted-foreground"
          >
            {policy.allow_all ? "On" : "Off"}
          </span>
        </Label>
        <Switch
          id={`${id}-allow-all`}
          className={switchClassName}
          checked={policy.allow_all}
          disabled={scopeDisabled}
          onCheckedChange={(value) => onChange({ field: "allow_all", value })}
          aria-label={`Allow all ${label} attachments for ${tier} tier`}
          aria-describedby={`source-attachment-scope-${tier}`}
        />
      </div>
      <span
        role="status"
        className="sr-only"
      >
        {isSaving ? `Saving ${label} attachment permissions` : ""}
      </span>
    </div>
  );
}
