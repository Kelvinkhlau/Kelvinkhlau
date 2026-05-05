"use client";

/**
 * NotificationCenter — 🔔 鐘仔 dropdown，顯示「今日要你理」嘅 signals。
 *
 * 資料來源：`api.today()`（cache 60s）
 *   - 過期 todos（紅）
 *   - 今日到期 todos（橙）
 *   - 未讀 important emails（重要 VIP）
 *   - 今日 events（提示）
 *
 * UX：
 *   - Bell icon 顯示 unread count badge
 *   - 點擊開 dropdown，dropdown 顯示 grouped items
 *   - 點擊 item 跳去相應 detail page
 *   - Empty state："你冇 pending signal，keep it up 💙"
 *
 * 用 localStorage 記住 last_seen_at — 新 item 有「NEW」標籤。
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type TodayResponse } from "@/lib/api";
import { Bell, iconProps } from "./icons";
import { getToken } from "@/lib/api";

const LAST_SEEN_KEY = "lifeos.notifs.lastSeenAt";

function loadLastSeen(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveLastSeen(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {
    // noop
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const [hasToken, setHasToken] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastSeen(loadLastSeen());
    setHasToken(!!getToken());
  }, []);

  const { data } = useQuery<TodayResponse>({
    queryKey: ["today-notifs"],
    queryFn: () => api.today(),
    staleTime: 60_000,
    refetchInterval: 300_000, // 5 分鐘 refresh 一次
    enabled: hasToken,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Count signals
  const overdueTodos = (data?.suggested_todos ?? []).filter((t) => {
    if (!t.due_at || t.done) return false;
    return new Date(t.due_at).getTime() < Date.now();
  });
  const dueTodayTodos = (data?.suggested_todos ?? []).filter((t) => {
    if (!t.due_at || t.done) return false;
    const due = new Date(t.due_at);
    const today = new Date();
    return (
      due.toDateString() === today.toDateString() &&
      due.getTime() >= Date.now()
    );
  });
  const importantEmails = data?.important_emails ?? [];
  const events = data?.events ?? [];

  const totalCount =
    overdueTodos.length +
    dueTodayTodos.length +
    importantEmails.length;

  // 計算「新」signals — 用 received_at / due_at 對比 lastSeen
  const newCount = (() => {
    let count = 0;
    for (const e of importantEmails) {
      if (new Date(e.received_at).getTime() > lastSeen) count++;
    }
    for (const t of overdueTodos) {
      if (t.due_at && new Date(t.due_at).getTime() > lastSeen) count++;
    }
    return count;
  })();

  function handleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        // Mark all as seen
        const now = Date.now();
        saveLastSeen(now);
        setLastSeen(now);
      }
      return next;
    });
  }

  if (!hasToken) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex items-center justify-center w-8 h-8 rounded hover:bg-muted transition-colors"
        aria-label={`通知（${totalCount} 項）`}
        aria-expanded={open}
      >
        <Bell {...iconProps} size={16} className="text-foreground-muted" />
        {totalCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold text-white flex items-center justify-center ${
              newCount > 0 ? "bg-red-500" : "bg-slate-500"
            }`}
            aria-hidden="true"
          >
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-surface-elevated border border-border-subtle rounded-lg shadow-xl z-50 animate-fade-in"
        >
          <div className="sticky top-0 flex items-center justify-between px-3 h-10 border-b border-border-subtle bg-surface-elevated">
            <span className="text-sm font-semibold">🔔 通知</span>
            <Link
              href="/today"
              onClick={() => setOpen(false)}
              className="text-xs text-accent hover:underline"
            >
              打開「今日」→
            </Link>
          </div>

          {totalCount === 0 ? (
            <div className="p-6 text-center text-sm text-foreground-subtle">
              💙 你冇 pending signal。
              <br />
              Keep it up！
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {overdueTodos.length > 0 && (
                <Section title="⚠️ 過期待辦" accent="text-red-600">
                  {overdueTodos.slice(0, 5).map((t) => (
                    <Link
                      key={`overdue-${t.id}`}
                      href={`/todos`}
                      onClick={() => setOpen(false)}
                      className="block p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="text-sm truncate">{t.title}</div>
                      {t.due_at && (
                        <div className="text-[10px] text-red-600 font-medium">
                          過期：{new Date(t.due_at).toLocaleDateString("zh-HK")}
                        </div>
                      )}
                    </Link>
                  ))}
                </Section>
              )}

              {dueTodayTodos.length > 0 && (
                <Section title="📅 今日到期" accent="text-amber-600">
                  {dueTodayTodos.slice(0, 5).map((t) => (
                    <Link
                      key={`due-${t.id}`}
                      href={`/todos`}
                      onClick={() => setOpen(false)}
                      className="block p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="text-sm truncate">{t.title}</div>
                    </Link>
                  ))}
                </Section>
              )}

              {importantEmails.length > 0 && (
                <Section title="📧 未讀重要 email" accent="text-blue-600">
                  {importantEmails.slice(0, 5).map((e) => (
                    <Link
                      key={`email-${e.id}`}
                      href={`/inbox/detail?id=${e.id}`}
                      onClick={() => setOpen(false)}
                      className="block p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="text-sm truncate font-medium">
                        {e.subject || "(無主題)"}
                      </div>
                      <div className="text-[11px] text-foreground-subtle truncate">
                        {e.sender}
                      </div>
                    </Link>
                  ))}
                </Section>
              )}

              {events.length > 0 && (
                <Section title="🗓 今日行程" accent="text-purple-600">
                  {events.slice(0, 3).map((ev) => (
                    <Link
                      key={`ev-${ev.id}`}
                      href={`/calendar`}
                      onClick={() => setOpen(false)}
                      className="block p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div className="text-sm truncate">{ev.title}</div>
                      <div className="text-[11px] text-foreground-subtle">
                        {new Date(ev.start_at).toLocaleTimeString("zh-HK", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </Link>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`text-[10px] font-semibold uppercase tracking-wider px-2 mb-1 ${accent}`}
      >
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
