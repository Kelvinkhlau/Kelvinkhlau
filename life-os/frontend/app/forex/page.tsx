"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type ForexDashboardGroup } from "@/lib/api";
import { Loading } from "@/components/Loading";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function GroupCard({ group }: { group: ForexDashboardGroup }) {
  const tagged = group.tagged;
  const pending = group.pending_tag;
  const total = tagged + pending;
  const taggedPct = total > 0 ? Math.round((tagged / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">{group.name}</h2>
          <code className="text-xs text-zinc-500">{group.code}</code>
        </div>
        <Link
          href={`/forex/transactions?group_id=${group.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          全部 tx →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-2xl font-semibold">{group.brokers}</div>
          <div className="text-xs text-zinc-500">Brokers</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-green-600">{tagged}</div>
          <div className="text-xs text-zinc-500">Tagged</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-amber-600">{pending}</div>
          <div className="text-xs text-zinc-500">Pending</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Tagging 進度</span>
          <span>{taggedPct}%</span>
        </div>
        <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${taggedPct}%` }}
          />
        </div>
      </div>

      {group.latest_reconciliation ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <div className="text-xs text-zinc-500 mb-1">最新對賬 ({group.latest_reconciliation.month})</div>
          <div className="flex justify-between items-center">
            <div className="flex gap-3 text-sm">
              <span>📋 {group.latest_reconciliation.total}</span>
              <span className="text-green-600">✅ {group.latest_reconciliation.matched}</span>
              <span className="text-amber-600">⚠️ {group.latest_reconciliation.flagged}</span>
            </div>
            <Link
              href={`/forex/reconciliation?group_id=${group.id}&month=${group.latest_reconciliation.month}`}
              className="text-sm text-blue-600 hover:underline"
            >
              詳情 →
            </Link>
          </div>
        </div>
      ) : (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 text-sm text-zinc-500">
          仲未跑過 reconciliation。
          <Link href="/forex/reconciliation" className="text-blue-600 hover:underline ml-1">
            去跑一次
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ForexDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["forex-dashboard"],
    queryFn: () => api.forexDashboard(),
    refetchInterval: 30_000,
  });

  if (dashboard.isLoading) return <Loading />;
  if (dashboard.isError)
    return <div className="p-6 text-red-600">載入失敗：{String(dashboard.error)}</div>;

  const groups = dashboard.data?.groups ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">外匯對賬</h1>
          <p className="text-sm text-zinc-500">朋友幫你管嘅 forex broker — TRON USDT 流水自動追蹤</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/forex/transactions"
            className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            交易記錄
          </Link>
          <Link
            href="/forex/reconciliation"
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            月結對賬
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-center text-zinc-500 py-12">
          冇 group。先 seed DB（<code>uv run python -m scripts.seed_forex</code>）
        </div>
      )}
    </div>
  );
}
