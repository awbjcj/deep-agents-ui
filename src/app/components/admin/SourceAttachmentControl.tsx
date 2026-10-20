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
  {
    field: "enabled",
    title: "Images",
    description: "Requires user image opt-in",
  },
  {
    field: "documents_enabled",
    title: "Documents",
    description: "Download & convert · up to 10 MB",
  },
] as const;

/** The same independent grants and shared scope controls for every source. */
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {PERMISSIONS.map(({ field, title, description }) => (
        <div
          key={field}
          className="min-w-0"
        >
          <div className="flex min-h-9 items-center justify-between gap-2">
            <Label
              htmlFor={`${id}-${field}`}
              className="text-xs font-medium"
            >
              {title}
            </Label>
            <Switch
              id={`${id}-${field}`}
              checked={Boolean(policy[field])}
              disabled={isSaving}
              onCheckedChange={(value) => onChange({ field, value })}
              aria-label={`${label} ${title.toLowerCase()} for ${tier} tier`}
              aria-describedby={`${id}-${field}-description`}
            />
          </div>
          <p
            id={`${id}-${field}-description`}
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            {description}
          </p>
        </div>
      ))}
      <div className="min-w-0 space-y-1.5">
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
            className="h-9 min-w-0 gap-1 border-border/70 bg-background px-2 text-[11px] shadow-none [&>svg]:h-3 [&>svg]:w-3"
            aria-label={`Default ${label} attachment fetch for ${tier} tier`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="embedded">Embedded only</SelectItem>
            <SelectItem value="all">All attachments</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label
          htmlFor={`${id}-allow-all`}
          className="text-xs font-medium"
        >
          Allow all
        </Label>
        <div className="flex h-9 items-center">
          <Switch
            id={`${id}-allow-all`}
            checked={policy.allow_all}
            disabled={scopeDisabled}
            onCheckedChange={(value) => onChange({ field: "allow_all", value })}
            aria-label={`Allow all ${label} attachments for ${tier} tier`}
            aria-describedby={`source-attachment-scope-${tier}`}
          />
        </div>
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
