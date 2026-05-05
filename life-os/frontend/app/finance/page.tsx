"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type MonthlySummary,
  type DailyTrend,
  type ExpenseStats,
  type Budget,
  type BankAccount,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { BankLogo } from "@/components/BankLogo";
import { toast } from "@/components/Toast";
import { Money, useMoneyFmt } from "@/components/Money";

/* ── 分類 icon 映射 ────────────────────── */
const CAT_ICONS: Record<string, string> = {
  "餐飲": "🍽️", "交通": "🚗", "購物": "🛍️", "娛樂": "🎮",
  "醫療": "🏥", "教育": "🎓", "住屋": "🏠", "日用品": "🧴",
  "人情": "🎁", "投資": "📈", "生意": "💼", "其他": "📎",
  "薪金": "💰", "獎金": "🎖️", "投資收益": "📊", "兼職": "👷",
  "退款": "↩️", "利息": "🏦", "收入其他": "💵",
};

const CHART_COLORS = [
  "#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#6366F1",
  "#14B8A6", "#E11D48",
];

function monthLabel(y: number, m: number) {
  return `${m}月`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtMoney(n: number) {
  return n.toLocaleString("zh-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ── 頁面 ────────────────────────────────── */
export default function FinancePage() {
  const queryClient = useQueryClient();
  const [summaryMonths] = useState(12);
  const moneyFmt = useMoneyFmt();

  // 本月日期範圍
  const monthFrom = monthStartStr();
  const monthTo = todayStr();

  // ── Queries ──
  const { data: bankAccounts = [], isLoading: loadingAccounts } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts", true],
    queryFn: () => api.listBankAccounts(true),
  });

  const { data: monthly = [], isLoading: loadingMonthly } = useQuery<MonthlySummary[]>({
    queryKey: ["monthly-summary", summaryMonths],
    queryFn: () => api.monthlySummary(summaryMonths),
  });

  const { data: dailyData = [], isLoading: loadingDaily } = useQuery<DailyTrend[]>({
    queryKey: ["daily-trend", monthFrom, monthTo],
    queryFn: () => api.dailyTrend({ date_from: monthFrom, date_to: monthTo }),
  });

  const { data: expenseStats } = useQuery<ExpenseStats>({
    queryKey: ["expense-stats-month", monthFrom, monthTo],
    queryFn: () => api.expenseStats({ txn_type: "expense", date_from: monthFrom, date_to: monthTo }),
  });

  const { data: incomeStats } = useQuery<ExpenseStats>({
    queryKey: ["income-stats-month", monthFrom, monthTo],
    queryFn: () => api.expenseStats({ txn_type: "income", date_from: monthFrom, date_to: monthTo }),
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ["budgets"],
    queryFn: () => api.listBudgets(),
  });

  // ── 淨資產聚合（P1-5） ──
  // 規則：
  // - 子帳戶 balance 已反映喺 parent，跳過
  // - brokerage 分開：holdings_by_currency = 股票（stock）、cash_balances = 證券現金（cash）
  // - credit 負 balance 當負債（e.g. balance = -5000 表示欠 5000）
  // - 其他：balance 直接入 currency 做存款
  type Contribution = {
    currency: string;
    amount: number;
    kind: "deposit" | "stock" | "cash" | "debt";
  };
  const contributions = useMemo<Contribution[]>(() => {
    const out: Contribution[] = [];
    for (const a of bankAccounts) {
      if (!a.is_active) continue;
      if (a.parent_account_id != null) continue;
      const cur = (a.currency || "HKD").toUpperCase();
      if (a.account_type === "brokerage") {
        for (const h of a.holdings_by_currency ?? []) {
          out.push({
            currency: (h.currency || "HKD").toUpperCase(),
            amount: h.market_value,
            kind: "stock",
          });
        }
        for (const c of a.cash_balances ?? []) {
          out.push({
            currency: (c.currency || "HKD").toUpperCase(),
            amount: c.amount,
            kind: "cash",
          });
        }
        continue;
      }
      const amt = Number(a.balance) || 0;
      if (a.account_type === "credit" && amt < 0) {
        out.push({ currency: cur, amount: amt, kind: "debt" });
      } else {
        out.push({ currency: cur, amount: amt, kind: "deposit" });
      }
    }
    return out;
  }, [bankAccounts]);

  const totalsByCurrency = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const e of contributions) {
      out[e.currency] = (out[e.currency] ?? 0) + e.amount;
    }
    return out;
  }, [contributions]);

  const netWorthBreakdown = useMemo(() => {
    let deposits = 0;
    let stocks = 0;
    let cash = 0;
    let debts = 0;
    for (const e of contributions) {
      if (e.kind === "deposit") deposits += e.amount;
      else if (e.kind === "stock") stocks += e.amount;
      else if (e.kind === "cash") cash += e.amount;
      else debts += e.amount; // 已係負數
    }
    return { deposits, stocks, cash, debts };
  }, [contributions]);

  const updateBalanceMutation = useMutation({
    mutationFn: ({ id, balance }: { id: number; balance: number }) =>
      api.updateBankAccount(id, { balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("已更新結餘");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ── 計算 ──
  const currentMonth = monthly[monthly.length - 1];
  const prevMonth = monthly.length > 1 ? monthly[monthly.length - 2] : null;
  const expenseDelta = currentMonth && prevMonth
    ? ((currentMonth.expense - prevMonth.expense) / (prevMonth.expense || 1)) * 100
    : 0;

  // 分類排序
  const catEntries = useMemo(() => {
    if (!expenseStats?.by_category) return [];
    return Object.entries(expenseStats.by_category).sort(([, a], [, b]) => b - a);
  }, [expenseStats]);

  const catTotal = expenseStats?.total || 0;

  // 日趨勢最大值
  const dailyMax = useMemo(
    () => Math.max(...dailyData.map((d) => d.total), 1),
    [dailyData]
  );

  // 月度圖最大值
  const monthlyMax = useMemo(
    () => Math.max(...monthly.map((m) => Math.max(m.income, m.expense)), 1),
    [monthly]
  );

  const now = new Date();
  const curMonthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  return (
    <main className="min-h-full max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">💰 財務總覽</h1>

      {/* ── 戶口及淨資產 ── */}
      <BankAccountsSection
        accounts={bankAccounts}
        loading={loadingAccounts}
        totalsByCurrency={totalsByCurrency}
        breakdown={netWorthBreakdown}
        onSaveBalance={(id, balance) => updateBalanceMutation.mutate({ id, balance })}
        savingId={updateBalanceMutation.isPending ? updateBalanceMutation.variables?.id ?? null : null}
      />

      {/* ── 本月摘要卡 ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="本月支出"
          value={moneyFmt(currentMonth?.expense ?? 0, { prefix: "$" })}
          sub={expenseDelta ? `${expenseDelta > 0 ? "↑" : "↓"} ${Math.abs(expenseDelta).toFixed(0)}%` : undefined}
          subColor={expenseDelta > 0 ? "text-red-500" : "text-green-500"}
          accent="bg-red-50 dark:bg-red-950/30"
        />
        <SummaryCard
          label="本月收入"
          value={moneyFmt(currentMonth?.income ?? 0, { prefix: "$" })}
          accent="bg-green-50 dark:bg-green-950/30"
        />
        <SummaryCard
          label="本月結餘"
          value={moneyFmt(currentMonth?.net ?? 0, { prefix: "$" })}
          accent={(currentMonth?.net ?? 0) >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-red-50 dark:bg-red-950/30"}
        />
        <SummaryCard
          label="消費筆數"
          value={String(expenseStats?.count ?? 0)}
          accent="bg-amber-50 dark:bg-amber-950/30"
        />
      </section>

      {/* ── 月度收支對比圖 ── */}
      <section className="p-4 border border-border rounded-lg">
        <h2 className="font-medium mb-1">每月收支對比</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm inline-block" /> 收入</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block" /> 支出</span>
        </div>
        {loadingMonthly ? (
          <Loading />
        ) : monthly.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暫無數據</p>
        ) : (
          <div className="flex items-end gap-1.5 h-48 overflow-x-auto">
            {monthly.map((m) => {
              const incH = (m.income / monthlyMax) * 100;
              const expH = (m.expense / monthlyMax) * 100;
              return (
                <div key={`${m.year}-${m.month}`} className="flex-1 min-w-[36px] flex flex-col items-center gap-0.5">
                  {/* 數值 */}
                  <div className="text-[9px] text-muted-foreground text-center leading-tight">
                    {m.income > 0 && <div className="text-green-600">{moneyFmt(m.income)}</div>}
                    <div className="text-red-500">{moneyFmt(m.expense)}</div>
                  </div>
                  {/* 雙柱 */}
                  <div className="w-full flex gap-0.5 items-end" style={{ height: "70%" }}>
                    <div
                      className="flex-1 bg-green-500 rounded-t min-h-[1px]"
                      style={{ height: `${Math.max(incH, 1)}%` }}
                      title={`收入 ${moneyFmt(m.income, { prefix: "$" })}`}
                    />
                    <div
                      className="flex-1 bg-red-400 rounded-t min-h-[1px]"
                      style={{ height: `${Math.max(expH, 1)}%` }}
                      title={`支出 ${moneyFmt(m.expense, { prefix: "$" })}`}
                    />
                  </div>
                  {/* 月份 label */}
                  <span className="text-[10px] text-muted-foreground">{monthLabel(m.year, m.month)}</span>
                  {/* 淨值 */}
                  <span className={`text-[9px] font-medium ${m.net >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {moneyFmt(m.net, { sign: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 本月分類分佈（環形圖 + 列表） ── */}
      <section className="p-4 border border-border rounded-lg">
        <h2 className="font-medium mb-3">{curMonthLabel} 支出分類</h2>
        {catEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">暫無數據</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6">
            {/* 環形圖 */}
            <div className="w-40 h-40 mx-auto sm:mx-0 shrink-0">
              <DonutChart entries={catEntries} total={catTotal} />
            </div>
            {/* 分類列表 */}
            <div className="flex-1 space-y-2">
              {catEntries.map(([cat, amt], i) => {
                const pct = catTotal ? (amt / catTotal) * 100 : 0;
                return (
                  <div key={cat} className="flex items-center text-sm gap-2">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="w-5 text-center">{CAT_ICONS[cat] || "📎"}</span>
                    <span className="flex-1 truncate">{cat}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    <span className="text-xs font-medium w-20 text-right">
                      <Money value={amt} prefix="$" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── 本月每日消費趨勢 ── */}
      <section className="p-4 border border-border rounded-lg">
        <h2 className="font-medium mb-3">{curMonthLabel} 每日消費</h2>
        {loadingDaily ? (
          <Loading />
        ) : dailyData.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">暫無數據</p>
        ) : (
          <div className="flex items-end gap-px h-32 overflow-x-auto">
            {dailyData.map((d) => {
              const h = (d.total / dailyMax) * 100;
              const day = d.date.split("-")[2];
              return (
                <div key={d.date} className="flex-1 min-w-[8px] flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full bg-blue-500 rounded-t min-h-[2px] hover:bg-blue-600 transition-colors cursor-default"
                    style={{ height: `${Math.max(h, 2)}%` }}
                    title={`${d.date}: ${moneyFmt(d.total, { prefix: "$" })}`}
                  />
                  {dailyData.length <= 31 && (
                    <span className="text-[8px] text-muted-foreground mt-0.5">
                      {Number(day) % 5 === 1 || Number(day) === 1 ? day : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {dailyData.length > 0 && (
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>平均 {moneyFmt(dailyData.reduce((s, d) => s + d.total, 0) / dailyData.length, { prefix: "$" })}/日</span>
            <span>最高 {moneyFmt(dailyMax, { prefix: "$" })}</span>
          </div>
        )}
      </section>

      {/* ── 預算使用情況 ── */}
      {budgets.length > 0 && (
        <section className="p-4 border border-border rounded-lg">
          <h2 className="font-medium mb-3">預算使用情況</h2>
          <div className="space-y-3">
            {budgets.map((b) => {
              const pct = Math.min(b.percentage, 100);
              const isOver = b.percentage > 100;
              const isWarn = b.percentage >= 80 && b.percentage <= 100;
              const barColor = isOver
                ? "bg-red-500"
                : isWarn
                  ? "bg-amber-500"
                  : "bg-green-500";
              return (
                <div key={b.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <span>{CAT_ICONS[b.category] || "📎"}</span>
                      {b.category}
                    </span>
                    <span className={`text-xs font-medium ${isOver ? "text-red-500" : isWarn ? "text-amber-600" : "text-muted-foreground"}`}>
                      {moneyFmt(b.spent, { prefix: "$" })} / {moneyFmt(b.amount, { prefix: "$" })} ({b.percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 收入分類（如果有） ── */}
      {incomeStats && incomeStats.count > 0 && (
        <section className="p-4 border border-border rounded-lg">
          <h2 className="font-medium mb-3">{curMonthLabel} 收入分類</h2>
          <div className="space-y-2">
            {Object.entries(incomeStats.by_category)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => (
                <div key={cat} className="flex items-center text-sm gap-2">
                  <span className="w-5 text-center">{CAT_ICONS[cat] || "💵"}</span>
                  <span className="flex-1">{cat}</span>
                  <span className="font-medium text-green-600">
                    <Money value={amt} prefix="$" />
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </main>
  );
}

/* ── BankAccountsSection ──────────────── */
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  savings: "儲蓄",
  current: "往來",
  credit: "信用卡",
  ewallet: "電子錢包",
  cash: "現金",
  brokerage: "證券",
  other: "其他",
};

/* 按銀行分組。每組計埋每幣種嘅總和，方便 collapsed 狀態顯示。 */
type BankGroup = {
  bank: string;
  accounts: BankAccount[];
  totalsByCurrency: Record<string, number>;
};

function sortByParent(list: BankAccount[]): BankAccount[] {
  const parents = list.filter((a) => a.parent_account_id == null);
  const children = list.filter((a) => a.parent_account_id != null);
  const out: BankAccount[] = [];
  for (const p of parents) {
    out.push(p);
    for (const c of children.filter((c) => c.parent_account_id === p.id)) {
      out.push(c);
    }
  }
  for (const c of children) {
    if (!parents.some((p) => p.id === c.parent_account_id)) out.push(c);
  }
  return out;
}

function groupByBank(accounts: BankAccount[]): BankGroup[] {
  const map = new Map<string, BankAccount[]>();
  for (const a of accounts) {
    const key = a.bank || "（未填）";
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  const groups: BankGroup[] = [];
  for (const [bank, list] of map.entries()) {
    const totals: Record<string, number> = {};
    for (const a of list) {
      // 子帳戶嘅結餘已經反映喺 parent，唔再加一次
      if (a.parent_account_id != null) continue;
      const cur = (a.currency || "HKD").toUpperCase();
      totals[cur] = (totals[cur] ?? 0) + (a.balance ?? 0);
    }
    groups.push({ bank, accounts: list, totalsByCurrency: totals });
  }
  // 按 HKD 總和 desc 排（冇 HKD 就 fallback 第一個 currency）
  groups.sort((a, b) => {
    const av = a.totalsByCurrency["HKD"] ?? Object.values(a.totalsByCurrency)[0] ?? 0;
    const bv = b.totalsByCurrency["HKD"] ?? Object.values(b.totalsByCurrency)[0] ?? 0;
    return bv - av;
  });
  return groups;
}

function BankAccountsSection({
  accounts,
  loading,
  totalsByCurrency,
  breakdown,
  onSaveBalance,
  savingId,
}: {
  accounts: BankAccount[];
  loading: boolean;
  totalsByCurrency: Record<string, number>;
  breakdown: { deposits: number; stocks: number; cash: number; debts: number };
  onSaveBalance: (id: number, balance: number) => void;
  savingId: number | null;
}) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const hasAccounts = activeAccounts.length > 0;
  const bankGroups = useMemo(() => groupByBank(activeAccounts), [activeAccounts]);
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({});

  function toggleBank(bank: string) {
    setExpandedBanks((prev) => ({ ...prev, [bank]: !prev[bank] }));
  }

  // 主幣種 — 以 HKD 為先，否則取第一個
  const primaryCurrency = "HKD" in totalsByCurrency
    ? "HKD"
    : Object.keys(totalsByCurrency)[0] ?? "HKD";
  const otherCurrencies = Object.entries(totalsByCurrency).filter(
    ([c]) => c !== primaryCurrency
  );

  return (
    <section className="space-y-3">
      {/* 淨資產 hero card */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-lg">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm opacity-80">淨資產</div>
          <Link
            href="/bank-accounts"
            className="text-xs opacity-80 hover:opacity-100 underline"
          >
            管理戶口 →
          </Link>
        </div>
        {loading ? (
          <div className="text-sm opacity-70">載入中…</div>
        ) : !hasAccounts ? (
          <div className="text-sm opacity-80">
            仲未加任何戶口 —{" "}
            <Link href="/bank-accounts" className="underline font-medium">
              去新增第一個
            </Link>
          </div>
        ) : (
          <>
            {/* 主幣種大字 */}
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs opacity-70">{primaryCurrency}</span>
              <span className="text-3xl font-bold tabular-nums">
                <Money
                  value={totalsByCurrency[primaryCurrency] ?? 0}
                  decimals={2}
                />
              </span>
            </div>
            {/* 其他幣種 */}
            {otherCurrencies.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-80 mb-3">
                {otherCurrencies.map(([cur, total]) => (
                  <span key={cur} className="tabular-nums">
                    {cur} <Money value={total} decimals={2} />
                  </span>
                ))}
              </div>
            )}
            {/* 存款 / 股票 / 證券現金 / 負債 分拆 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/20 text-xs">
              <div>
                <div className="opacity-70">💵 存款</div>
                <div className="font-semibold tabular-nums">
                  <Money value={breakdown.deposits} decimals={0} />
                </div>
              </div>
              <div>
                <div className="opacity-70">📈 股票</div>
                <div className="font-semibold tabular-nums">
                  <Money value={breakdown.stocks} decimals={0} />
                </div>
              </div>
              <div>
                <div className="opacity-70">💰 證券現金</div>
                <div className="font-semibold tabular-nums">
                  <Money value={breakdown.cash} decimals={0} />
                </div>
              </div>
              <div>
                <div className="opacity-70">💳 負債</div>
                <div className="font-semibold tabular-nums">
                  <Money value={breakdown.debts} decimals={0} />
                </div>
              </div>
            </div>
            <div className="text-[10px] opacity-60 mt-2">
              共 {activeAccounts.length} 個活躍戶口 · 同幣種加總（未換算）
            </div>
          </>
        )}
      </div>

      {/* 按銀行分組戶口列表 */}
      {hasAccounts && (
        <div className="space-y-2">
          {bankGroups.map((group) => {
            const expanded = expandedBanks[group.bank] ?? false;
            const firstAcct = group.accounts[0];
            const parentAccounts = group.accounts.filter((a) => a.parent_account_id == null);
            return (
              <div
                key={group.bank}
                className="rounded-lg border border-border overflow-hidden bg-background"
              >
                {/* Bank header — click to expand */}
                <button
                  type="button"
                  onClick={() => toggleBank(group.bank)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <BankLogo bank={group.bank} color={firstAcct?.color ?? undefined} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{group.bank}</div>
                    <div className="text-xs text-muted-foreground">
                      {parentAccounts.length} 個戶口
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="space-y-0.5">
                      {Object.entries(group.totalsByCurrency).map(([cur, total]) => (
                        <div key={cur} className="text-sm tabular-nums">
                          <span className="text-xs text-muted-foreground mr-1">{cur}</span>
                          <span className="font-semibold">
                            <Money value={total} decimals={2} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground ml-1 shrink-0">
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>
                {/* Expanded — individual accounts */}
                {expanded && (
                  <div className="border-t border-border divide-y divide-border">
                    {sortByParent(group.accounts).map((acc) => (
                      <AccountRow
                        key={acc.id}
                        account={acc}
                        saving={savingId === acc.id}
                        onSave={(val) => onSaveBalance(acc.id, val)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AccountRow({
  account,
  saving,
  onSave,
}: {
  account: BankAccount;
  saving: boolean;
  onSave: (balance: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(account.balance));

  function startEdit() {
    setVal(String(account.balance));
    setEditing(true);
  }

  function commit() {
    const num = parseFloat(val);
    if (isNaN(num)) {
      setEditing(false);
      return;
    }
    if (num !== account.balance) {
      onSave(num);
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-background">
      <BankLogo bank={account.bank} color={account.color ?? undefined} size={36} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{account.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {account.bank} · {ACCOUNT_TYPE_LABEL[account.account_type] ?? account.account_type}
        </div>
      </div>
      <div className="text-right">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-28 px-2 py-1 text-right border border-border rounded text-sm tabular-nums bg-background"
              disabled={saving}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="text-right hover:bg-muted/50 rounded px-2 py-1 -mr-2 group"
          >
            <div className="text-base font-semibold tabular-nums">
              <Money value={account.balance} decimals={2} />
            </div>
            <div className="text-[10px] text-muted-foreground group-hover:text-foreground">
              {account.currency} · 點擊修改
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── SummaryCard ──────────────────────── */
function SummaryCard({
  label, value, sub, subColor, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  accent?: string;
}) {
  return (
    <div className={`p-3 rounded-lg border border-border ${accent || ""}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${subColor || ""}`}>{sub}</div>}
    </div>
  );
}

/* ── DonutChart（SVG 環形圖） ────────── */
function DonutChart({ entries, total }: { entries: [string, number][]; total: number }) {
  const moneyFmt = useMoneyFmt();
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 60;
  const strokeWidth = 28;

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.1} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="currentColor" fontSize="12" opacity={0.4}>
          暫無數據
        </text>
      </svg>
    );
  }

  const segments: React.ReactNode[] = [];
  let startAngle = -90; // 從12點鐘方向開始
  const circumference = 2 * Math.PI * radius;

  entries.forEach(([cat, amt], i) => {
    const pct = amt / total;
    const angle = pct * 360;
    const dashLength = pct * circumference;
    const dashOffset = -((startAngle + 90) / 360) * circumference;

    segments.push(
      <circle
        key={cat}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={CHART_COLORS[i % CHART_COLORS.length]}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
        strokeDashoffset={-((startAngle + 90) / 360) * circumference}
        strokeLinecap="butt"
        transform={`rotate(0 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    );
    startAngle += angle;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.05} />
      {segments}
      {/* Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="currentColor" fontSize="10" opacity={0.5}>
        總支出
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="bold">
        {moneyFmt(total, { prefix: "$" })}
      </text>
    </svg>
  );
}
