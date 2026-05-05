/**
 * Recent items tracker — 記住最近去過嘅 page / entity，俾 ⌘K palette empty-state
 * 顯示「最近」group。
 *
 * 用 localStorage 儲最多 10 個 item，push 最新，自動 dedupe + trim。
 * SSR-safe：冇 window 就 no-op。
 */
"use client";

export type RecentItem = {
  kind: "page" | "entity";
  href: string;
  title: string;
  subtitle?: string;
  /** entity type — email / todo / note / idea / project / event / expense */
  entityType?: string;
  ts: number;
};

const KEY = "lifeos.recents";
const MAX = 10;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadRecents(): RecentItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, "ts">): void {
  if (!isBrowser()) return;
  try {
    const now = Date.now();
    const existing = loadRecents().filter((r) => r.href !== item.href);
    const next: RecentItem[] = [{ ...item, ts: now }, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / JSON errors — recents is best-effort
  }
}

export function clearRecents(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
