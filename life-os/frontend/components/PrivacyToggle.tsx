"use client";

/**
 * PrivacyToggle — 遮擋金額嘅眼睛按鈕。
 *
 * 喺 sidebar bottom actions 用（同 ThemeToggle 並排）。
 * 狀態由 useAppStore.privacyMode 管理。
 */

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Eye, EyeOff, iconProps } from "./icons";

export function PrivacyToggle() {
  const privacy = useAppStore((s) => s.privacyMode);
  const toggle = useAppStore((s) => s.togglePrivacyMode);

  // 避免 hydration mismatch — server render 時用 false，client mount 後才反映 localStorage
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = mounted && privacy;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? "顯示金額" : "隱藏金額"}
      title={on ? "顯示金額" : "隱藏金額"}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border-subtle rounded-md hover:bg-muted transition-colors"
    >
      {on ? <EyeOff {...iconProps} size={14} /> : <Eye {...iconProps} size={14} />}
    </button>
  );
}
