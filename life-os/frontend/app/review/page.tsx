"use client";

/**
 * Weekly / Monthly Review — zoom out 睇一週或一個月嘅進度。
 *
 * Tab：本週 / 本月
 * 數據：
 *   - 完成 todo 數 + 平均每日
 *   - 收到 email 數 + 重要比例
 *   - 消費總額 + 分類 breakdown
 *   - 6 個月 trend
 *
 * 純前端 aggregate — 用已有 endpoint，唔開新 API。
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type Todo,
  type ExpenseStats,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { Card, PageShell, PageHeader } from "@/components/ui";
import {
  Calendar,
  CheckSquare,
  Wallet,
  iconProps,
  iconSize,
} from "@/components/icons";

type Range = "week" | "month";

function rangeDates(range: Range): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();
  if (range === "week") {
    // 7 日前開始（包括今日）
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: "過去 7 日" };
  }
  // month: 同一日去返上個月
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: "過去 30 日" };
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type MonthlyData = { year: number; month: number; total: number; count: number };

export default function ReviewPage() {
  const [range, setRange] = useState<Range>("week");
  const { from, to, label } = rangeDates(range);
  const fromStr = toDateStr(from);
  const toStr = toDateStr(to);

  // Todo 數據 — 拎晒 done=true 過濾時間
  const { data: doneTodos = [], isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ["review-done-todos"],
    queryFn: () => api.listTodos({ done: true }),
    staleTime: 60_000,
  });

  const { data: openTodos = [] } = useQuery<Todo[]>({
    queryKey: ["review-open-todos"],
    queryFn: () => api.listTodos({ done: false }),
    staleTime: 60_000,
  });

  // Expense stats 限 range
  const { data: expenseStats, isLoading: expLoading } = useQuery<ExpenseStats>({
    queryKey: ["review-expense-stats", fromStr, toStr],
    queryFn: () => api.expenseStats({ date_from: fromStr, date_to: toStr }),
  });

  const { data: monthly = [] } = useQuery<MonthlyData[]>({
    queryKey: ["review-expense-monthly"],
    queryFn: () => api.expenseMonthly(6),
    staleTime: 300_000,
  });

  const { data: emailStats } = useQuery({
    queryKey: ["review-email-stats"],
    queryFn: () => api.emailStats(),
  });

  const inRange = useMemo(() => {
    const fromTs = from.getTime();
    const toTs = to.getTime() + 86_400_000; // include today
    return doneTodos.filter((t) => {
      if (!t.completed_at) return false;
      const ts = new Date(t.completed_at).getTime();
      return ts >= fromTs && ts < toTs;
    });
  }, [doneTodos, from, to]);

  const daysInRange = range === "week" ? 7 : 30;
  const completedCount = inRange.length;
  const avgPerDay = (completedCount / daysInRange).toFixed(1);

  // 每日 completion count（for sparkline）
  const daily = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 0; i < daysInRange; i++) {
      const d = new Date(to);
      d.setDate(d.getDate() - (daysInRange - 1 - i));
      buckets.set(toDateStr(d), 0);
    }
    for (const t of inRange) {
      if (!t.completed_at) continue;
      const key = t.completed_at.slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }
    return Array.from(buckets.entries()).map(([day, count]) => ({ day, count }));
  }, [inRange, daysInRange, to]);

  const maxDaily = Math.max(...daily.map((d) => d.count), 1);

  const totalSpent = expenseStats?.total ?? 0;
  const avgSpent = (totalSpent / daysInRange).toFixed(0);

  const emailImportant = emailStats?.by_category?.important ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="回顧"
        subtitle={`${label}的進度 + 開銷`}
        actions={
          <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
            {(["week", "month"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                  r === range
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                {r === "week" ? "本週" : "本月"}
              </button>
            ))}
          </div>
        }
      />

      {/* Headline stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="完成 todo"
          value={completedCount}
          hint={`每日平均 ${avgPerDay}`}
          icon={<CheckSquare {...iconProps} size={iconSize.xl} />}
          tone="bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400"
        />
        <StatCard
          label="待辦 backlog"
          value={openTodos.length}
          hint={`${openTodos.filter((t) => t.priority === "high").length} 件高優先`}
          icon={<CheckSquare {...iconProps} size={iconSize.xl} />}
          tone="bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="總消費"
          value={`$${totalSpent.toLocaleString("zh-HK", { maximumFractionDigits: 0 })}`}
          hint={`每日平均 $${avgSpent}`}
          icon={<Wallet {...iconProps} size={iconSize.xl} />}
          tone="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="未讀重要 email"
          value={emailImportant}
          hint="隨時都 fresh"
          icon={<Calendar {...iconProps} size={iconSize.xl} />}
          tone="bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400"
        />
      </section>

      {/* Daily completion chart */}
      <section>
        <h2 className="text-subhead mb-3">每日完成量</h2>
        <Card>
          {todosLoading ? (
            <Loading />
          ) : (
            <div className="flex items-end gap-1 h-32">
              {daily.map((d) => {
                const h = (d.count / maxDaily) * 100;
                const dow = new Date(d.day).toLocaleDateString("zh-HK", {
                  weekday: "narrow",
                });
                return (
                  <div
                    key={d.day}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${d.day}：${d.count} 件`}
                  >
                    <span className="text-[10px] text-foreground-subtle h-3">
                      {d.count > 0 ? d.count : ""}
                    </span>
                    <div className="w-full flex justify-center">
                      <div
                        className="w-full bg-green-500 rounded-t min-h-[2px]"
                        style={{ height: `${Math.max(h, 2)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-foreground-subtle">
                      {dow}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* Expense breakdown */}
      <section>
        <h2 className="text-subhead mb-3">消費分類</h2>
        <Card>
          {expLoading ? (
            <Loading />
          ) : !expenseStats || Object.keys(expenseStats.by_category).length === 0 ? (
            <div className="text-center text-foreground-subtle py-6">
              呢段時間冇消費紀錄
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(expenseStats.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt]) => {
                  const pct = totalSpent ? (amt / totalSpent) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center text-sm gap-2">
                      <span className="w-16 text-foreground-muted truncate text-caption">
                        {cat}
                      </span>
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-caption w-16 text-right text-numeric">
                        ${amt.toLocaleString("zh-HK", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-caption w-10 text-right text-foreground-subtle">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </section>

      {/* 6-month trend */}
      {monthly.length > 0 && (
        <section>
          <h2 className="text-subhead mb-3">6 個月消費 trend</h2>
          <Card>
            <div className="flex items-end gap-2 h-32">
              {(() => {
                const maxVal = Math.max(...monthly.map((m) => m.total), 1);
                return monthly.map((m) => (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <span className="text-[10px] text-foreground-subtle">
                      {m.total >= 1000
                        ? `${(m.total / 1000).toFixed(1)}k`
                        : `$${m.total.toFixed(0)}`}
                    </span>
                    <div className="w-full flex justify-center">
                      <div
                        className="w-4/5 bg-amber-500 rounded-t min-h-[2px]"
                        style={{
                          height: `${Math.max((m.total / maxVal) * 100, 2)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-foreground-subtle">
                      {m.year}-{String(m.month).padStart(2, "0")}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </Card>
        </section>
      )}

      {/* Completed todos list */}
      <section>
        <h2 className="text-subhead mb-3">{label}完成嘅 todo（{completedCount}）</h2>
        {inRange.length === 0 ? (
          <Card>
            <div className="text-center text-foreground-subtle py-6">
              呢段時間冇完成 todo。
              <br />
              加油！
            </div>
          </Card>
        ) : (
          <div className="space-y-1">
            {inRange.slice(0, 30).map((t) => (
              <Link key={t.id} href="/todos" className="block">
                <Card interactive padding="sm" className="flex items-center gap-2">
                  <span className="text-green-500 text-lg">✓</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{t.title}</div>
                    {t.completed_at && (
                      <div className="text-[11px] text-foreground-subtle">
                        {new Date(t.completed_at).toLocaleString("zh-HK", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
            {inRange.length > 30 && (
              <div className="text-center text-xs text-foreground-subtle pt-2">
                仲有 {inRange.length - 30} 件冇顯示…
              </div>
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card padding="md" className="flex items-start gap-3">
      <div
        className={`shrink-0 w-10 h-10 rounded-md ${tone} flex items-center justify-center`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-heading font-semibold text-numeric truncate text-foreground">
          {value}
        </div>
        <div className="text-caption text-foreground-muted mt-0.5 truncate">
          {label}
        </div>
        <div className="text-[11px] text-foreground-subtle mt-0.5 truncate">
          {hint}
        </div>
      </div>
    </Card>
  );
}
