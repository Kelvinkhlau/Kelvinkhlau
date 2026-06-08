"use client";

import Link from "next/link";
import { useState, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ForexGroupTransfer } from "@/lib/api";
import { Loading } from "@/components/Loading";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n: number): string {
  return (n >= 0 ? "+" : "") + fmtUsdt(n);
}
function pctStr(pnl: number, opening: number): string {
  if (opening === 0) return "—";
  return (pnl >= 0 ? "+" : "") + ((pnl / opening) * 100).toFixed(2) + "%";
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function readParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}
const METHOD_LABEL: Record<string, string> = {
  bank: "銀行匯款", crypto: "加密貨幣", setup: "結轉", other: "其他",
};

export default function ForexReportPage() {
  const groups = useQuery({ queryKey: ["forex-groups"], queryFn: () => api.listForexGroups() });

  const [groupId, setGroupId] = useState<number | "">(() => {
    const v = readParam("group_id");
    return v ? Number(v) : "";
  });
  const [month, setMonth] = useState<string>(() => readParam("month") || currentMonth());

  // 靜態匯出 + client 導航下，lazy init 可能讀唔到 URL → 載入後正式讀返一次
  useEffect(() => {
    const m = readParam("month");
    if (m) setMonth(m);
    const g = readParam("group_id");
    if (g) setGroupId(Number(g));
  }, []);

  const gid =
    groupId || groups.data?.find((g) => g.code === "personal")?.id || groups.data?.[0]?.id || "";
  const group = groups.data?.find((g) => g.id === gid);

  const view = useQuery({
    queryKey: ["forex-monthly", gid, month],
    queryFn: () => api.getForexMonthly(Number(gid), month),
    enabled: !!gid,
  });
  const transfers = useQuery({
    queryKey: ["forex-group-transfers", gid, month],
    queryFn: () => api.listForexGroupTransfers(Number(gid), month),
    enabled: !!gid,
  });

  if (groups.isLoading) return <Loading />;

  const rows = view.data?.rows ?? [];
  const totals = view.data?.totals;
  const xfers = transfers.data ?? [];
  // 出入金明細：按 broker 分組
  const byBroker = new Map<number, ForexGroupTransfer[]>();
  for (const t of xfers) {
    const arr = byBroker.get(t.broker_id) ?? [];
    arr.push(t);
    byBroker.set(t.broker_id, arr);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 print-report">
      {/* 控制列（打印時隱藏） */}
      <div className="flex flex-wrap items-center gap-2 mb-6 no-print">
        <Link href="/forex/private" className="text-sm text-blue-600 hover:underline">← 月結</Link>
        <select value={gid} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded">
          {(groups.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded" />
        <button onClick={() => window.print()}
          className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700">
          🖨 列印 / 存 PDF
        </button>
      </div>

      {(view.isLoading || transfers.isLoading) && <Loading />}

      {totals && (
        <div className="text-zinc-900 dark:text-zinc-100 print:text-black">
          {/* 報告頭 */}
          <div className="mb-5">
            <h1 className="text-2xl font-bold">{group?.name ?? "外匯"} — 月結報告</h1>
            <div className="text-sm text-zinc-500">
              月份：{month}
              {group?.partner_name && <>　·　分潤夥伴：{group.partner_name}（{group.partner_split_pct ?? 50}%）</>}
            </div>
          </div>

          {/* 摘要 */}
          <div className="grid grid-cols-3 gap-2 mb-5 text-sm">
            <Box label="戶口數" value={String(rows.length)} />
            <Box label="Σ 上月結餘" value={fmtUsdt(totals.opening)} />
            <Box label="Σ 最新結餘" value={fmtUsdt(totals.closing)} />
            <Box label="Σ 出金" value={fmtUsdt(totals.withdrawal)} />
            <Box label="Σ 入金" value={fmtUsdt(totals.deposit)} />
            <Box label="Σ 月利潤 (P/L)" value={fmtSigned(totals.pnl)} />
          </div>

          {/* 主表 */}
          <h2 className="font-semibold mb-2">各戶口月結</h2>
          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="border-b-2 border-zinc-400 text-left text-xs">
                <th className="py-1 pr-2">持有人</th>
                <th className="py-1 pr-2">Broker</th>
                <th className="py-1 px-2 text-right">上月結餘</th>
                <th className="py-1 px-2 text-right">出金</th>
                <th className="py-1 px-2 text-right">入金</th>
                <th className="py-1 px-2 text-right">最新結餘</th>
                <th className="py-1 px-2 text-right">P/L</th>
                <th className="py-1 pl-2 text-right">P/L %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const det = byBroker.get(r.broker_id) ?? [];
                return (
                  <Fragment key={r.broker_id}>
                    <tr className="border-b border-zinc-200 avoid-break">
                      <td className="py-1 pr-2 text-zinc-500">{r.owner ?? "—"}</td>
                      <td className="py-1 pr-2 font-medium">{r.broker_name}</td>
                      <td className="py-1 px-2 text-right font-mono">{fmtUsdt(r.opening)}</td>
                      <td className="py-1 px-2 text-right font-mono">{fmtUsdt(r.withdrawal)}</td>
                      <td className="py-1 px-2 text-right font-mono">{fmtUsdt(r.deposit)}</td>
                      <td className="py-1 px-2 text-right font-mono">{r.has_data ? fmtUsdt(r.closing) : "—"}</td>
                      <td className="py-1 px-2 text-right font-mono">{r.has_data ? fmtSigned(r.pnl) : "—"}</td>
                      <td className="py-1 pl-2 text-right font-mono">{r.has_data ? pctStr(r.pnl, r.opening) : "—"}</td>
                    </tr>
                    {det.map((t) => (
                      <tr key={`${t.source}-${t.id}`} className="border-b border-zinc-100 text-xs text-zinc-500">
                        <td></td>
                        <td className="py-0.5 pr-2 pl-3">
                          ↳ {t.date} · {t.flow === "withdrawal" ? "出金" : "入金"} · {METHOD_LABEL[t.method] ?? t.method} · {t.source === "wallet" ? "鏈上" : "人手"}
                        </td>
                        <td></td>
                        <td className="py-0.5 px-2 text-right font-mono">{t.flow === "withdrawal" ? fmtUsdt(t.amount) : ""}</td>
                        <td className="py-0.5 px-2 text-right font-mono">{t.flow === "deposit" ? fmtUsdt(t.amount) : ""}</td>
                        <td colSpan={3}></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-400 font-semibold">
                <td className="py-1 pr-2" colSpan={2}>Total</td>
                <td className="py-1 px-2 text-right font-mono">{fmtUsdt(totals.opening)}</td>
                <td className="py-1 px-2 text-right font-mono">{fmtUsdt(totals.withdrawal)}</td>
                <td className="py-1 px-2 text-right font-mono">{fmtUsdt(totals.deposit)}</td>
                <td className="py-1 px-2 text-right font-mono">{fmtUsdt(totals.closing)}</td>
                <td className="py-1 px-2 text-right font-mono">{fmtSigned(totals.pnl)}</td>
                <td className="py-1 pl-2 text-right font-mono">{pctStr(totals.pnl, totals.opening)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="text-xs text-zinc-400 mt-2">
            ↳ = 該戶口嘅出入金明細
          </div>

          <div className="text-xs text-zinc-400 mt-6">
            報告由 life-os 產生 · {month}
          </div>
        </div>
      )}
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-300 dark:border-zinc-700 p-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}
