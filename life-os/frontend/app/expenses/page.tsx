"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Expense, type ExpenseStats } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const CATEGORIES = [
  "飲食",
  "交通",
  "娛樂",
  "購物",
  "住屋",
  "醫療",
  "教育",
  "日用品",
  "其他",
];

const PAYMENT_METHODS = ["現金", "信用卡", "八達通", "PayMe", "轉數快", "其他"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type MonthlyData = { year: number; month: number; total: number; count: number };

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [filterCat, setFilterCat] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("飲食");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [spentAt, setSpentAt] = useState(todayStr());

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const listParams: Record<string, string> = {};
  if (filterCat) listParams.category = filterCat;
  if (dateFrom) listParams.date_from = dateFrom;
  if (dateTo) listParams.date_to = dateTo;

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses", filterCat, dateFrom, dateTo],
    queryFn: () => api.listExpenses(listParams),
  });

  const statsParams: Record<string, string> = {};
  if (dateFrom) statsParams.date_from = dateFrom;
  if (dateTo) statsParams.date_to = dateTo;

  const { data: stats } = useQuery<ExpenseStats>({
    queryKey: ["expenses-stats", filterCat, dateFrom, dateTo],
    queryFn: () => api.expenseStats(statsParams),
  });

  const { data: monthly = [] } = useQuery<MonthlyData[]>({
    queryKey: ["expenses-monthly"],
    queryFn: () => api.expenseMonthly(6),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      amount: number;
      category: string;
      description?: string;
      merchant?: string;
      payment_method?: string;
      spent_at: string;
    }) => api.createExpense(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      setAmount("");
      setDescription("");
      setMerchant("");
      setShowForm(false);
      toast.success("已新增消費");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Expense[]>(
        ["expenses", filterCat, dateFrom, dateTo],
        (old) => old?.filter((exp) => exp.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    createMutation.mutate({
      amount: amt,
      category,
      description: description || undefined,
      merchant: merchant || undefined,
      payment_method: paymentMethod || undefined,
      spent_at: spentAt,
    });
  };

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">💰 消費記錄</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Stats summary */}
      {stats && (
        <section className="mb-6 p-4 border border-border rounded-lg">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-medium">本期統計</h2>
            <div className="text-2xl font-bold">
              ${stats.total.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            共 {stats.count} 筆
          </div>
          {Object.keys(stats.by_category).length > 0 && (
            <div className="space-y-1">
              {Object.entries(stats.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt]) => (
                  <div key={cat} className="flex items-center text-sm">
                    <span className="w-16 text-muted-foreground">{cat}</span>
                    <div className="flex-1 mx-2 h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded"
                        style={{
                          width: `${stats.total ? (amt / stats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs w-20 text-right">
                      ${amt.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Monthly trend chart */}
      {monthly.length > 0 && (
        <section className="mb-6 p-4 border border-border rounded-lg">
          <h2 className="font-medium mb-3">月度趨勢</h2>
          <div className="flex items-end gap-1 h-32">
            {(() => {
              const maxVal = Math.max(...monthly.map((m) => m.total), 1);
              return monthly.map((m) => (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-muted-foreground">
                    ${m.total >= 1000
                      ? `${(m.total / 1000).toFixed(1)}k`
                      : m.total.toFixed(0)}
                  </span>
                  <div className="w-full flex justify-center">
                    <div
                      className="w-4/5 bg-blue-500 rounded-t min-h-[2px]"
                      style={{
                        height: `${Math.max((m.total / maxVal) * 100, 2)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {m.month}月
                  </span>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        />
        <span className="text-muted-foreground text-sm">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        >
          <option value="">全部分類</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </section>

      {/* Add button / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 記一筆消費
        </button>
      ) : (
        <form
          onSubmit={handleAdd}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">金額 (HKD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-lg font-bold"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">分類</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">商家</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="例：麥當勞"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">付款方式</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">備註</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="（選填）"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">日期</label>
              <input
                type="date"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? "儲存中…" : "儲存"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Expense list */}
      <section className="space-y-2">
        {loadingExpenses ? (
          <Loading />
        ) : expenses.length === 0 ? (
          <EmptyState message="暫時冇消費記錄" />
        ) : (
          expenses.map((exp) => (
            <div
              key={exp.id}
              className="flex items-center p-3 border border-border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs px-2 py-0.5 bg-muted rounded">
                    {exp.category}
                  </span>
                  {exp.merchant && (
                    <span className="text-sm font-medium truncate">
                      {exp.merchant}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {exp.spent_at}
                  {exp.payment_method && ` · ${exp.payment_method}`}
                  {exp.description && ` · ${exp.description}`}
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="font-bold">
                  ${exp.amount.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(exp.id)}
                  className="text-xs text-red-500 hover:underline mt-1"
                  aria-label={`刪除 ${exp.merchant || exp.category} 消費`}
                >
                  刪除
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除消費"
        message="確定要刪除呢筆消費記錄？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
