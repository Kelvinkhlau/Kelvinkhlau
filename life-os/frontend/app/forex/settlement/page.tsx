"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n: number): string {
  return (n >= 0 ? "+" : "") + fmtUsdt(n);
}

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

function recentQuarters(count = 8): string[] {
  const d = new Date();
  let y = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-Q${q}`);
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }
  return out;
}

export default function ForexSettlementPage() {
  const qc = useQueryClient();
  const quarters = useMemo(() => recentQuarters(), []);

  const groups = useQuery({
    queryKey: ["forex-groups"],
    queryFn: () => api.listForexGroups(),
  });

  const [groupId, setGroupId] = useState<number | "">("");
  const [quarter, setQuarter] = useState<string>(currentQuarter());

  const resolvedGroupId =
    groupId || groups.data?.find((g) => g.code === "personal")?.id || groups.data?.[0]?.id || "";

  // Base preview = auto fees, paid 0 → gives gross_pnl, carry_in, auto fees
  const preview = useQuery({
    queryKey: ["forex-settlement-preview", resolvedGroupId, quarter],
    queryFn: () => api.getForexSettlementPreview(Number(resolvedGroupId), quarter),
    enabled: !!resolvedGroupId && !!quarter,
  });

  const history = useQuery({
    queryKey: ["forex-settlements", resolvedGroupId],
    queryFn: () => api.listForexSettlements(Number(resolvedGroupId)),
    enabled: !!resolvedGroupId,
  });

  // Editable inputs
  const [paid, setPaid] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const save = useMutation({
    mutationFn: () =>
      api.saveForexSettlement(Number(resolvedGroupId), quarter, {
        total_fees: null,
        paid_amount: parseFloat(paid) || 0,
        paid_tx_hash: txHash.trim() || null,
        paid_at: paidAt ? new Date(paidAt).toISOString() : null,
        notes: notes.trim() || null,
        status: "settled",
      }),
    onSuccess: () => {
      toast.success(`已確認 ${quarter} 結算`);
      qc.invalidateQueries({ queryKey: ["forex-settlements"] });
      qc.invalidateQueries({ queryKey: ["forex-settlement-preview"] });
    },
    onError: (e) => toast.error(`結算失敗：${String(e)}`),
  });

  if (groups.isLoading) return <Loading />;

  const p = preview.data;
  const pct = p?.partner_split_pct ?? 50;
  const gross = p?.gross_pnl ?? 0;
  const carryIn = p?.carry_in ?? 0;

  // Live client-side math（手續費已包含喺月度 P/L，毛利即淨利）
  const net = gross;
  const distributable = net + carryIn;
  const suggestedShare = distributable > 0 ? Math.round((distributable * pct) / 100 * 100) / 100 : 0;
  const paidNum = paid.trim() === "" ? 0 : parseFloat(paid) || 0;
  const carryOut = Math.round((distributable - 2 * paidNum) * 100) / 100;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/forex" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold">季度分潤結算</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <select
          value={resolvedGroupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
        {p?.partner_name && (
          <span className="text-sm text-zinc-500">夥伴：<b>{p.partner_name}</b>（{pct}%）</span>
        )}
      </div>

      {preview.isLoading && <Loading />}
      {preview.isError && (
        <div className="text-red-600 py-8">載入失敗：{String(preview.error)}</div>
      )}

      {p && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* 左：計算明細 */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2 text-sm">
            <h2 className="font-semibold mb-2">{quarter} 計算（{p.months.join(" / ")}）</h2>
            <Line label="季度淨利潤 (Σ 月 P/L)" value={fmtSigned(net)} tone={net >= 0 ? "pos" : "neg"} bold />
            <Line label="上季 carry-forward" value={fmtSigned(carryIn)} tone={carryIn >= 0 ? "pos" : "neg"} />
            <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
            <Line label="可分配" value={fmtSigned(distributable)} tone={distributable >= 0 ? "pos" : "neg"} bold />
            <Line
              label={`${p.partner_name ?? "夥伴"} 應得（${pct}%）`}
              value={distributable > 0 ? fmtUsdt(suggestedShare) : "—（蝕，不派）"}
              tone={distributable > 0 ? "pos" : undefined}
            />
            <Line label="今季 carry-forward（落下季）" value={fmtSigned(carryOut)} tone={carryOut >= 0 ? "pos" : "neg"} />
          </div>

          {/* 右：確認轉賬 */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 text-sm">
            <h2 className="font-semibold">確認轉賬俾 {p.partner_name ?? "夥伴"}</h2>
            <Field label="實際轉賬金額 (USDT)">
              <div className="flex items-center gap-2">
                <input
                  className="w-40 px-2 py-1 text-right font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
                  inputMode="decimal"
                  placeholder={distributable > 0 ? fmtUsdt(suggestedShare) : "0"}
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
                {distributable > 0 && (
                  <button
                    onClick={() => setPaid(String(suggestedShare))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    用建議 {fmtUsdt(suggestedShare)}
                  </button>
                )}
              </div>
            </Field>
            <Field label="轉賬 TX hash（可選）">
              <input
                className="w-full px-2 py-1 font-mono text-xs border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
              />
            </Field>
            <Field label="轉賬日期（可選）">
              <input
                type="date"
                className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </Field>
            <Field label="備註（可選）">
              <input
                className="w-full px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !resolvedGroupId}
              className="w-full px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {save.isPending ? "儲存緊…" : "確認結算並記錄"}
            </button>
            <p className="text-xs text-zinc-400">
              確認後會 snapshot 今季數字，carry-forward 自動帶落下季。
            </p>
          </div>
        </div>
      )}

      {/* 歷史 */}
      <h2 className="font-semibold mt-8 mb-2">結算記錄</h2>
      <div className="overflow-x-auto bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">季度</th>
              <th className="px-3 py-2 text-right">淨利潤</th>
              <th className="px-3 py-2 text-right">carry-in</th>
              <th className="px-3 py-2 text-right">可分配</th>
              <th className="px-3 py-2 text-right">派俾夥伴</th>
              <th className="px-3 py-2 text-right">carry-out</th>
              <th className="px-3 py-2">日期</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {(history.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium">{s.quarter}</td>
                <td className={`px-3 py-2 text-right font-mono ${s.net_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtSigned(s.net_pnl)}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtSigned(s.carry_in)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtSigned(s.distributable)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUsdt(s.paid_amount)}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtSigned(s.carry_out)}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{s.paid_at ? s.paid_at.slice(0, 10) : "—"}</td>
                <td className="px-3 py-2 text-xs">{s.status === "settled" ? "✅ 已結算" : "草稿"}</td>
              </tr>
            ))}
            {(history.data ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">未有結算記錄</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  bold?: boolean;
}) {
  const color = tone === "pos" ? "text-green-600" : tone === "neg" ? "text-red-600" : "";
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono ${color} ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
