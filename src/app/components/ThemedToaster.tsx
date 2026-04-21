"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/providers/ThemeProvider";

export function ThemedToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      richColors
      theme={theme}
    />
  );
}
