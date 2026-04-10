"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { api, type Expense, type ExpenseStats } from "@/lib/api";

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

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterCat) params.category = filterCat;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const [list, s] = await Promise.all([
        api.listExpenses(params),
        api.expenseStats(params),
      ]);
      setExpenses(list);
      setStats(s);
    } catch {
      /* ignore */
    }
  }, [filterCat, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await api.createExpense({
        amount: amt,
        category,
        description: description || undefined,
        merchant: merchant || undefined,
        payment_method: paymentMethod || undefined,
        spent_at: spentAt,
      });
      setAmount("");
      setDescription("");
      setMerchant("");
      setShowForm(false);
      load();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteExpense(id);
      load();
    } catch {
      /* ignore */
    }
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
              disabled={saving}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {saving ? "儲存中…" : "儲存"}
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
        {expenses.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            暫時冇消費記錄
          </p>
        )}
        {expenses.map((exp) => (
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
                onClick={() => handleDelete(exp.id)}
                className="text-xs text-red-500 hover:underline mt-1"
              >
                刪除
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
