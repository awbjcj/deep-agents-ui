"use client";

import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ImageOff,
  Maximize,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SCALES = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const PADDING = 16;
type View = { mode: "fit" | "width" } | { mode: "scale"; scale: number };
type Size = { width: number; height: number };

/** A new source resets load status, zoom, and scroll even for live file updates. */
export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <ImagePreviewSession
      key={src}
      src={src}
      alt={alt}
    />
  );
}

function ImagePreviewSession({ src, alt }: { src: string; alt: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>({ mode: "fit" });
  const helpId = useId();
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  function readImage(image: HTMLImageElement) {
    if (image.naturalWidth && image.naturalHeight) {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setError(false);
    } else {
      setImageSize(null);
      setError(true);
    }
  }

  useEffect(() => {
    // Cached/data images can finish before React attaches the load handler.
    if (imageRef.current?.complete) readImage(imageRef.current);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      setViewportSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const ready =
    !!imageSize && viewportSize.width > 0 && viewportSize.height > 0;
  const widthScale = imageSize
    ? Math.max(1, viewportSize.width - PADDING * 2) / imageSize.width
    : 1;
  const heightScale = imageSize
    ? Math.max(1, viewportSize.height - PADDING * 2) / imageSize.height
    : 1;
  const scale =
    view.mode === "scale"
      ? view.scale
      : view.mode === "width"
      ? widthScale
      : Math.min(1, widthScale, heightScale);
  const imageWidth = (imageSize?.width ?? 0) * scale;
  const imageHeight = (imageSize?.height ?? 0) * scale;
  const imageLeft = Math.max(PADDING, (viewportSize.width - imageWidth) / 2);
  const imageTop = Math.max(PADDING, (viewportSize.height - imageHeight) / 2);
  const canPan =
    ready &&
    (imageWidth + PADDING * 2 > viewportSize.width ||
      imageHeight + PADDING * 2 > viewportSize.height);

  function setScale(next: number) {
    const viewport = viewportRef.current;
    if (!ready || !viewport) return;
    const clamped = Math.min(8, Math.max(0.1, next));
    if (clamped === scale && view.mode === "scale") return;
    // Keep the detail at the center of the viewport in view when scaling.
    anchorRef.current = {
      x: (viewport.scrollLeft + viewport.clientWidth / 2 - imageLeft) / scale,
      y: (viewport.scrollTop + viewport.clientHeight / 2 - imageTop) / scale,
    };
    setView({ mode: "scale", scale: clamped });
  }

  function zoom(direction: 1 | -1) {
    const next =
      direction === 1
        ? SCALES.find((value) => value > scale + 0.001) ?? 8
        : SCALES.findLast((value) => value < scale - 0.001) ?? 0.1;
    setScale(next);
  }

  function fit(mode: "fit" | "width") {
    anchorRef.current = null;
    viewportRef.current?.scrollTo(0, 0);
    setView({ mode });
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const anchor = anchorRef.current;
    if (anchor) {
      viewport.scrollLeft =
        anchor.x * scale + imageLeft - viewport.clientWidth / 2;
      viewport.scrollTop =
        anchor.y * scale + imageTop - viewport.clientHeight / 2;
      anchorRef.current = null;
    } else if (view.mode !== "scale") {
      viewport.scrollTo(0, 0);
    }
  }, [scale, imageLeft, imageTop, view.mode]);

  const percentage = Math.round(scale * 100);
  const selectValue = view.mode === "scale" ? String(view.scale) : view.mode;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/20">
      <div
        role="group"
        aria-label="Image preview controls"
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-background p-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          title="Zoom out (−)"
          disabled={!ready || scale <= 0.1}
          onClick={() => zoom(-1)}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <Select
          value={selectValue}
          onValueChange={(value) => setScale(Number(value))}
          disabled={!ready}
        >
          <SelectTrigger
            aria-label="Image scale"
            className="h-9 w-24 tabular-nums"
          >
            <SelectValue>{ready ? `${percentage}%` : "—"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {view.mode !== "scale" && (
                <SelectItem
                  value={view.mode}
                  disabled
                >
                  {view.mode === "fit" ? "Fit" : "Fit width"}: {percentage}%
                </SelectItem>
              )}
              {SCALES.map((value) => (
                <SelectItem
                  key={value}
                  value={String(value)}
                >
                  {Math.round(value * 100)}%
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          title="Zoom in (+)"
          disabled={!ready || scale >= 8}
          onClick={() => zoom(1)}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant={view.mode === "fit" ? "secondary" : "ghost"}
            size="sm"
            aria-label="Fit to window"
            aria-pressed={view.mode === "fit"}
            title="Fit to window (F)"
            disabled={!ready}
            onClick={() => fit("fit")}
          >
            <Maximize aria-hidden="true" />
            Fit
          </Button>
          <Button
            type="button"
            variant={view.mode === "width" ? "secondary" : "ghost"}
            size="sm"
            aria-label="Fit to width"
            aria-pressed={view.mode === "width"}
            title="Fit to width (W)"
            disabled={!ready}
            onClick={() => fit("width")}
          >
            <MoveHorizontal aria-hidden="true" />
            Fit width
          </Button>
        </div>
      </div>
      <div
        ref={viewportRef}
        role="region"
        aria-label="Image preview"
        aria-describedby={helpId}
        aria-busy={!ready && !error}
        tabIndex={0}
        className={cn(
          "relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          canPan && "cursor-grab active:cursor-grabbing"
        )}
        style={{ scrollbarGutter: "stable" }}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            !ready
          )
            return;
          switch (event.key.toLowerCase()) {
            case "+":
            case "=":
              zoom(1);
              break;
            case "-":
              zoom(-1);
              break;
            case "0":
              setScale(1);
              break;
            case "f":
              fit("fit");
              break;
            case "w":
              fit("width");
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          // Touch keeps native scrolling and browser pinch-to-zoom.
          if (!canPan || event.button !== 0 || event.pointerType === "touch")
            return;
          const viewport = event.currentTarget;
          viewport.focus({ preventScroll: true });
          viewport.setPointerCapture(event.pointerId);
          dragRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== event.pointerId) return;
          event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
          event.currentTarget.scrollTop = drag.top + drag.y - event.clientY;
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
      >
        {!ready && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"
          >
            {error && (
              <ImageOff
                aria-hidden="true"
                className="size-6"
              />
            )}
            {error ? "Image failed to load" : "Loading image…"}
          </div>
        )}
        <div
          className="relative min-h-full min-w-full"
          style={{
            width: ready ? imageWidth + PADDING * 2 : undefined,
            height: ready ? imageHeight + PADDING * 2 : undefined,
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(event) => readImage(event.currentTarget)}
            onError={() => {
              setImageSize(null);
              setError(true);
            }}
            className="absolute block max-w-none select-none rounded-sm bg-background shadow-sm"
            style={{
              width: imageWidth,
              height: imageHeight,
              left: imageLeft,
              top: imageTop,
              visibility: ready ? "visible" : "hidden",
            }}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <span id={helpId}>
          Scroll or drag to pan · + / − zoom · 0 actual size · F fit
        </span>
        <span
          role="status"
          className="tabular-nums"
        >
          {ready && `${imageSize.width} × ${imageSize.height} · ${percentage}%`}
        </span>
      </div>
    </div>
  );
}
