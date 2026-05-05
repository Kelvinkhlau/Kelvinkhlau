"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Expense, type ExpenseSplitInput } from "@/lib/api";
import { Loading } from "./Loading";
import { toast } from "./Toast";

type Props = {
  expense: Expense;
  onClose: () => void;
};

type Row = {
  member_id: number | null; // null = 自己
  name: string;
  amount: string; // string 方便 input
  is_paid: boolean;
};

export function ExpenseSplitsModal({ expense, onClose }: Props) {
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ["family-members-active"],
    queryFn: () => api.listFamilyMembers(true),
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["splits", expense.id],
    queryFn: () => api.listExpenseSplits(expense.id),
  });

  const [rows, setRows] = useState<Row[]>([]);

  // 初始化：用 existing splits；如無，default 拎「自己」一行
  useEffect(() => {
    if (existing === undefined) return;
    if (existing.length > 0) {
      setRows(
        existing.map((s) => ({
          member_id: s.member_id,
          name:
            s.member_id === null
              ? "自己"
              : members.find((m) => m.id === s.member_id)?.name ?? "未知",
          amount: String(s.amount),
          is_paid: s.is_paid,
        }))
      );
    } else {
      setRows([
        {
          member_id: null,
          name: "自己",
          amount: String(expense.amount),
          is_paid: true,
        },
      ]);
    }
  }, [existing, members, expense.amount]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: ExpenseSplitInput[] = rows
        .filter((r) => parseFloat(r.amount) > 0)
        .map((r) => ({
          member_id: r.member_id,
          amount: parseFloat(r.amount),
          is_paid: r.is_paid,
        }));
      return api.setExpenseSplits(expense.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["splits", expense.id] });
      queryClient.invalidateQueries({ queryKey: ["member-owed"] });
      toast.success("已儲存分攤");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const usedMemberIds = new Set(rows.map((r) => r.member_id));
  const availableMembers = members.filter((m) => !usedMemberIds.has(m.id));

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining = expense.amount - total;

  const addRow = (member_id: number | null, name: string) => {
    // 預設平分剩餘
    const defaultAmt = Math.max(0, remaining).toFixed(2);
    setRows([
      ...rows,
      { member_id, name, amount: defaultAmt, is_paid: false },
    ]);
  };

  const equalSplit = () => {
    if (rows.length === 0) return;
    const per = (expense.amount / rows.length).toFixed(2);
    setRows(rows.map((r) => ({ ...r, amount: per })));
  };

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
  };

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
          <h2 className="text-lg font-semibold">分攤消費</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 p-3 bg-muted rounded text-sm">
          <div className="font-medium">
            {expense.merchant || expense.category}
          </div>
          <div className="text-muted-foreground mt-0.5">
            總金額：${expense.amount.toFixed(2)} · {(expense.spent_at || "").slice(0, 16).replace("T", " ")}
          </div>
        </div>

        {isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="space-y-2 mb-3">
              {rows.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 border border-border rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.name}</div>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                      <input
                        type="checkbox"
                        checked={r.is_paid}
                        onChange={(e) =>
                          updateRow(idx, { is_paid: e.target.checked })
                        }
                      />
                      已付
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.amount}
                    onChange={(e) => updateRow(idx, { amount: e.target.value })}
                    className="w-24 px-2 py-1.5 border border-border rounded bg-background text-right text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    刪
                  </button>
                </div>
              ))}
            </div>

            {/* Add member */}
            <div className="mb-3 space-y-1.5">
              {!rows.some((r) => r.member_id === null) && (
                <button
                  type="button"
                  onClick={() => addRow(null, "自己")}
                  className="w-full text-left text-xs px-3 py-2 border border-dashed border-border rounded hover:bg-muted"
                >
                  + 加入自己
                </button>
              )}
              {availableMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addRow(m.id, m.name)}
                  className="w-full text-left text-xs px-3 py-2 border border-dashed border-border rounded hover:bg-muted flex items-center gap-2"
                >
                  <span
                    className="inline-block w-4 h-4 rounded-full"
                    style={{ backgroundColor: m.color || "#888" }}
                  />
                  + {m.name}
                  {m.relation && (
                    <span className="text-muted-foreground">({m.relation})</span>
                  )}
                </button>
              ))}
              {availableMembers.length === 0 &&
                rows.every((r) => r.member_id !== null) && (
                  <div className="text-xs text-muted-foreground text-center">
                    所有家庭成員已加入
                  </div>
                )}
            </div>

            {/* Totals */}
            <div className="mb-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span>分攤總額</span>
                <span
                  className={`tabular-nums ${
                    Math.abs(remaining) < 0.01
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  ${total.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>剩餘未分</span>
                <span className="tabular-nums">${remaining.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={equalSplit}
                disabled={rows.length === 0}
                className="px-3 py-2 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
              >
                平分
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || rows.length === 0}
                className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50 text-sm"
              >
                {saveMutation.isPending ? "儲存中…" : "儲存"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm border border-border rounded hover:bg-muted"
              >
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
