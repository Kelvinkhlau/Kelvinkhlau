"use client";

import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface AppState {
  token: string | null;
  theme: Theme;
  setToken: (token: string | null) => void;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppState>((set) => ({
  token:
    typeof window !== "undefined"
      ? window.localStorage.getItem("lifeos.token")
      : null,
  theme:
    (typeof window !== "undefined"
      ? (window.localStorage.getItem("lifeos.theme") as Theme)
      : null) ?? "system",

  setToken: (token) => {
    if (typeof window !== "undefined") {
      if (token) {
        window.localStorage.setItem("lifeos.token", token);
      } else {
        window.localStorage.removeItem("lifeos.token");
      }
    }
    set({ token });
  },

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lifeos.theme", theme);
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
    }
    set({ theme });
  },
}));
