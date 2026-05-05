"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

type Theme = "light" | "dark" | "system";

const LABELS: Record<Theme, string> = {
  light: "淺色",
  dark: "深色",
  system: "跟系統",
};

const ICONS: Record<Theme, string> = {
  dark: "\u{1F319}",
  light: "\u{2600}\u{FE0F}",
  system: "\u{1F5A5}\u{FE0F}",
};

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  // Defer localStorage-driven theme display to after mount — server renders
  // a stable placeholder so hydration does not see a text mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cycle = () => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
      title={mounted ? `主題：${LABELS[theme]}` : "主題"}
      aria-label={
        mounted ? `切換主題，目前：${LABELS[theme]}` : "切換主題"
      }
      suppressHydrationWarning
    >
      {mounted ? ICONS[theme] : "\u{1F5A5}\u{FE0F}"}
    </button>
  );
}
