"use client";

import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface AppState {
  token: string | null;
  theme: Theme;
  privacyMode: boolean;
  setToken: (token: string | null) => void;
  setTheme: (theme: Theme) => void;
  setPrivacyMode: (on: boolean) => void;
  togglePrivacyMode: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  token:
    typeof window !== "undefined"
      ? window.localStorage.getItem("lifeos.token")
      : null,
  theme:
    (typeof window !== "undefined"
      ? (window.localStorage.getItem("lifeos.theme") as Theme)
      : null) ?? "system",
  privacyMode:
    typeof window !== "undefined"
      ? window.localStorage.getItem("lifeos.privacyMode") === "1"
      : false,

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

  setPrivacyMode: (on) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lifeos.privacyMode", on ? "1" : "0");
    }
    set({ privacyMode: on });
  },

  togglePrivacyMode: () => {
    const next = !get().privacyMode;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lifeos.privacyMode", next ? "1" : "0");
    }
    set({ privacyMode: next });
  },
}));
