"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImagePreview } from "./ImagePreview";

export function ImagePreviewDialog({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: React.ReactElement;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] min-w-0 max-w-none flex-col gap-3 p-3 transition-none sm:max-w-none sm:p-4">
        <DialogTitle className="truncate pr-10 text-base">
          {alt || "Image preview"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Zoom, fit to window, or fit to width to inspect this image.
        </DialogDescription>
        <div className="min-h-0 flex-1">
          <ImagePreview
            src={src}
            alt={alt}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
