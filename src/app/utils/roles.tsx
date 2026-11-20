import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";
import { roleVisual } from "@/app/utils/roleVisual";

/**
 * Consistent role pill used across admin/user-management surfaces:
 * a modern lucide icon paired with a role-tinted accent color.
 */
export function RoleBadge({
  role,
  className,
}: {
  role: Role;
  className?: string;
}) {
  const { Icon, color } = roleVisual(role);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        color: "var(--color-text-secondary)",
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon
        className="size-3.5"
        style={{ color }}
        aria-hidden="true"
      />
      {role}
    </span>
  );
}
