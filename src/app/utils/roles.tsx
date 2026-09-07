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
        "inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        className
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3" />
      {role}
    </span>
  );
}
