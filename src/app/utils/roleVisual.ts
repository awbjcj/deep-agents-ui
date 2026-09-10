import { Code2, Shield, User, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/auth";

export interface RoleVisual {
  Icon: LucideIcon;
  color: string;
}

/** Returns the icon and theme color shared by every role presentation. */
export function roleVisual(role: Role): RoleVisual {
  switch (role) {
    case "admin":
      return { Icon: Shield, color: "var(--aptiv-orange)" };
    case "developer":
      return { Icon: Code2, color: "var(--aptiv-turquoise)" };
    default:
      return { Icon: User, color: "var(--role-badge-user)" };
  }
}
