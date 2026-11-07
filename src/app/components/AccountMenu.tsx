"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, Moon, Sun, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/app/utils/roles";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Account and appearance actions stay reachable at every screen width. */
export function AccountMenu({
  onOpenSettings,
  onBeforeSignOut,
}: {
  onOpenSettings?: () => void;
  onBeforeSignOut?: () => boolean;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastItem = useRef(false);
  const id = useId();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items =
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    (lastItem.current ? items?.[items.length - 1] : items?.[0])?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const initial = user.username.slice(0, 1).toUpperCase();

  const signOut = () => {
    if (onBeforeSignOut && !onBeforeSignOut()) return;
    setOpen(false);
    logout();
  };

  return (
    <>
      <div
        ref={menuRef}
        className="relative z-[70]"
      >
        <Button
          ref={triggerRef}
          id={`${id}-trigger`}
          variant="outline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            lastItem.current = false;
            setOpen((value) => !value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              lastItem.current = event.key === "ArrowUp";
              setOpen(true);
            }
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? `${id}-menu` : undefined}
          aria-label={`Account menu for ${user.username}`}
          className={cn(
            "min-h-touch gap-2 pl-2 pr-3 transition-colors",
            open && "bg-accent text-accent-foreground ring-1 ring-border"
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initial}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </Button>

        {open && (
          <div
            id={`${id}-menu`}
            role="menu"
            aria-labelledby={`${id}-trigger`}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]'
                )
              );
              const current = items.indexOf(
                document.activeElement as HTMLButtonElement
              );
              let next: number;
              if (event.key === "ArrowDown")
                next = (current + 1) % items.length;
              else if (event.key === "ArrowUp")
                next = (current - 1 + items.length) % items.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = items.length - 1;
              else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
              } else if (event.key === "Tab") {
                triggerRef.current?.focus();
                setOpen(false);
                return;
              } else return;
              event.preventDefault();
              items[next]?.focus();
            }}
            className={cn(
              "absolute right-0 top-full z-[80] mt-2 w-56 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out"
            )}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium">{user.username}</p>
              <RoleBadge
                role={user.role}
                className="mt-1"
              />
            </div>
            {onOpenSettings && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
                className="flex min-h-touch w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <UserCog
                  className="size-4"
                  aria-hidden="true"
                />{" "}
                Account settings
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleTheme();
                close();
              }}
              className="flex min-h-touch w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
            >
              {theme === "dark" ? (
                <Sun
                  className="size-4"
                  aria-hidden="true"
                />
              ) : (
                <Moon
                  className="size-4"
                  aria-hidden="true"
                />
              )}
              Switch to {theme === "dark" ? "light" : "dark"} theme
            </button>
            <button
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={signOut}
              className="flex min-h-touch w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
