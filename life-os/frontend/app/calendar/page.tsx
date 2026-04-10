"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CalendarEvent } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";

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
  const queryClient = useQueryClient();
  const [days, setDays] = useState(14);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar", days],
    queryFn: () => api.listCalendarEvents({ days }),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncCalendar({ days: 30 }),
    onSuccess: (result) => {
      toast.success(
        `同步完成：拉咗 ${result.fetched} 個 event，新 ${result.new} 個，更新 ${result.updated} 個`
      );
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (e) => toast.error(`同步失敗：${(e as Error).message}`),
  });

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
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          {syncMutation.isPending ? "同步中…" : "Sync Google Calendar"}
        </button>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-border rounded-md bg-background text-sm"
          aria-label="顯示日數"
        >
          <option value={7}>未來 7 日</option>
          <option value={14}>未來 14 日</option>
          <option value={30}>未來 30 日</option>
        </select>
      </div>

      {isLoading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState message="冇 upcoming events — 試下撳 Sync" />
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
