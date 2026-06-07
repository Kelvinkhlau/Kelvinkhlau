"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ForexMonthlyRow, type ForexTransfer } from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";

function fmtUsdt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n: number): string {
  return (n >= 0 ? "+" : "") + fmtUsdt(n);
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function pctStr(pnl: number, opening: number): string {
  if (opening === 0) return "—";
  return (pnl >= 0 ? "+" : "") + ((pnl / opening) * 100).toFixed(2) + "%";
}
function num(s: string): number {
  return parseFloat(s) || 0;
}

const METHOD_LABEL: Record<string, string> = {
  bank: "銀行匯款",
  crypto: "加密貨幣",
  setup: "結轉",
  other: "其他",
};

type Draft = { opening: string; closing: string };

// 出入金由 server 派生（read-only）；只有 opening/closing 可編輯
function rowCalc(d: Draft, row: ForexMonthlyRow) {
  const o = num(d.opening);
  const closingEmpty = d.closing.trim() === "";
  const c = num(d.closing);
  const w = row.withdrawal;
  const dep = row.deposit;
  const pnl = c - o - dep + w;
  return { o, c, w, dep, pnl, closingEmpty };
}

export default function ForexPrivateMonthlyPage() {
  const qc = useQueryClient();

  const groups = useQuery({ queryKey: ["forex-groups"], queryFn: () => api.listForexGroups() });

  const [groupId, setGroupId] = useState<number | "">("");
  const [month, setMonth] = useState<string>(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showXfer, setShowXfer] = useState(false);

  const resolvedGroupId =
    groupId || groups.data?.find((g) => g.code === "personal")?.id || groups.data?.[0]?.id || "";

  const view = useQuery({
    queryKey: ["forex-monthly", resolvedGroupId, month],
    queryFn: () => api.getForexMonthly(Number(resolvedGroupId), month),
    enabled: !!resolvedGroupId && !!month,
    refetchOnWindowFocus: false,
  });

  const rows = view.data?.rows ?? [];

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const seededKey = useRef("");

  // 只喺換組 / 換月時 seed（refetch 唔再洗走未存嘅 opening/closing）
  useEffect(() => {
    if (!view.data) return;
    const key = `${resolvedGroupId}-${month}`;
    if (seededKey.current === key) return;
    seededKey.current = key;
    const m: Record<number, Draft> = {};
    for (const r of view.data.rows) {
      m[r.broker_id] = {
        opening: String(r.opening),
        closing: r.has_data ? String(r.closing) : "",
      };
    }
    setDrafts(m);
  }, [view.data, resolvedGroupId, month]);

  const setField = (brokerId: number, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [brokerId]: { ...prev[brokerId], [field]: value } }));
  };
  const toggleExpand = (brokerId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(brokerId) ? next.delete(brokerId) : next.add(brokerId);
      return next;
    });
  };

  const totals = useMemo(() => {
    const t = { opening: 0, withdrawal: 0, deposit: 0, closing: 0, pnl: 0 };
    for (const r of rows) {
      const d = drafts[r.broker_id];
      if (!d) continue;
      const c = rowCalc(d, r);
      t.opening += c.o;
      t.withdrawal += c.w;
      t.deposit += c.dep;
      if (!c.closingEmpty) {
        t.closing += c.c;
        t.pnl += c.pnl;
      }
    }
    return t;
  }, [drafts, rows]);

  const saveOne = useMutation({
    mutationFn: async (brokerId: number) => {
      const d = drafts[brokerId];
      const row = rows.find((r) => r.broker_id === brokerId)!;
      const c = rowCalc(d, row);
      if (c.closingEmpty) throw new Error("請先填最新結餘（戶口清晒就填 0）");
      return api.upsertForexMonthly(Number(resolvedGroupId), month, brokerId, {
        opening_balance: c.o,
        closing_balance: c.c,
      });
    },
    onSuccess: () => {
      toast.success("已儲存");
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`儲存失敗：${String(e)}`),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      const targets = rows.filter(
        (r) => drafts[r.broker_id] && !rowCalc(drafts[r.broker_id], r).closingEmpty,
      );
      for (const r of targets) {
        const c = rowCalc(drafts[r.broker_id], r);
        await api.upsertForexMonthly(Number(resolvedGroupId), month, r.broker_id, {
          opening_balance: c.o,
          closing_balance: c.c,
        });
      }
      return targets.length;
    },
    onSuccess: (n) => {
      toast.success(`已儲存 ${n} 個戶口`);
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`儲存失敗：${String(e)}`),
  });

  const addBroker = useMutation({
    mutationFn: () =>
      api.createForexBroker(Number(resolvedGroupId), {
        name: newName.trim(),
        owner: newOwner.trim() || null,
      }),
    onSuccess: () => {
      toast.success(`已新增 ${newName.trim()}`);
      setNewName("");
      setNewOwner("");
      setShowAdd(false);
      seededKey.current = ""; // 容許重新 seed（有新 broker）
      qc.invalidateQueries({ queryKey: ["forex-monthly"] });
    },
    onError: (e) => toast.error(`新增失敗：${String(e)}`),
  });

  if (groups.isLoading) return <Loading />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/forex" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold">私人組 月結</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          value={resolvedGroupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
        >
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <div className="flex items-center">
          <button onClick={() => setMonth(shiftMonth(month, -1))} title="上一個月"
            className="px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-l hover:bg-zinc-100 dark:hover:bg-zinc-800">‹</button>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 text-sm border-y border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
          <button onClick={() => setMonth(shiftMonth(month, 1))} title="下一個月"
            className="px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-r hover:bg-zinc-100 dark:hover:bg-zinc-800">›</button>
        </div>

        <button onClick={() => saveAll.mutate()} disabled={saveAll.isPending || !resolvedGroupId}
          className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          {saveAll.isPending ? "儲存緊…" : "💾 全部儲存"}
        </button>
        <button onClick={() => setShowAdd((s) => !s)}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          ➕ 新增戶口
        </button>
        <button onClick={() => setShowXfer(true)} disabled={!resolvedGroupId}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
          💵 新增交易
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-wrap gap-2 items-center mb-4 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <input placeholder="持有人 (e.g. Celia)" value={newOwner} onChange={(e) => setNewOwner(e.target.value)}
            className="px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded" />
          <input placeholder="Broker 名 (e.g. ICM)" value={newName} onChange={(e) => setNewName(e.target.value)}
            className="px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded" />
          <button onClick={() => addBroker.mutate()} disabled={!newName.trim() || addBroker.isPending}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {addBroker.isPending ? "加緊…" : "加"}
          </button>
        </div>
      )}

      <p className="text-xs text-zinc-500 mb-4">
        出金/入金 = 系統自動加總（{month >= "2026-06" ? "錢包自動 + 人手交易" : "5月手動結轉"}）；撳右邊 ▸ 睇明細。P/L = 最新結餘 − 上月結餘 − 入金 + 出金（清晒戶口最新結餘填 0）。
      </p>

      {view.isLoading && <Loading />}
      {view.isError && <div className="text-center text-red-600 py-12">載入失敗：{String(view.error)}</div>}

      {view.data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Kpi label="戶口數" value={String(rows.length)} />
            <Kpi label="Σ 最新結餘" value={fmtUsdt(totals.closing)} />
            <Kpi label="Σ 月利潤 (P/L)" value={fmtSigned(totals.pnl)} tone={totals.pnl >= 0 ? "pos" : "neg"} />
          </div>

          <div className="overflow-x-auto bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">持有人</th>
                  <th className="px-3 py-2">Broker</th>
                  <th className="px-3 py-2 text-right">上月結餘</th>
                  <th className="px-3 py-2 text-right">出金</th>
                  <th className="px-3 py-2 text-right">入金</th>
                  <th className="px-3 py-2 text-right">最新結餘</th>
                  <th className="px-3 py-2 text-right">P/L</th>
                  <th className="px-3 py-2 text-right">P/L %</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = drafts[r.broker_id];
                  if (!d) return null;
                  const calc = rowCalc(d, r);
                  const cellInput =
                    "w-28 px-2 py-1 text-right font-mono border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded";
                  const isOpen = expanded.has(r.broker_id);
                  return (
                    <Fragment key={r.broker_id}>
                      <tr className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="px-3 py-2 text-xs text-zinc-500">{r.owner ?? "—"}</td>
                        <td className="px-3 py-2 font-medium">{r.broker_name}</td>
                        <td className="px-2 py-1 text-right">
                          <input className={cellInput} inputMode="decimal" value={d.opening}
                            onChange={(e) => setField(r.broker_id, "opening", e.target.value)} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtUsdt(r.withdrawal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-500">{fmtUsdt(r.deposit)}</td>
                        <td className="px-2 py-1 text-right">
                          <input className={cellInput} inputMode="decimal" placeholder="—" value={d.closing}
                            onChange={(e) => setField(r.broker_id, "closing", e.target.value)} />
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${calc.closingEmpty ? "text-zinc-400" : calc.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {calc.closingEmpty ? "—" : fmtSigned(calc.pnl)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${calc.closingEmpty ? "text-zinc-400" : calc.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {calc.closingEmpty ? "—" : pctStr(calc.pnl, calc.o)}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <button onClick={() => saveOne.mutate(r.broker_id)} disabled={saveOne.isPending}
                            className="px-2.5 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">儲存</button>
                          <button onClick={() => toggleExpand(r.broker_id)} title="出入金明細"
                            className="ml-1 px-1.5 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            {isOpen ? "▾" : "▸"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-zinc-50 dark:bg-zinc-900/40">
                          <td colSpan={9} className="px-6 py-2">
                            <TransferDetail groupId={Number(resolvedGroupId)} brokerId={r.broker_id} month={month} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-zinc-300 dark:border-zinc-700 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtUsdt(totals.opening)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtUsdt(totals.withdrawal)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtUsdt(totals.deposit)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtUsdt(totals.closing)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${totals.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtSigned(totals.pnl)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${totals.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{pctStr(totals.pnl, totals.opening)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {showXfer && (
        <TransferDialog
          groupId={Number(resolvedGroupId)}
          brokers={rows}
          defaultMonth={month}
          onClose={() => setShowXfer(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["forex-monthly"] });
            qc.invalidateQueries({ queryKey: ["forex-transfers"] });
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-green-600" : tone === "neg" ? "text-red-600" : "";
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-xl font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function TransferDetail({ groupId, brokerId, month }: { groupId: number; brokerId: number; month: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["forex-transfers", groupId, brokerId, month],
    queryFn: () => api.listForexTransfers(groupId, brokerId, month),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteForexTransfer(groupId, id),
    onSuccess: () => {
      toast.success("已刪除");
      qc.invalidateQueries({ queryKey: ["forex-transfers", groupId, brokerId, month] });
      qc.invalidateQueries({ queryKey: ["forex-monthly"] });
    },
    onError: (e) => toast.error(`刪除失敗：${String(e)}`),
  });

  if (q.isLoading) return <div className="text-xs text-zinc-500 py-1">…</div>;
  const list = q.data ?? [];
  if (list.length === 0) return <div className="text-xs text-zinc-500 py-1">未有出入金記錄</div>;

  return (
    <div className="space-y-1 py-1">
      {list.map((t: ForexTransfer) => (
        <div key={`${t.source}-${t.id}`} className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500 w-20">{t.date}</span>
          <span className={`w-10 ${t.flow === "withdrawal" ? "text-blue-600" : "text-purple-600"}`}>
            {t.flow === "withdrawal" ? "出金" : "入金"}
          </span>
          <span className="font-mono w-28 text-right">{fmtUsdt(t.amount)}</span>
          <span className="text-zinc-500 w-16">{METHOD_LABEL[t.method] ?? t.method}</span>
          <span className="text-zinc-400">{t.source === "wallet" ? "🔗鏈上" : "✍️人手"}</span>
          {t.notes && <span className="text-zinc-400">· {t.notes}</span>}
          {t.source === "manual" && (
            <button onClick={() => del.mutate(t.id)} disabled={del.isPending}
              className="ml-auto text-red-500 hover:underline">刪</button>
          )}
        </div>
      ))}
    </div>
  );
}

function TransferDialog({
  groupId,
  brokers,
  defaultMonth,
  onClose,
  onSaved,
}: {
  groupId: number;
  brokers: ForexMonthlyRow[];
  defaultMonth: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [brokerId, setBrokerId] = useState<number | "">("");
  const [flow, setFlow] = useState<"withdrawal" | "deposit">("withdrawal");
  const [method, setMethod] = useState("bank");
  const [date, setDate] = useState(`${defaultMonth}-01`);
  const [amount, setAmount] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.createForexTransfer(groupId, {
        broker_account_id: Number(brokerId),
        flow,
        method,
        amount_usdt: num(amount),
        transfer_date: date,
      }),
    onSuccess: () => {
      toast.success("已加交易");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(`加交易失敗：${String(e)}`),
  });

  const field = "px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 w-[360px] space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg">新增出入金交易</h2>
        <Field label="持有人 / Broker">
          <select className={field} value={brokerId} onChange={(e) => setBrokerId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— 揀戶口 —</option>
            {brokers.map((b) => (
              <option key={b.broker_id} value={b.broker_id}>
                {(b.owner ?? "?") + " — " + b.broker_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <Field label="出 / 入">
            <select className={field} value={flow} onChange={(e) => setFlow(e.target.value as "withdrawal" | "deposit")}>
              <option value="withdrawal">出金</option>
              <option value="deposit">入金</option>
            </select>
          </Field>
          <Field label="方式">
            <select className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="bank">銀行匯款</option>
              <option value="crypto">加密貨幣</option>
              <option value="other">其他</option>
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Field label="日期">
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="金額 (USDT)">
            <input inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700">取消</button>
          <button onClick={() => save.mutate()} disabled={!brokerId || num(amount) <= 0 || save.isPending}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
            {save.isPending ? "加緊…" : "加"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
