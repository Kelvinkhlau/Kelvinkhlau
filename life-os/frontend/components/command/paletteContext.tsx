"use client";

/**
 * Palette context — 全 app 共用 state，控制 ⌘K palette 同 ⌘N quick capture。
 *
 * 由 `<PaletteProvider>` 喺 Providers.tsx 包住全部，然後任何 component
 * 用 `usePaletteContext()` 可以 open/close。
 *
 * Hotkey binding 亦由 provider 管理（mount 一次就好）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useHotkey } from "@/lib/hotkeys";

export type CaptureKind = "smart" | "todo" | "note" | "idea";

type Ctx = {
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  captureOpen: boolean;
  captureKind: CaptureKind;
  openCapture: (kind?: CaptureKind) => void;
  closeCapture: () => void;

  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
};

const PaletteCtx = createContext<Ctx | null>(null);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("smart");
  const [helpOpen, setHelpOpen] = useState(false);

  const openPalette = useCallback(() => {
    setCaptureOpen(false);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);

  const openCapture = useCallback((kind: CaptureKind = "smart") => {
    setPaletteOpen(false);
    setCaptureKind(kind);
    setCaptureOpen(true);
  }, []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);

  const openHelp = useCallback(() => {
    setPaletteOpen(false);
    setCaptureOpen(false);
    setHelpOpen(true);
  }, []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);

  // ─── Global hotkeys ─────────────────────────────────────
  useHotkey("mod+k", togglePalette);
  useHotkey("mod+n", () => openCapture("smart"));
  // ?  = Shift+/ — cheat sheet（唔喺 input 入面先生效）
  useHotkey("?", toggleHelp);
  // ESC 關 palette / capture / help — 各自 modal 內仲會自己做，呢個係 fallback
  useHotkey("esc", closePalette, { when: paletteOpen });
  useHotkey("esc", closeCapture, { when: captureOpen });
  useHotkey("esc", closeHelp, { when: helpOpen });

  const value = useMemo<Ctx>(
    () => ({
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      captureOpen,
      captureKind,
      openCapture,
      closeCapture,
      helpOpen,
      openHelp,
      closeHelp,
      toggleHelp,
    }),
    [
      paletteOpen,
      openPalette,
      closePalette,
      togglePalette,
      captureOpen,
      captureKind,
      openCapture,
      closeCapture,
      helpOpen,
      openHelp,
      closeHelp,
      toggleHelp,
    ],
  );

  return <PaletteCtx.Provider value={value}>{children}</PaletteCtx.Provider>;
}

export function usePaletteContext(): Ctx {
  const ctx = useContext(PaletteCtx);
  if (!ctx) {
    throw new Error("usePaletteContext 必須喺 <PaletteProvider> 入面用");
  }
  return ctx;
}
