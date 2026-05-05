"use client";

/**
 * Dashboard widget 開關 — 俾用戶揀 / 主頁顯示邊啲 section。
 *
 * 用 localStorage 儲 disabled widgets 集合（比 enabled 直接儲簡單：
 * 新加入嘅 widget 預設會顯示，唔使手動 migrate）。
 */

export type WidgetId =
  | "stats"
  | "deadlines"
  | "actions"
  | "expenses_trend"
  | "expenses_category"
  | "emails"
  | "events"
  | "todos";

export const ALL_WIDGETS: { id: WidgetId; label: string; description: string }[] = [
  { id: "stats", label: "快速統計", description: "4 個重點數字卡" },
  { id: "deadlines", label: "即將到期", description: "兩週內 due 嘅 todo" },
  { id: "actions", label: "需要處理", description: "高優先 todo" },
  { id: "expenses_trend", label: "消費趨勢", description: "近 6 個月" },
  { id: "expenses_category", label: "消費分類", description: "本月 breakdown" },
  { id: "emails", label: "未讀重要 email", description: "最多 5 封" },
  { id: "events", label: "今日行程", description: "Calendar events" },
  { id: "todos", label: "待辦清單", description: "pending todos" },
];

const KEY = "lifeos.widgets.disabled";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadDisabledWidgets(): Set<WidgetId> {
  if (!isBrowser()) return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as WidgetId[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveDisabledWidgets(ids: Set<WidgetId>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // noop
  }
}

export function isWidgetEnabled(id: WidgetId, disabled: Set<WidgetId>): boolean {
  return !disabled.has(id);
}
