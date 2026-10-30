"use client";

import { CornerDownLeft, ListPlus, type LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MessageDelivery } from "@/lib/message-delivery";
import {
  COMPOSER_OPTION_ROW,
  COMPOSER_TRIGGER,
  ComposerMenuOption,
  OPTION_TILE_TONE,
  TRIGGER_TONE,
} from "./ComposerMenuOption";

const OPTIONS: Record<
  MessageDelivery,
  { label: string; summary: string; icon: LucideIcon }
> = {
  queue: {
    label: "Queue",
    summary: "Send after this response finishes.",
    icon: ListPlus,
  },
  steer: {
    label: "Steer",
    summary: "Interrupt the response and send now.",
    icon: CornerDownLeft,
  },
};

/** Choose whether a draft written during a run is queued or steers it now. */
export function DeliveryModeControl({
  value,
  onChange,
}: {
  value: MessageDelivery;
  onChange: (value: MessageDelivery) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as MessageDelivery)}
    >
      <SelectTrigger
        aria-label="Message delivery"
        title="Choose when to send"
        className={cn(COMPOSER_TRIGGER, TRIGGER_TONE.neutral, "px-2.5")}
      >
        <SelectValue>{OPTIONS[value].label}</SelectValue>
      </SelectTrigger>
      <SelectContent
        side="top"
        align="end"
        className="w-64 !animate-none rounded-xl"
      >
        {(Object.keys(OPTIONS) as MessageDelivery[]).map((option) => (
          <SelectItem
            key={option}
            value={option}
            textValue={OPTIONS[option].label}
            indicator={false}
            className={COMPOSER_OPTION_ROW}
          >
            <ComposerMenuOption
              icon={OPTIONS[option].icon}
              label={OPTIONS[option].label}
              summary={OPTIONS[option].summary}
              tileClassName={OPTION_TILE_TONE.primary}
            />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
