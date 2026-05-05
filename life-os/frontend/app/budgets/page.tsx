"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Budget } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const CATEGORIES = [
  "飲食", "交通", "娛樂", "購物", "住屋", "醫療", "教育", "日用品", "subscriptions", "其他",
];

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("飲食");
  const [amount, setAmount] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: () => api.listBudgets(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createBudget({ category, amount: parseFloat(amount) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setShowForm(false);
      setAmount("");
      toast.success("已新增預算");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">預算管理</h1>
      </div>

      {budgets.length > 0 && (
        <div className="mb-4 p-4 border border-border rounded-lg">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">本月預算</span>
            <span className="font-bold">
              ${totalSpent.toLocaleString("zh-HK", { minimumFractionDigits: 2 })} / ${totalBudget.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 h-3 bg-muted rounded overflow-hidden">
            <div
              className={`h-full rounded ${totalSpent > totalBudget ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增預算
        </button>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">分類</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">每月預算 (HKD)</label>
              <input
                type="number"
                step="1"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !amount}
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

      <section className="space-y-3">
        {isLoading ? (
          <Loading />
        ) : budgets.length === 0 ? (
          <EmptyState message="暫時冇設定預算" />
        ) : (
          budgets.map((b) => (
            <div key={b.id} className="p-3 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{b.category}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm">
                    <span className={b.percentage > 100 ? "text-red-600 font-bold" : ""}>
                      ${b.spent.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
                    </span>
                    {" / "}${b.amount.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(b.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    刪除
                  </button>
                </div>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div
                  className={`h-full rounded ${b.percentage > 100 ? "bg-red-500" : b.percentage > 80 ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(b.percentage, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{b.percentage.toFixed(0)}% 已用</span>
                <span>剩餘 ${b.remaining.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除預算"
        message="確定要刪除呢個預算？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
