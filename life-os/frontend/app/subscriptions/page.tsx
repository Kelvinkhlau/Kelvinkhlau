"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Subscription } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const CYCLES = [
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
  { value: "weekly", label: "每週" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [nextBilling, setNextBilling] = useState(todayStr());
  const [note, setNote] = useState("");
  const [autoCreate, setAutoCreate] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState<number | "">("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["subscriptions", showAll],
    queryFn: () => api.listSubscriptions(!showAll),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts", true],
    queryFn: () => api.listBankAccounts(true),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSubscription({
        name,
        amount: parseFloat(amount),
        cycle,
        next_billing: nextBilling,
        note: note || undefined,
        auto_create_expense: autoCreate,
        merchant: merchant || null,
        payment_account_id:
          typeof paymentAccountId === "number" ? paymentAccountId : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      setShowForm(false);
      setName("");
      setAmount("");
      setNote("");
      setMerchant("");
      setAutoCreate(false);
      setPaymentAccountId("");
      toast.success("已新增訂閱");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.updateSubscription(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  const toggleAutoCreateMutation = useMutation({
    mutationFn: ({ id, auto }: { id: number; auto: boolean }) =>
      api.updateSubscription(id, { auto_create_expense: auto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("已更新");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const triggerRecurringMutation = useMutation({
    mutationFn: () => api.triggerRecurring(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(
        `已處理 ${r.processed} 筆訂閱，產生 ${r.generated} 筆消費`
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const monthlyTotal = subs
    .filter((s) => s.active)
    .reduce((sum, s) => {
      if (s.cycle === "yearly") return sum + s.amount / 12;
      if (s.cycle === "weekly") return sum + s.amount * 4.33;
      return sum + s.amount;
    }, 0);

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">訂閱管理</h1>
        <button
          type="button"
          onClick={() => triggerRecurringMutation.mutate()}
          disabled={triggerRecurringMutation.isPending}
          className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted disabled:opacity-50"
          title="手動掃描 auto-generate 訂閱"
        >
          {triggerRecurringMutation.isPending ? "處理中…" : "立即產生"}
        </button>
      </div>

      <div className="mb-4 p-4 border border-border rounded-lg">
        <div className="text-sm text-muted-foreground">每月訂閱總額（估算）</div>
        <div className="text-2xl font-bold mt-1">
          ${monthlyTotal.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          顯示已停用
        </label>
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增訂閱
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">名稱</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：Netflix"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
                autoFocus
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">金額 (HKD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">週期</label>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                {CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">下次扣費日</label>
              <input
                type="date"
                value={nextBilling}
                onChange={(e) => setNextBilling(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">商家（可選）</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="例：Netflix Inc."
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">付款帳戶</label>
              <select
                value={paymentAccountId}
                onChange={(e) =>
                  setPaymentAccountId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                <option value="">（不指定）</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon ? `${a.icon} ` : ""}
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">備註</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="（選填）"
              className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
            />
          </div>

          <label className="flex items-start gap-2 text-sm p-3 bg-muted/50 rounded">
            <input
              type="checkbox"
              checked={autoCreate}
              onChange={(e) => setAutoCreate(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">自動產生消費記錄</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                每到扣費日系統會自動建一筆消費記錄（以避免遺漏）
              </div>
            </div>
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim() || !amount}
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

      <section className="space-y-2">
        {isLoading ? (
          <Loading />
        ) : subs.length === 0 ? (
          <EmptyState message="暫時冇訂閱記錄" />
        ) : (
          subs.map((sub) => (
            <div
              key={sub.id}
              className={`flex items-center p-3 border border-border rounded-lg ${
                !sub.active ? "opacity-50" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">{sub.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {CYCLES.find((c) => c.value === sub.cycle)?.label ||
                      sub.cycle}
                  </span>
                  {sub.auto_create_expense && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded">
                      自動產生
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  下次扣費：{sub.next_billing}
                  {sub.note && ` · ${sub.note}`}
                </div>
              </div>
              <div className="text-right ml-3">
                <div className="font-bold">
                  ${sub.amount.toLocaleString("zh-HK", { minimumFractionDigits: 2 })}
                </div>
                <div className="flex gap-2 mt-1 justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      toggleAutoCreateMutation.mutate({
                        id: sub.id,
                        auto: !sub.auto_create_expense,
                      })
                    }
                    className="text-[10px] text-blue-500 hover:underline"
                    title="切換自動產生"
                  >
                    {sub.auto_create_expense ? "停自動" : "啟自動"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      toggleMutation.mutate({ id: sub.id, active: !sub.active })
                    }
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {sub.active ? "停用" : "啟用"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(sub.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除訂閱"
        message="確定要刪除呢個訂閱？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
