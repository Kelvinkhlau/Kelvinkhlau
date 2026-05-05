"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { Loading, EmptyState } from "@/components/Loading";
import { Money, formatAmount } from "@/components/Money";

type Tab = "trend" | "category" | "merchant" | "account" | "heatmap";

const TAB_LABEL: Record<Tab, string> = {
  trend: "趨勢",
  category: "類別",
  merchant: "商家",
  account: "帳戶",
  heatmap: "熱力圖",
};

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7",
];

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfMonth(d: Date): string {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
    end.getDate()
  ).padStart(2, "0")}`;
}
function monthAgo(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() - months);
  return r;
}
function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("trend");

  // Range: last 6 months by default
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(startOfMonth(monthAgo(today, 5)));
  const [dateTo, setDateTo] = useState(lastDayOfMonth(today));

  return (
    <main className="min-h-full max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">消費分析</h1>
      </div>

      {/* Date range picker */}
      <div className="flex gap-2 items-end mb-4 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">由</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="block mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">至</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="block mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm"
          />
        </div>
        <div className="flex gap-1">
          {[
            { label: "本月", months: 0 },
            { label: "3 個月", months: 2 },
            { label: "6 個月", months: 5 },
            { label: "1 年", months: 11 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const now = new Date();
                setDateFrom(startOfMonth(monthAgo(now, p.months)));
                setDateTo(lastDayOfMonth(now));
              }}
              className="px-2 py-1.5 text-xs border border-border rounded hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
              tab === t
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABEL[t]}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {tab === "trend" && <TrendTab dateFrom={dateFrom} dateTo={dateTo} />}
        {tab === "category" && (
          <CategoryTab dateFrom={dateFrom} dateTo={dateTo} />
        )}
        {tab === "merchant" && (
          <MerchantTab dateFrom={dateFrom} dateTo={dateTo} />
        )}
        {tab === "account" && (
          <AccountTab dateFrom={dateFrom} dateTo={dateTo} />
        )}
        {tab === "heatmap" && (
          <HeatmapTab dateFrom={dateFrom} dateTo={dateTo} />
        )}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────
// Trend tab：日 / 月線圖
// ────────────────────────────────────────────────────────────────
function TrendTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: daily = [], isLoading: loadingDaily } = useQuery({
    queryKey: ["daily-trend", dateFrom, dateTo],
    queryFn: () => api.dailyTrend({ date_from: dateFrom, date_to: dateTo }),
  });
  const { data: monthly = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ["monthly-summary", 12],
    queryFn: () => api.monthlySummary(12),
  });

  const dailyChart = useMemo(
    () => daily.map((d) => ({ date: d.date.slice(5), total: d.total })),
    [daily]
  );

  const monthlyChart = useMemo(
    () =>
      monthly.map((m) => ({
        label: `${m.year}-${String(m.month).padStart(2, "0")}`,
        income: m.income,
        expense: m.expense,
        net: m.net,
      })),
    [monthly]
  );

  if (loadingDaily || loadingMonthly) return <Loading />;

  const totalExpense = daily.reduce((s, d) => s + d.total, 0);
  const avgDaily = daily.length > 0 ? totalExpense / daily.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground">區間總支出</div>
          <div className="text-xl font-bold mt-1">
            <Money value={totalExpense} decimals={0} prefix="$" />
          </div>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground">每日平均</div>
          <div className="text-xl font-bold mt-1">
            <Money value={avgDaily} decimals={0} prefix="$" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">每日消費</h3>
        <div className="h-[260px]">
          {dailyChart.length === 0 ? (
            <EmptyState message="區間內無消費記錄" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => `$${formatAmount(Number(v), 0)}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">過去 12 個月（收入 / 支出）</h3>
        <div className="h-[260px]">
          {monthlyChart.length === 0 ? (
            <EmptyState message="無月度資料" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => `$${formatAmount(Number(v), 0)}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#10b981" name="收入" />
                <Bar dataKey="expense" fill="#ef4444" name="支出" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Category tab：pie chart + 排名
// ────────────────────────────────────────────────────────────────
function CategoryTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["expense-stats", dateFrom, dateTo, "expense"],
    queryFn: () =>
      api.expenseStats({
        txn_type: "expense",
        date_from: dateFrom,
        date_to: dateTo,
      }),
  });

  if (isLoading || !stats) return <Loading />;

  const entries = Object.entries(stats.by_category || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) {
    return <EmptyState message="區間內無消費記錄" />;
  }

  const total = stats.total;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={entries}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={110}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent! * 100).toFixed(0)}%`
              }
            >
              {entries.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => `$${formatAmount(Number(v), 0)}`}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">類別排名</h3>
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div key={e.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <div className="flex-1 text-sm truncate">{e.name}</div>
              <div className="text-sm font-medium">
                <Money value={e.value} decimals={0} prefix="$" />
              </div>
              <div className="text-xs text-muted-foreground w-10 text-right">
                {((e.value / total) * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Merchant tab：top merchants
// ────────────────────────────────────────────────────────────────
function MerchantTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["by-merchant", dateFrom, dateTo],
    queryFn: () =>
      api.expensesByMerchant({
        date_from: dateFrom,
        date_to: dateTo,
        txn_type: "expense",
        limit: 20,
      }),
  });

  if (isLoading) return <Loading />;
  if (data.length === 0)
    return <EmptyState message="區間內無商家消費記錄" />;

  const chartData = data.map((d) => ({
    merchant:
      d.merchant.length > 12 ? d.merchant.slice(0, 12) + "…" : d.merchant,
    total: d.total,
  }));

  return (
    <div className="space-y-6">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="merchant"
              tick={{ fontSize: 11 }}
              width={90}
            />
            <Tooltip
              formatter={(v) => `$${formatAmount(Number(v), 0)}`}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="total" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-1.5">
        {data.map((m) => (
          <div
            key={m.merchant}
            className="flex items-center justify-between p-2 border border-border rounded"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{m.merchant}</div>
              <div className="text-xs text-muted-foreground">
                {m.count} 筆交易
              </div>
            </div>
            <div className="font-bold">
              <Money value={m.total} decimals={2} prefix="$" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Account tab：spending by payment account
// ────────────────────────────────────────────────────────────────
function AccountTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["by-account", dateFrom, dateTo],
    queryFn: () =>
      api.expensesByAccount({
        date_from: dateFrom,
        date_to: dateTo,
        txn_type: "expense",
      }),
  });

  if (isLoading) return <Loading />;
  if (data.length === 0)
    return <EmptyState message="區間內無帳戶消費記錄" />;

  const pieData = data.map((d) => ({ name: d.name, value: d.total }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={110}
              dataKey="value"
              label={({ name, percent }) =>
                `${name} ${(percent! * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => `$${formatAmount(Number(v), 0)}`}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">帳戶排名</h3>
        <div className="space-y-1.5">
          {data.map((a, i) => (
            <div
              key={a.payment_account_id ?? "none"}
              className="flex items-center gap-2 p-2 border border-border rounded"
            >
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                {a.payment_method && (
                  <div className="text-xs text-muted-foreground">
                    {a.payment_method}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold">
                  <Money value={a.total} decimals={0} prefix="$" />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {a.count} 筆
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Heatmap tab：GitHub-style calendar heatmap
// ────────────────────────────────────────────────────────────────
function HeatmapTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["daily-trend", dateFrom, dateTo, "heatmap"],
    queryFn: () => api.dailyTrend({ date_from: dateFrom, date_to: dateTo }),
  });

  if (isLoading) return <Loading />;

  const map = new Map(data.map((d) => [d.date, d.total]));
  const max = Math.max(1, ...data.map((d) => d.total));

  // Build weeks array
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const weeks: { date: string; total: number }[][] = [];

  // Align to Sunday
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  while (cursor <= end) {
    const week: { date: string; total: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = formatDateKey(cursor);
      const inRange = cursor >= start && cursor <= end;
      week.push({
        date: key,
        total: inRange ? map.get(key) || 0 : -1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  const cellColor = (v: number) => {
    if (v < 0) return "transparent";
    if (v === 0) return "rgb(var(--muted-rgb, 230 230 230) / 0.3)";
    const intensity = Math.min(1, v / max);
    const alpha = 0.2 + 0.8 * intensity;
    return `rgba(59, 130, 246, ${alpha})`;
  };

  const totalAmount = data.reduce((s, d) => s + d.total, 0);
  const daysWithSpending = data.filter((d) => d.total > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground">區間總支出</div>
          <div className="text-xl font-bold mt-1">
            <Money value={totalAmount} decimals={0} prefix="$" />
          </div>
        </div>
        <div className="p-3 border border-border rounded-lg">
          <div className="text-xs text-muted-foreground">有消費日數</div>
          <div className="text-xl font-bold mt-1">{daysWithSpending} 日</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day.total >= 0 ? `${day.date}: $${formatAmount(day.total, 0)}` : ""}
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: cellColor(day.total) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>少</span>
        <div className="flex gap-1">
          {[0, 0.25, 0.5, 0.75, 1].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor:
                  i === 0
                    ? "rgb(var(--muted-rgb, 230 230 230) / 0.3)"
                    : `rgba(59, 130, 246, ${0.2 + 0.8 * i})`,
              }}
            />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  );
}
