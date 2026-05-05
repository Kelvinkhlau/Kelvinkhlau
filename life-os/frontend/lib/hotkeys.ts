/**
 * 全域 keyboard shortcut 支援。
 *
 * 設計：
 *   - 單一 window-level keydown listener（vs 每個 component 自己加）
 *   - Key string 格式：`"mod+k"` / `"mod+shift+/"` / `"esc"` / `"g t"`（sequence）
 *   - "mod" = Cmd on Mac, Ctrl 其他
 *   - 自動忽略：喺 input / textarea / contenteditable 入面 type 嘢
 *     （除非 hotkey 包含 mod 鍵 — e.g. ⌘K 係 global capture）
 *   - 單用戶系統，冇 conflict-resolution 需要
 *
 * 用例：
 *   useHotkey("mod+k", () => setPaletteOpen(true));
 *   useHotkey("mod+n", () => setCaptureOpen(true));
 *   useHotkey("esc", () => setOpen(false), { when: open });
 */

import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

type HotkeyOptions = {
  /** 只喺 condition true 嘅時候 active（預設 true） */
  when?: boolean;
  /** 喺 input/textarea 入面都要 trigger（預設：只有 mod 組合先 global） */
  enableInInput?: boolean;
  /** 係咪 preventDefault（預設 true） */
  preventDefault?: boolean;
};

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

// 呢啲 symbol 本身就要 Shift 先打到（US keyboard）。spec 寫 `"?"` 就當
// Shift 係必然，唔使用者寫 `"shift+?"`。
const SHIFTED_SYMBOLS = new Set([
  "?", "#", "!", "@", "$", "%", "^", "&", "*",
  "(", ")", "_", "+", "{", "}", "|", ":", '"', "<", ">", "~",
]);

function matchKey(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.toLowerCase().split("+").map((p) => p.trim());
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));

  // Match modifiers exactly（冇入 Cmd 就唔可以多咗）
  const wantMod = mods.has("mod") || mods.has("cmd") || mods.has("ctrl");
  const hasMod = e.metaKey || e.ctrlKey;
  if (wantMod !== hasMod) return false;

  // Shifted symbols：唔強制 shift 要 match
  if (!SHIFTED_SYMBOLS.has(key)) {
    const wantShift = mods.has("shift");
    if (wantShift !== e.shiftKey) return false;
  }

  const wantAlt = mods.has("alt") || mods.has("option");
  if (wantAlt !== e.altKey) return false;

  // Key match（小心：當按 Cmd 時，Safari/某啲 browser 可能將 e.key 變成 dead key）
  if (key === "esc") return e.key === "Escape";
  if (key === "enter") return e.key === "Enter";
  if (key === "tab") return e.key === "Tab";
  if (key === "space") return e.key === " ";
  if (key === "/") return e.key === "/";
  return e.key === key || e.key.toLowerCase() === key;
}

export function useHotkey(
  spec: string,
  handler: Handler,
  options: HotkeyOptions = {},
): void {
  const {
    when = true,
    enableInInput = false,
    preventDefault = true,
  } = options;

  useEffect(() => {
    if (!when) return;

    function onKeyDown(e: KeyboardEvent) {
      if (!matchKey(e, spec)) return;

      // 喺 input 入面唔 trigger，除非 enableInInput 或者有 mod key
      if (!enableInInput && !(e.metaKey || e.ctrlKey)) {
        if (isEditingTarget(e.target)) return;
      }

      if (preventDefault) e.preventDefault();
      handler(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spec, handler, when, enableInInput, preventDefault]);
}

/** Utility：macOS or not（SSR-safe，default false） */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** 顯示用：將 "mod+k" 變做「⌘K」（或 Ctrl+K） */
export function formatKey(spec: string): string {
  const isMacOS = isMac();
  return spec
    .split("+")
    .map((p) => {
      const lower = p.toLowerCase();
      if (lower === "mod" || lower === "cmd") return isMacOS ? "⌘" : "Ctrl";
      if (lower === "ctrl") return isMacOS ? "⌃" : "Ctrl";
      if (lower === "shift") return isMacOS ? "⇧" : "Shift";
      if (lower === "alt" || lower === "option") return isMacOS ? "⌥" : "Alt";
      if (lower === "esc") return "Esc";
      if (lower === "enter") return "↵";
      return p.toUpperCase();
    })
    .join(isMacOS ? "" : "+");
}
