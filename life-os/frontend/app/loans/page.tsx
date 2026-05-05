"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Loan, type LoanDetail } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money } from "@/components/Money";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  active: "進行中",
  settled: "已結清",
  overdue: "逾期",
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  settled: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function LoansPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "lent" | "borrowed">("all");
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // form state
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [startedAt, setStartedAt] = useState(todayStr());
  const [dueAt, setDueAt] = useState("");
  const [description, setDescription] = useState("");

  const { data: summary } = useQuery({
    queryKey: ["loan-summary"],
    queryFn: () => api.loanSummary(),
  });

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans", filter],
    queryFn: () =>
      api.listLoans(filter === "all" ? undefined : { direction: filter }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createLoan({
        direction,
        counterparty,
        amount: parseFloat(amount),
        started_at: startedAt,
        due_at: dueAt || null,
        description: description || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-summary"] });
      setShowForm(false);
      setCounterparty("");
      setAmount("");
      setDueAt("");
      setDescription("");
      toast.success("已新增借貸記錄");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLoan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-summary"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="min-h-full max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">借貸管理</h1>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-4 border border-border rounded-lg">
            <div className="text-xs text-muted-foreground">借出（未收回）</div>
            <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              <Money value={summary.lent_outstanding} decimals={2} prefix="$" />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {summary.lent_count} 筆
            </div>
          </div>
          <div className="p-4 border border-border rounded-lg">
            <div className="text-xs text-muted-foreground">欠人（未還）</div>
            <div className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
              <Money value={summary.borrowed_outstanding} decimals={2} prefix="$" />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {summary.borrowed_count} 筆
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "lent", "borrowed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filter === f
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "全部" : f === "lent" ? "借出" : "借入"}
          </button>
        ))}
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增借貸
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
            <button
              type="button"
              onClick={() => setDirection("lent")}
              className={`flex-1 py-2 rounded border ${
                direction === "lent"
                  ? "bg-emerald-500/10 border-emerald-500 text-emerald-600"
                  : "border-border text-muted-foreground"
              }`}
            >
              借出（別人欠我）
            </button>
            <button
              type="button"
              onClick={() => setDirection("borrowed")}
              className={`flex-1 py-2 rounded border ${
                direction === "borrowed"
                  ? "bg-red-500/10 border-red-500 text-red-600"
                  : "border-border text-muted-foreground"
              }`}
            >
              借入（我欠別人）
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">對方</label>
              <input
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="例：阿明"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
                autoFocus
              />
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">金額</label>
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
              <label className="text-xs text-muted-foreground">開始日期</label>
              <input
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">到期日（可選）</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">備註</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="（選填）"
              className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={
                createMutation.isPending || !counterparty.trim() || !amount
              }
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
        ) : loans.length === 0 ? (
          <EmptyState message="暫時冇借貸記錄" />
        ) : (
          loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              onOpen={() => setDetailId(loan.id)}
              onDelete={() => setDeleteTarget(loan.id)}
            />
          ))
        )}
      </section>

      {detailId !== null && (
        <LoanDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除借貸記錄"
        message="確定要刪除？所有還款記錄會一齊移除。"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

function LoanCard({
  loan,
  onOpen,
  onDelete,
}: {
  loan: Loan;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const outstanding = loan.amount - loan.repaid_amount;
  const progress = loan.amount > 0 ? (loan.repaid_amount / loan.amount) * 100 : 0;
  return (
    <div className="p-3 border border-border rounded-lg">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium truncate">{loan.counterparty}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                STATUS_CLASS[loan.status] || "bg-muted"
              }`}
            >
              {STATUS_LABEL[loan.status] || loan.status}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {loan.direction === "lent" ? "借出" : "借入"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {loan.started_at}
            {loan.due_at && ` → 到期 ${loan.due_at}`}
            {loan.description && ` · ${loan.description}`}
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </button>
        <div className="text-right shrink-0">
          <div className="font-bold">
            <Money value={outstanding} decimals={2} prefix="$" />
          </div>
          <div className="text-[10px] text-muted-foreground">
            / <Money value={loan.amount} decimals={2} prefix="$" />
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="text-[11px] text-red-500 hover:underline mt-1"
          >
            刪除
          </button>
        </div>
      </div>
    </div>
  );
}

function LoanDetailModal({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: detail, isLoading } = useQuery<LoanDetail>({
    queryKey: ["loan", id],
    queryFn: () => api.getLoan(id),
  });

  const [repayAmount, setRepayAmount] = useState("");
  const [repayDate, setRepayDate] = useState(todayStr());
  const [repayNote, setRepayNote] = useState("");

  const addRepayMutation = useMutation({
    mutationFn: () =>
      api.addLoanRepayment(id, {
        amount: parseFloat(repayAmount),
        paid_at: repayDate,
        note: repayNote || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan", id] });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-summary"] });
      setRepayAmount("");
      setRepayNote("");
      toast.success("已加還款");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteRepayMutation = useMutation({
    mutationFn: (rid: number) => api.deleteLoanRepayment(id, rid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan", id] });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["loan-summary"] });
      toast.success("已刪除");
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">借貸詳情</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {isLoading || !detail ? (
          <Loading />
        ) : (
          <>
            <div className="mb-3 p-3 bg-muted rounded">
              <div className="font-medium">{detail.counterparty}</div>
              <div className="text-sm mt-1">
                借貸金額：
                <Money value={detail.amount} decimals={2} prefix="$" />
              </div>
              <div className="text-sm">
                已還：
                <Money value={detail.repaid_amount} decimals={2} prefix="$" />
              </div>
              <div className="text-sm font-bold mt-1">
                尚欠：
                <Money value={detail.outstanding} decimals={2} prefix="$" />
              </div>
            </div>

            {/* Add repayment */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addRepayMutation.mutate();
              }}
              className="mb-4 space-y-2"
            >
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={detail.outstanding || undefined}
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="還款金額"
                  className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
                  required
                />
                <input
                  type="date"
                  value={repayDate}
                  onChange={(e) => setRepayDate(e.target.value)}
                  className="px-3 py-2 border border-border rounded bg-background text-sm"
                  required
                />
              </div>
              <input
                type="text"
                value={repayNote}
                onChange={(e) => setRepayNote(e.target.value)}
                placeholder="備註（選填）"
                className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
              />
              <button
                type="submit"
                disabled={addRepayMutation.isPending || !repayAmount}
                className="w-full py-2 bg-foreground text-background rounded font-medium disabled:opacity-50 text-sm"
              >
                {addRepayMutation.isPending ? "儲存中…" : "加還款"}
              </button>
            </form>

            {/* Repayment list */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                還款記錄（{detail.repayments.length}）
              </div>
              {detail.repayments.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">
                  尚未有還款
                </div>
              ) : (
                detail.repayments.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        <Money value={r.amount} decimals={2} prefix="$" />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.paid_at}
                        {r.note && ` · ${r.note}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteRepayMutation.mutate(r.id)}
                      className="text-[11px] text-red-500 hover:underline"
                    >
                      刪
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
