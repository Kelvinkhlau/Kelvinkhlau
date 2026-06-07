"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ForexBroker,
  type ForexGroup,
  type ForexTransaction,
  type ForexWallet,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h;
}

function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-HK", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function TagInline({
  tx,
  brokers,
  wallets,
}: {
  tx: ForexTransaction;
  brokers: ForexBroker[];
  wallets: ForexWallet[];
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | "">("");
  const [open, setOpen] = useState(false);

  // Sort brokers: those owned by the wallet's owner first
  const sortedBrokers = useMemo(() => {
    const wallet = wallets.find((w) => w.id === tx.wallet_id);
    const hint = wallet?.label.split(" ")[0]?.toLowerCase() ?? "";
    return [...brokers]
      .filter((b) => b.group_id === tx.group_id)
      .sort((a, b) => {
        const aHit = (a.owner ?? "").toLowerCase() === hint ? 0 : 1;
        const bHit = (b.owner ?? "").toLowerCase() === hint ? 0 : 1;
        return aHit - bHit || a.name.localeCompare(b.name);
      });
  }, [brokers, wallets, tx.group_id, tx.wallet_id]);

  // fee / notes — tag 嗰陣可以填，唔填得，之後再補
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);

  const tag = useMutation({
    mutationFn: (brokerId: number) =>
      api.tagForexTransaction(tx.id, brokerId, {
        fee_usdt: fee.trim() ? Number(fee) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: (data) => {
      const broker = brokers.find((b) => b.id === data.broker_account_id);
      toast.success(
        `Tagged → ${broker?.name ?? "?"}${broker?.owner ? ` (${broker.owner})` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["forex-transactions"] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
      qc.invalidateQueries({ queryKey: ["forex-monthly"] });
      setOpen(false);
    },
    onError: (e) => toast.error(`Tag 失敗：${String(e)}`),
  });

  // 事後補 / 改 fee + notes
  const updateMeta = useMutation({
    mutationFn: () =>
      api.updateForexTransaction(tx.id, {
        fee_usdt: fee.trim() ? Number(fee) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("已更新手續費 / 備註");
      qc.invalidateQueries({ queryKey: ["forex-transactions"] });
      setEditing(false);
    },
    onError: (e) => toast.error(`更新失敗：${String(e)}`),
  });

  if (tx.status === "internal_transfer") {
    return <span className="text-zinc-500 text-xs">🔄 內部轉帳</span>;
  }

  // ── 已 tag：顯示 broker + fee/notes + ✎ 編輯 ──
  if (tx.status === "tagged") {
    const broker = brokers.find((b) => b.id === tx.broker_account_id);
    if (editing) {
      return (
        <div className="flex flex-col gap-1 max-w-[220px]">
          <input
            type="number"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="手續費 USDT（可留空）"
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="備註"
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
          />
          <div className="flex gap-1">
            <button
              onClick={() => updateMeta.mutate()}
              disabled={updateMeta.isPending}
              className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded disabled:opacity-50"
            >
              儲存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-0.5 border border-zinc-300 dark:border-zinc-700 rounded"
            >
              取消
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-green-700 dark:text-green-400 text-xs">
            ✓ {broker?.name ?? "?"}{broker?.owner ? ` (${broker.owner})` : ""}
          </span>
          <button
            onClick={() => {
              setFee(tx.fee_usdt != null ? String(tx.fee_usdt) : "");
              setNotes(tx.notes ?? "");
              setEditing(true);
            }}
            className="text-xs text-blue-600 hover:underline"
            title="補 / 改手續費"
          >
            ✎
          </button>
        </div>
        {tx.fee_usdt != null && (
          <span className="text-[11px] text-zinc-500">
            手續費 {fmtUsdt(tx.fee_usdt)}
          </span>
        )}
        {tx.notes && (
          <span className="text-[11px] text-zinc-400 truncate max-w-[200px]">
            {tx.notes}
          </span>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        Tag…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 max-w-[220px]">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")}
        className="text-xs px-1 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        autoFocus
      >
        <option value="">— 揀 broker —</option>
        {sortedBrokers.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}{b.owner ? ` (${b.owner})` : ""}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        placeholder="手續費 USDT（知就填，可留空）"
        className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="備註（可留空）"
        className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
      />
      <div className="flex gap-1">
        <button
          onClick={() => selected && tag.mutate(Number(selected))}
          disabled={!selected || tag.isPending}
          className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded disabled:opacity-50"
        >
          ✓ Tag
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs px-2 py-0.5 border border-zinc-300 dark:border-zinc-700 rounded"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function readParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function nextMonthFirst(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1); // m (1-based) → next month index
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function ForexTransactionsPage() {
  const [groupFilter, setGroupFilter] = useState<number | "">(() => {
    const v = readParam("group_id");
    return v ? Number(v) : "";
  });
  const [statusFilter, setStatusFilter] = useState<"" | "pending_tag" | "tagged" | "internal_transfer">(
    () => (readParam("status") as "" | "pending_tag" | "tagged" | "internal_transfer") || "",
  );
  const [directionFilter, setDirectionFilter] = useState<"" | "in" | "out">("");
  const [monthFilter, setMonthFilter] = useState<string>(() => readParam("month"));
  const qc = useQueryClient();

  const sync = useMutation({
    mutationFn: () => api.syncForexWallets(7),
    onSuccess: (r) => {
      toast.success(`同步完成：${r.total_new} 筆新交易`);
      qc.invalidateQueries({ queryKey: ["forex-transactions"] });
      qc.invalidateQueries({ queryKey: ["forex-monthly"] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`同步失敗：${String(e)}`),
  });

  const groups = useQuery({
    queryKey: ["forex-groups"],
    queryFn: () => api.listForexGroups(),
  });

  const allBrokers = useQuery({
    queryKey: ["forex-all-brokers"],
    queryFn: async () => {
      const gs = groups.data ?? [];
      const lists = await Promise.all(gs.map((g) => api.listForexBrokers(g.id)));
      return lists.flat();
    },
    enabled: !!groups.data,
  });

  const allWallets = useQuery({
    queryKey: ["forex-all-wallets"],
    queryFn: async () => {
      const gs = groups.data ?? [];
      const lists = await Promise.all(gs.map((g) => api.listForexWallets(g.id)));
      return lists.flat();
    },
    enabled: !!groups.data,
  });

  const txs = useQuery({
    queryKey: ["forex-transactions", groupFilter, statusFilter, directionFilter, monthFilter],
    queryFn: () =>
      api.listForexTransactions({
        group_id: groupFilter || undefined,
        status: statusFilter || undefined,
        direction: directionFilter || undefined,
        date_from: monthFilter ? `${monthFilter}-01` : undefined,
        date_to: monthFilter ? nextMonthFirst(monthFilter) : undefined,
        // If user selected internal_transfer specifically, the status filter handles it.
        // Otherwise default API behaviour hides them — surface them only when asked.
        include_internal: statusFilter === "internal_transfer",
        limit: 500,
      }),
  });

  if (groups.isLoading || allBrokers.isLoading || allWallets.isLoading) return <Loading />;

  const groupMap = new Map((groups.data ?? []).map((g) => [g.id, g]));
  const walletMap = new Map((allWallets.data ?? []).map((w) => [w.id, w]));

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/forex" className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">交易記錄</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          <option value="">所有 group</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | "pending_tag" | "tagged" | "internal_transfer")
          }
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          <option value="">所有 (隱藏內部)</option>
          <option value="pending_tag">⏳ Pending tag</option>
          <option value="tagged">✅ Tagged</option>
          <option value="internal_transfer">🔄 內部轉帳</option>
        </select>

        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as "" | "in" | "out")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          <option value="">所有 direction</option>
          <option value="in">🟢 In</option>
          <option value="out">🔴 Out</option>
        </select>

        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        />
        {monthFilter && (
          <button
            onClick={() => setMonthFilter("")}
            className="px-2 py-1.5 text-sm text-zinc-500 hover:underline"
          >
            清月份
          </button>
        )}

        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          title="即刻抓最新鏈上交易"
        >
          {sync.isPending ? "同步緊…" : "🔄 同步錢包"}
        </button>

        <span className="text-sm text-zinc-500 ml-auto self-center">
          {txs.data?.length ?? 0} 條
        </span>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Group / Wallet</th>
              <th className="px-3 py-2">Dir</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Counterparty</th>
              <th className="px-3 py-2">Tx</th>
              <th className="px-3 py-2">Broker</th>
            </tr>
          </thead>
          <tbody>
            {(txs.data ?? []).map((tx) => {
              const grp = groupMap.get(tx.group_id);
              const wal = walletMap.get(tx.wallet_id);
              return (
                <tr key={tx.id} className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(tx.block_timestamp)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-zinc-500">{grp?.code}</span> /{" "}
                    <span>{wal?.label.split(" ")[0]}</span>
                  </td>
                  <td className="px-3 py-2">
                    {tx.direction === "in" ? "🟢" : "🔴"}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${tx.direction === "in" ? "text-green-600" : "text-red-600"}`}>
                    {tx.direction === "in" ? "+" : "−"}{fmtUsdt(tx.amount_usdt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{shortAddr(tx.counterparty_address)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{shortHash(tx.tx_hash)}</td>
                  <td className="px-3 py-2">
                    <TagInline
                      tx={tx}
                      brokers={allBrokers.data ?? []}
                      wallets={allWallets.data ?? []}
                    />
                  </td>
                </tr>
              );
            })}
            {(txs.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  冇符合條件嘅 tx
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
