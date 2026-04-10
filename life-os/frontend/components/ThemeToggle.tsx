"use client";

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
      title={`主題：${LABELS[theme]}`}
      aria-label={`切換主題，目前：${LABELS[theme]}`}
    >
      {ICONS[theme]}
    </button>
  );
}
