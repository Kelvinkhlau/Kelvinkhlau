"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DailyReport } from "@/lib/api";
import { Loading } from "@/components/Loading";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportPage() {
  const [reportDate, setReportDate] = useState(todayStr());

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportDate],
    queryFn: () => api.dailyReport({ report_date: reportDate }),
  });

  const isToday = reportDate === todayStr();

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">日報</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Date picker */}
      <div className="mb-6 flex items-center gap-3">
        <input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          className="px-3 py-2 border border-border rounded bg-background"
          aria-label="報告日期"
        />
        {!isToday && (
          <button
            type="button"
            onClick={() => setReportDate(todayStr())}
            className="text-sm text-blue-600 hover:underline"
          >
            返回今日
          </button>
        )}
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        report && (
          <div className="space-y-4">
            {/* Todos section */}
            <section className="p-4 border border-border rounded-lg">
              <h2 className="font-medium mb-3">Todos</h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold">{report.todos.pending_total}</div>
                  <div className="text-xs text-muted-foreground">待做</div>
                </div>
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold text-green-600">
                    {report.todos.completed_today}
                  </div>
                  <div className="text-xs text-muted-foreground">今日完成</div>
                </div>
              </div>
              {report.todos.overdue > 0 && (
                <div className="mb-2">
                  <div className="text-sm font-medium text-red-600 mb-1">
                    逾期 ({report.todos.overdue})
                  </div>
                  {report.todos.overdue_items.map((t) => (
                    <div key={t.id} className="text-sm text-muted-foreground">
                      · {t.title}
                    </div>
                  ))}
                </div>
              )}
              {report.todos.due_today > 0 && (
                <div>
                  <div className="text-sm font-medium text-orange-600 mb-1">
                    今日到期 ({report.todos.due_today})
                  </div>
                  {report.todos.due_today_items.map((t) => (
                    <div key={t.id} className="text-sm text-muted-foreground">
                      · {t.title}{" "}
                      <span className="text-xs">({t.priority})</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Calendar section */}
            <section className="p-4 border border-border rounded-lg">
              <h2 className="font-medium mb-3">
                行程 ({report.calendar.event_count})
              </h2>
              {report.calendar.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">冇行程</p>
              ) : (
                <div className="space-y-2">
                  {report.calendar.events.map((e) => (
                    <div key={e.id} className="text-sm">
                      <span className="text-muted-foreground">
                        {e.all_day ? "全日" : formatTime(e.start_at)}
                      </span>{" "}
                      {e.title}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Emails section */}
            <section className="p-4 border border-border rounded-lg">
              <h2 className="font-medium mb-3">Email</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold">
                    {report.emails.received_today}
                  </div>
                  <div className="text-xs text-muted-foreground">今日收到</div>
                </div>
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold text-blue-600">
                    {report.emails.unread_total}
                  </div>
                  <div className="text-xs text-muted-foreground">未讀</div>
                </div>
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold text-red-600">
                    {report.emails.important_today}
                  </div>
                  <div className="text-xs text-muted-foreground">重要</div>
                </div>
              </div>
            </section>

            {/* Expenses section */}
            <section className="p-4 border border-border rounded-lg">
              <h2 className="font-medium mb-3">消費</h2>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">
                  共 {report.expenses.today_count} 筆
                </span>
                <span className="text-xl font-bold">
                  ${report.expenses.today_total.toLocaleString("zh-HK", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </section>
          </div>
        )
      )}
    </main>
  );
}
