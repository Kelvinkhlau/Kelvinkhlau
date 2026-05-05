"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ForexReconciliationResult,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSigned(n: number): string {
  return (n >= 0 ? "+" : "") + fmtUsdt(n);
}

function defaultMonth(): string {
  // Default to LAST month (current month usually doesn't have a closing balance yet)
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ForexReconciliationPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = useQuery({
    queryKey: ["forex-groups"],
    queryFn: () => api.listForexGroups(),
  });

  const [groupId, setGroupId] = useState<number | "">("");
  const [month, setMonth] = useState<string>(defaultMonth());

  const result = useQuery({
    queryKey: ["forex-reconciliation", groupId, month],
    queryFn: () => api.getForexReconciliation(Number(groupId), month),
    enabled: !!groupId && !!month,
    retry: false,
  });

  const reconcile = useMutation({
    mutationFn: () => api.reconcileForex(Number(groupId), month),
    onSuccess: () => {
      toast.success(`已跑對賬 ${month}`);
      qc.invalidateQueries({ queryKey: ["forex-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`對賬失敗：${String(e)}`),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      api.importForexMonthlyReport(Number(groupId), file, month || undefined),
    onSuccess: (r) => {
      const warns = r.warnings.length ? `（${r.warnings.length} 個警告）` : "";
      toast.success(
        `已 import ${r.month}: 新 ${r.monthly_inserted}、改 ${r.monthly_updated}、broker 新建 ${r.brokers_created}${warns}`,
      );
      if (r.warnings.length) {
        for (const w of r.warnings) console.warn("forex import:", w);
      }
      qc.invalidateQueries({ queryKey: ["forex-reconciliation"] });
    },
    onError: (e) => toast.error(`Import 失敗：${String(e)}`),
  });

  if (groups.isLoading) return <Loading />;

  const totals = result.data?.summary?.totals;
  const rows = result.data?.summary?.rows ?? [];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/forex" className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">月結對賬</h1>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          <option value="">— 揀 group —</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        />

        <button
          onClick={() => reconcile.mutate()}
          disabled={!groupId || !month || reconcile.isPending}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {reconcile.isPending ? "跑緊…" : "跑對賬"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && groupId) upload.mutate(f);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!groupId || upload.isPending}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {upload.isPending ? "Import 緊…" : "📁 Import xlsx"}
        </button>
      </div>

      {!groupId && (
        <div className="text-center text-zinc-500 py-12">揀 group + 月份開始</div>
      )}

      {groupId && result.isLoading && <Loading />}

      {groupId && result.isError && (
        <div className="text-center text-zinc-500 py-12">
          仲未跑過 {month} 嘅對賬。撳「跑對賬」開始。
        </div>
      )}

      {result.data && totals && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label="Brokers"
              value={String(result.data.total_accounts)}
              hint={`✅ ${result.data.matched_count}   ⚠️ ${result.data.flagged_count}`}
            />
            <KpiCard
              label="Σ Reported P&L"
              value={fmtSigned(totals.reported_pnl)}
              tone={totals.reported_pnl >= 0 ? "pos" : "neg"}
            />
            <KpiCard
              label="Σ Expected P&L"
              value={fmtSigned(totals.expected_pnl)}
              tone={totals.expected_pnl >= 0 ? "pos" : "neg"}
            />
            <KpiCard
              label="Σ Variance"
              value={fmtSigned(totals.variance)}
              tone={Math.abs(totals.variance) > result.data.summary.tolerance_usdt ? "warn" : "ok"}
              hint={`tolerance ±${fmtUsdt(result.data.summary.tolerance_usdt)}`}
            />
          </div>

          <ReconciliationTable rows={rows} />
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "pos" | "neg" | "warn" | "ok";
}) {
  const colorMap: Record<string, string> = {
    pos: "text-green-600",
    neg: "text-red-600",
    warn: "text-amber-600",
    ok: "text-green-600",
  };
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-xl font-mono font-semibold ${tone ? colorMap[tone] : ""}`}>{value}</div>
      {hint && <div className="text-xs text-zinc-400">{hint}</div>}
    </div>
  );
}

function ReconciliationTable({ rows }: { rows: ForexReconciliationResult["summary"]["rows"] }) {
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const filtered = showOnlyFlagged ? rows.filter((r) => r.status === "flagged") : rows;

  return (
    <>
      <div className="flex items-center mb-2">
        <label className="text-sm flex items-center gap-1">
          <input
            type="checkbox"
            checked={showOnlyFlagged}
            onChange={(e) => setShowOnlyFlagged(e.target.checked)}
          />
          只顯示 flagged
        </label>
        <span className="text-sm text-zinc-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Broker</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 text-right">Opening</th>
              <th className="px-3 py-2 text-right">Closing</th>
              <th className="px-3 py-2 text-right">Reported P&L</th>
              <th className="px-3 py-2 text-right">Tracked In</th>
              <th className="px-3 py-2 text-right">Tracked Out</th>
              <th className="px-3 py-2 text-right">Expected P&L</th>
              <th className="px-3 py-2 text-right">Δ Variance</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.broker_id}
                className={`border-t border-zinc-200 dark:border-zinc-800 ${
                  r.status === "flagged" ? "bg-amber-50/50 dark:bg-amber-950/20" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium">{r.broker_name}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{r.owner ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsdt(r.opening)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsdt(r.closing)}</td>
                <td className={`px-3 py-2 text-right font-mono ${r.reported_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtSigned(r.reported_pnl)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtUsdt(r.tracked_in)}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtUsdt(r.tracked_out)}</td>
                <td className={`px-3 py-2 text-right font-mono ${r.expected_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmtSigned(r.expected_pnl)}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${r.status === "flagged" ? "text-amber-600" : "text-zinc-400"}`}>
                  {fmtSigned(r.variance)}
                </td>
                <td className="px-3 py-2">
                  {r.status === "matched" ? (
                    <span className="text-green-600 text-xs">✅ matched</span>
                  ) : (
                    <span className="text-amber-600 text-xs">⚠️ flagged</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                  冇 row
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
