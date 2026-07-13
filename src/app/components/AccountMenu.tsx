"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RoleBadge, roleVisual } from "@/app/utils/roles";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
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
    setOpen(false);
    logout();
  };

  return (
    <>
      <div ref={menuRef} className="relative z-[70]">
        <Button
          variant="outline"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            "h-9 gap-2 pl-2 pr-3 transition-colors",
            open && "bg-accent text-accent-foreground ring-1 ring-border"
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          <span className="hidden max-w-28 truncate text-sm sm:inline">
            {user.username}
          </span>
          <RoleBadge role={user.role} className="hidden md:inline-flex" />
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>

        {open && (
          <div
            role="menu"
            className={cn(
              "absolute right-0 top-full z-[80] mt-2 w-56 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
            )}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="truncate text-sm font-medium">{user.username}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                {(() => {
                  const { Icon, color } = roleVisual(user.role);
                  return <Icon className="h-3.5 w-3.5" style={{ color }} />;
                })()}
                {user.role}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
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
