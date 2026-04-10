"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type CalendarEvent } from "@/lib/api";

function formatTime(dateStr: string, allDay: boolean): string {
  if (allDay) return "全日";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit" });
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return "今日";
  if (d.toDateString() === tomorrow.toDateString()) return "聽日";
  return d.toLocaleDateString("zh-HK", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(
  events: CalendarEvent[]
): { date: string; label: string; events: CalendarEvent[] }[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const dateKey = new Date(e.start_at).toDateString();
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)!.push(e);
  }
  return Array.from(map.entries()).map(([dateKey, evts]) => ({
    date: dateKey,
    label: formatDateHeader(evts[0].start_at),
    events: evts,
  }));
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [days, setDays] = useState(14);

  const load = () => {
    setLoading(true);
    api
      .listCalendarEvents({ days })
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [days]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await api.syncCalendar({ days: 30 });
      setMessage(
        `同步完成：拉咗 ${result.fetched} 個 event，新 ${result.new} 個，更新 ${result.updated} 個`
      );
      load();
    } catch (e) {
      setMessage(`同步失敗：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const grouped = groupByDate(events);

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          {syncing ? "同步中…" : "Sync Google Calendar"}
        </button>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-border rounded-md bg-background text-sm"
        >
          <option value={7}>未來 7 日</option>
          <option value={14}>未來 14 日</option>
          <option value={30}>未來 30 日</option>
        </select>
      </div>

      {message && (
        <div className="p-3 mb-3 text-sm text-muted-foreground bg-muted rounded">
          {message}
        </div>
      )}

      {error && (
        <div className="p-3 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground p-8">載入中…</div>
      ) : events.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          冇 upcoming events — 試下撳 Sync
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.date}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                {group.label}
              </h2>
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {group.events.map((event) => (
                  <li key={event.id} className="p-3 hover:bg-muted">
                    <div className="flex items-start gap-3">
                      <div className="text-sm font-mono text-muted-foreground w-14 shrink-0 text-right">
                        {formatTime(event.start_at, event.all_day)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium break-words">
                          {event.title || "(無標題)"}
                        </div>
                        {event.location && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {event.location}
                          </div>
                        )}
                        {!event.all_day && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatTime(event.start_at, false)} –{" "}
                            {formatTime(event.end_at, false)}
                          </div>
                        )}
                      </div>
                      {event.status === "tentative" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                          暫定
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
