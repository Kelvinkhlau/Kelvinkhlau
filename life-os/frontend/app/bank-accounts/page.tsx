"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type BankAccount,
  type BankAccountCreate,
  type BankPreset,
  type StockHolding,
} from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BankLogo } from "@/components/BankLogo";

/* ── 賬戶類型 ────────────────────────────── */
const ACCOUNT_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "savings", label: "儲蓄戶口", icon: "🏦" },
  { value: "current", label: "往來戶口", icon: "🏛️" },
  { value: "credit", label: "信用卡", icon: "💳" },
  { value: "ewallet", label: "電子錢包", icon: "📱" },
  { value: "brokerage", label: "證券戶口", icon: "📈" },
  { value: "cash", label: "現金", icon: "💵" },
  { value: "other", label: "其他", icon: "💰" },
];

const CURRENCIES = ["HKD", "CNY", "USD", "CAD", "EUR", "GBP", "JPY", "AUD", "CHF", "TWD"];

function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function accountTypeIcon(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.icon ?? "💰";
}

/* 將子帳戶排喺 parent 後面，方便 UI 展示。 */
function sortByParent(accounts: BankAccount[]): BankAccount[] {
  const parents = accounts.filter((a) => a.parent_account_id == null);
  const children = accounts.filter((a) => a.parent_account_id != null);
  const out: BankAccount[] = [];
  const orphans: BankAccount[] = [];
  for (const p of parents) {
    out.push(p);
    for (const c of children.filter((c) => c.parent_account_id === p.id)) {
      out.push(c);
    }
  }
  // 子帳戶嘅 parent 唔喺 list 入面（filter 咗）— 當 orphan
  for (const c of children) {
    if (!parents.some((p) => p.id === c.parent_account_id)) orphans.push(c);
  }
  return [...out, ...orphans];
}

/* ── 預設分類分組 ────────────────────────── */
type PresetGroup = { title: string; types: string[]; items: BankPreset[] };

function groupPresets(presets: BankPreset[]): PresetGroup[] {
  const groups: PresetGroup[] = [
    { title: "傳統銀行", types: ["savings", "current", "credit"], items: [] },
    { title: "虛擬銀行", types: ["savings"], items: [] },
    { title: "電子錢包", types: ["ewallet"], items: [] },
    { title: "證券戶口", types: ["brokerage"], items: [] },
    { title: "現金", types: ["cash"], items: [] },
  ];
  const virtualBanks = [
    "ZA Bank", "Mox", "WeLab", "livi", "天星", "富融", "PAO", "螞蟻",
  ];
  for (const p of presets) {
    if (p.account_type === "cash") {
      groups[4].items.push(p);
    } else if (p.account_type === "brokerage") {
      groups[3].items.push(p);
    } else if (p.account_type === "ewallet") {
      groups[2].items.push(p);
    } else if (virtualBanks.includes(p.bank)) {
      groups[1].items.push(p);
    } else {
      groups[0].items.push(p);
    }
  }
  return groups.filter((g) => g.items.length > 0);
}

/* ── 頁面 ────────────────────────────────── */
export default function BankAccountsPage() {
  const queryClient = useQueryClient();

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAll, setShowAll] = useState(false); // include inactive

  // Form state
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [accountType, setAccountType] = useState("savings");
  const [currency, setCurrency] = useState("HKD");
  const [balance, setBalance] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#333333");
  const [last4, setLast4] = useState("");
  const [note, setNote] = useState("");
  const [parentAccountId, setParentAccountId] = useState<number | "">("");
  // Credit card extras (P2-13)
  const [statementDay, setStatementDay] = useState<number | "">("");
  const [dueDay, setDueDay] = useState<number | "">("");
  const [creditLimit, setCreditLimit] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editBalanceVal, setEditBalanceVal] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  /* ── Queries ── */
  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts", showAll],
    queryFn: () => api.listBankAccounts(!showAll),
  });

  const { data: presets = [] } = useQuery<BankPreset[]>({
    queryKey: ["bank-presets"],
    queryFn: () => api.bankPresets(),
    enabled: showPresets,
  });

  // Group by type
  const grouped = accounts.reduce<Record<string, BankAccount[]>>((acc, a) => {
    const key = a.account_type;
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  // Total by currency
  const totalsByCurrency = accounts
    .filter((a) => a.is_active)
    .reduce<Record<string, number>>((acc, a) => {
      acc[a.currency] = (acc[a.currency] ?? 0) + a.balance;
      return acc;
    }, {});

  /* ── Mutations ── */
  const createMutation = useMutation({
    mutationFn: (payload: BankAccountCreate) => api.createBankAccount(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      resetForm();
      toast.success("已新增賬戶");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Partial<BankAccountCreate>;
    }) => api.updateBankAccount(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      setEditId(null);
      toast.success("已更新");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBankAccount(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<BankAccount[]>(
        ["bank-accounts", showAll],
        (old) => old?.filter((a) => a.id !== id)
      );
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function resetForm() {
    setShowForm(false);
    setShowPresets(false);
    setName("");
    setBank("");
    setAccountType("savings");
    setCurrency("HKD");
    setBalance("");
    setIcon("");
    setColor("#333333");
    setLast4("");
    setNote("");
    setParentAccountId("");
    setStatementDay("");
    setDueDay("");
    setCreditLimit("");
  }

  function applyPreset(p: BankPreset) {
    setName(p.name);
    setBank(p.bank);
    setAccountType(p.account_type);
    setIcon(p.icon);
    setColor(p.color);
    setShowPresets(false);
    setShowForm(true);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !bank.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      bank: bank.trim(),
      account_type: accountType,
      currency: currency.trim() || "HKD",
      balance: balance ? parseFloat(balance) : 0,
      icon: icon || null,
      color: color || null,
      last4: last4.trim() || null,
      note: note.trim() || null,
      parent_account_id:
        accountType === "brokerage" && parentAccountId !== ""
          ? Number(parentAccountId)
          : null,
      statement_day:
        accountType === "credit" && statementDay !== ""
          ? Number(statementDay)
          : null,
      due_day:
        accountType === "credit" && dueDay !== "" ? Number(dueDay) : null,
      credit_limit:
        accountType === "credit" && creditLimit
          ? parseFloat(creditLimit)
          : null,
    });
  }

  // 證券戶口 list — 用嚟揀 parent
  const brokerageAccounts = accounts.filter(
    (a) => a.account_type === "brokerage" && a.parent_account_id == null
  );

  function handleBalanceSave(id: number) {
    const val = parseFloat(editBalanceVal);
    if (isNaN(val)) return;
    updateMutation.mutate({ id, payload: { balance: val } });
  }

  const presetGroups = groupPresets(presets);

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🏦 付款賬戶</h1>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showAll}
            onChange={() => setShowAll(!showAll)}
            className="rounded"
          />
          顯示已停用
        </label>
      </div>

      {/* Total balance */}
      {accounts.length > 0 && Object.keys(totalsByCurrency).length > 0 && (
        <section className="mb-5 p-4 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg">
          <div className="text-sm opacity-80 mb-2">總結餘</div>
          <div className="space-y-1">
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <div key={cur} className="flex items-baseline justify-between">
                <span className="text-sm opacity-70">{cur}</span>
                <span className="text-2xl font-bold tabular-nums">
                  {total.toLocaleString("zh-HK", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs opacity-60 mt-2">
            共 {accounts.filter((a) => a.is_active).length} 個活躍賬戶
          </div>
        </section>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        {!showForm && !showPresets && (
          <>
            <button
              type="button"
              onClick={() => setShowPresets(true)}
              className="flex-1 p-3 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition font-medium"
            >
              ⚡ 快速新增
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex-1 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
            >
              ✏️ 自訂新增
            </button>
          </>
        )}
      </div>

      {/* Preset picker */}
      {showPresets && (
        <section className="mb-4 p-4 border border-border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">選擇預設賬戶</h2>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
          </div>
          {presetGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-2 p-2.5 border border-border rounded-lg hover:bg-muted transition text-left"
                  >
                    <BankLogo bank={p.bank} color={p.color} size={32} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {accountTypeLabel(p.account_type)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <div className="flex items-center gap-3 mb-1">
            {bank && <BankLogo bank={bank} color={color} size={36} />}
            <h2 className="font-medium">新增賬戶</h2>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">賬戶名稱</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：HSBC 儲蓄"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                autoFocus
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                銀行 / 機構
              </label>
              <input
                type="text"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="例：HSBC"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">賬戶類型</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">貨幣</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {accountType === "brokerage" && brokerageAccounts.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">
                屬於主帳戶（選填，建子帳戶時用）
              </label>
              <select
                value={parentAccountId}
                onChange={(e) =>
                  setParentAccountId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                <option value="">— 唔係子帳戶 —</option>
                {brokerageAccounts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon || "📈"} {p.name}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-muted-foreground mt-1">
                例：IB 入面有多個 sub account，就揀 IB 主帳戶做 parent
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">現時結餘</label>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">品牌色</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-[42px] mt-1 border border-border rounded bg-background cursor-pointer"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">
                尾 4 碼（選填，卡類建議填）
              </label>
              <input
                type="text"
                value={last4}
                onChange={(e) =>
                  setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background font-mono tracking-widest"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">備註（選填）</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="（選填）"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
          </div>

          {/* Credit card cycle fields (P2-13) */}
          {accountType === "credit" && (
            <div className="p-3 border border-blue-300 dark:border-blue-800 rounded bg-blue-50 dark:bg-blue-900/20 space-y-2">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                信用卡週期（用嚟計截結單 / 到期提醒）
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">
                    結單日
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={statementDay}
                    onChange={(e) =>
                      setStatementDay(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    placeholder="1-31"
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">到期日</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) =>
                      setDueDay(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    placeholder="1-31"
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">
                    信用額度
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="（選填）"
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? "儲存中…" : "儲存"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Account list grouped by type */}
      {isLoading ? (
        <Loading />
      ) : accounts.length === 0 ? (
        <EmptyState message="暫時冇付款賬戶，快速新增常用銀行及電子錢包" />
      ) : (
        <div className="space-y-5">
          {ACCOUNT_TYPES.filter((t) => grouped[t.value]?.length).map((type) => (
            <section key={type.value}>
              <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <span>{type.icon}</span>
                {type.label}
                <span className="text-xs">({grouped[type.value].length})</span>
              </h2>
              <div className="space-y-2">
                {sortByParent(grouped[type.value]).map((acct) => (
                  <AccountCard
                    key={acct.id}
                    acct={acct}
                    editId={editId}
                    editBalanceVal={editBalanceVal}
                    onEditBalance={(id, val) => {
                      setEditId(id);
                      setEditBalanceVal(val);
                    }}
                    onBalanceSave={handleBalanceSave}
                    onCancelEdit={() => setEditId(null)}
                    onToggleActive={(id, active) =>
                      updateMutation.mutate({
                        id,
                        payload: { is_active: active },
                      })
                    }
                    onDelete={(id) => setDeleteTarget(id)}
                    isPending={updateMutation.isPending}
                    setEditBalanceVal={setEditBalanceVal}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除賬戶"
        message="確定要刪除呢個賬戶？已連結嘅消費記錄唔會受影響。"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

/* ── AccountCard ───────────────────────── */
function AccountCard({
  acct,
  editId,
  editBalanceVal,
  onEditBalance,
  onBalanceSave,
  onCancelEdit,
  onToggleActive,
  onDelete,
  isPending,
  setEditBalanceVal,
}: {
  acct: BankAccount;
  editId: number | null;
  editBalanceVal: string;
  onEditBalance: (id: number, val: string) => void;
  onBalanceSave: (id: number) => void;
  onCancelEdit: () => void;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number) => void;
  isPending: boolean;
  setEditBalanceVal: (v: string) => void;
}) {
  const isEditing = editId === acct.id;
  const acctColor = acct.color || "#6B7280";
  const isBrokerage = acct.account_type === "brokerage";
  const isChild = acct.parent_account_id != null;

  return (
    <div
      className={`p-3 border rounded-lg transition ${
        acct.is_active
          ? "border-border"
          : "border-border opacity-50 bg-muted/30"
      } ${isChild ? "ml-6 border-l-4 border-l-blue-400/50" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <BankLogo bank={acct.bank} color={acctColor} size={36} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{acct.name}</span>
              {!acct.is_active && (
                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 rounded">
                  已停用
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: acctColor + "15",
                  color: acctColor,
                }}
              >
                {acct.bank}
              </span>
              <span className="text-xs px-2 py-0.5 bg-muted rounded">
                {accountTypeLabel(acct.account_type)}
              </span>
              <span className="text-xs text-muted-foreground">
                {acct.currency}
              </span>
              {acct.last4 && (
                <span className="text-xs font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded tracking-widest">
                  ··{acct.last4}
                </span>
              )}
            </div>
            {acct.note && (
              <div className="text-xs text-muted-foreground mt-1">
                {acct.note}
              </div>
            )}
            {acct.account_type === "credit" &&
              (acct.statement_day || acct.due_day || acct.credit_limit) && (
                <div className="text-[11px] text-muted-foreground mt-1 flex gap-2 flex-wrap">
                  {acct.statement_day && (
                    <span>結單 {acct.statement_day} 日</span>
                  )}
                  {acct.due_day && <span>到期 {acct.due_day} 日</span>}
                  {acct.credit_limit != null && (
                    <span>
                      額度 $
                      {acct.credit_limit.toLocaleString("zh-HK", {
                        minimumFractionDigits: 0,
                      })}
                    </span>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Right: balance + actions */}
        <div className="text-right shrink-0">
          {isBrokerage ? (
            <BrokerageMultiCurrencyTotals acct={acct} />
          ) : isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                value={editBalanceVal}
                onChange={(e) => setEditBalanceVal(e.target.value)}
                className="w-28 px-2 py-1 text-sm border border-border rounded bg-background text-right"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onBalanceSave(acct.id);
                  if (e.key === "Escape") onCancelEdit();
                }}
              />
              <button
                type="button"
                onClick={() => onBalanceSave(acct.id)}
                disabled={isPending}
                className="text-xs px-2 py-1 bg-foreground text-background rounded disabled:opacity-50"
              >
                確認
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onEditBalance(acct.id, String(acct.balance))}
              className="font-bold tabular-nums hover:underline cursor-pointer"
              title="點擊更新結餘"
            >
              {acct.balance.toLocaleString("zh-HK", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </button>
          )}
          <div className="flex items-center gap-2 mt-1 justify-end">
            <button
              type="button"
              onClick={() => onToggleActive(acct.id, !acct.is_active)}
              className="text-xs text-muted-foreground hover:text-foreground"
              title={acct.is_active ? "停用" : "啟用"}
            >
              {acct.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(acct.id)}
              className="text-xs text-red-500 hover:underline"
            >
              刪除
            </button>
          </div>
        </div>
      </div>

      {isBrokerage && <BrokerageHoldings accountId={acct.id} />}
      {isBrokerage && <BrokerageCash acct={acct} />}
    </div>
  );
}

/* ── BrokerageMultiCurrencyTotals ──────── */
function BrokerageMultiCurrencyTotals({ acct }: { acct: BankAccount }) {
  // 合併持倉同現金，按幣種分組
  const totals: Record<string, { holdings: number; cash: number }> = {};
  for (const h of acct.holdings_by_currency || []) {
    totals[h.currency] = totals[h.currency] || { holdings: 0, cash: 0 };
    totals[h.currency].holdings += h.market_value;
  }
  for (const c of acct.cash_balances || []) {
    totals[c.currency] = totals[c.currency] || { holdings: 0, cash: 0 };
    totals[c.currency].cash += c.amount;
  }
  const entries = Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic" title="未有持倉或現金">
        未有持倉
      </div>
    );
  }

  return (
    <div className="space-y-0.5" title="證券戶口 = 持倉市值 + 閒置現金（按幣種）">
      {entries.map(([cur, v]) => {
        const total = v.holdings + v.cash;
        return (
          <div key={cur} className="flex items-baseline gap-1.5 justify-end">
            <span className="text-[10px] text-muted-foreground">{cur}</span>
            <span className="font-semibold tabular-nums text-sm">
              {total.toLocaleString("zh-HK", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── BrokerageCash — 多幣種現金管理 ─────── */
const CASH_CURRENCIES = ["HKD", "USD", "CNY", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "SGD", "TWD"];

function BrokerageCash({ acct }: { acct: BankAccount }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newAmount, setNewAmount] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState("");

  const cash = acct.cash_balances || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };

  const upsertMutation = useMutation({
    mutationFn: ({ currency, amount }: { currency: string; amount: number }) =>
      api.upsertCashBalance(acct.id, currency, amount),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setNewAmount("");
      setEditKey(null);
      toast.success("已更新現金");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (currency: string) => api.deleteCashBalance(acct.id, currency),
    onSuccess: () => {
      invalidate();
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-2 pt-2 border-t border-border/60">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-muted-foreground">
          💰 閒置現金 ({cash.length})
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showAdd ? "取消" : "+ 加幣種"}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const amt = parseFloat(newAmount);
            if (isNaN(amt)) return;
            upsertMutation.mutate({ currency: newCurrency, amount: amt });
          }}
          className="mb-2 flex gap-1.5"
        >
          <select
            value={newCurrency}
            onChange={(e) => setNewCurrency(e.target.value)}
            className="px-2 py-1 text-xs border border-border rounded bg-background"
          >
            {CASH_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="金額"
            className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-right"
            autoFocus
            required
          />
          <button
            type="submit"
            disabled={upsertMutation.isPending}
            className="px-2 py-1 text-xs bg-foreground text-background rounded disabled:opacity-50"
          >
            加
          </button>
        </form>
      )}

      {cash.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-1">仲未有閒置現金</div>
      ) : (
        <div className="space-y-1">
          {cash.map((c) => {
            const isEditing = editKey === c.currency;
            return (
              <div
                key={c.currency}
                className="flex items-center justify-between gap-2 px-2 py-1 text-xs bg-muted/30 rounded"
              >
                <span className="font-medium w-10">{c.currency}</span>
                {isEditing ? (
                  <div className="flex gap-1 flex-1 justify-end">
                    <input
                      type="number"
                      step="0.01"
                      value={editAmt}
                      onChange={(e) => setEditAmt(e.target.value)}
                      className="w-24 px-1.5 py-0.5 text-[11px] border border-border rounded bg-background text-right"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = parseFloat(editAmt);
                        if (!isNaN(v))
                          upsertMutation.mutate({ currency: c.currency, amount: v });
                      }}
                      className="px-1.5 py-0.5 text-[10px] bg-foreground text-background rounded"
                    >
                      確認
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditKey(null)}
                      className="px-1.5 py-0.5 text-[10px] border border-border rounded"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold tabular-nums flex-1 text-right">
                      {c.amount.toLocaleString("zh-HK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditKey(c.currency);
                        setEditAmt(String(c.amount));
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      改
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`刪除 ${c.currency} 現金結餘？`))
                          deleteMutation.mutate(c.currency);
                      }}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      刪
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── BrokerageHoldings ─────────────────── */
function BrokerageHoldings({ accountId }: { accountId: number }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editCost, setEditCost] = useState("");

  const { data: holdings = [], isLoading } = useQuery<StockHolding[]>({
    queryKey: ["stock-holdings", accountId],
    queryFn: () => api.listStockHoldings(accountId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["stock-holdings", accountId] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createStockHolding({
        account_id: accountId,
        symbol: symbol.trim().toUpperCase(),
        quantity: parseFloat(quantity) || 0,
        avg_cost: avgCost ? parseFloat(avgCost) : null,
      }),
    onSuccess: () => {
      invalidate();
      setSymbol("");
      setQuantity("");
      setAvgCost("");
      setShowAdd(false);
      toast.success("已新增持倉");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, qty, cost }: { id: number; qty: number; cost: number | null }) =>
      api.updateStockHolding(id, { quantity: qty, avg_cost: cost }),
    onSuccess: () => {
      invalidate();
      setEditId(null);
      toast.success("已更新");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteStockHolding(id),
    onSuccess: () => {
      invalidate();
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.refreshStockQuotes(),
    onSuccess: (r) => {
      invalidate();
      if (r.failed.length > 0) {
        toast.error(`${r.refreshed} 隻已更新；失敗：${r.failed.join(", ")}`);
      } else {
        toast.success(`已更新 ${r.refreshed} 隻股票報價`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function startEdit(h: StockHolding) {
    setEditId(h.id);
    setEditQty(String(h.quantity));
    setEditCost(h.avg_cost != null ? String(h.avg_cost) : "");
  }

  function commitEdit(id: number) {
    const qty = parseFloat(editQty);
    if (isNaN(qty)) return;
    const cost = editCost ? parseFloat(editCost) : null;
    updateMutation.mutate({ id, qty, cost: cost != null && !isNaN(cost) ? cost : null });
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground">
          📈 持倉 ({holdings.length})
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || holdings.length === 0}
            className="text-xs text-blue-600 hover:underline disabled:opacity-40"
            title="拉取最新報價（Yahoo Finance 延遲報價）"
          >
            {refreshMutation.isPending ? "更新中…" : "🔄 更新報價"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showAdd ? "取消" : "+ 新增持倉"}
          </button>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!symbol.trim()) return;
            createMutation.mutate();
          }}
          className="mb-2 p-2 bg-muted/40 rounded space-y-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="代號 (例：0700.HK / AAPL)"
              className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
              autoFocus
              required
            />
            <input
              type="number"
              step="0.000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="股數"
              className="w-24 px-2 py-1 text-sm border border-border rounded bg-background text-right"
              required
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.0001"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              placeholder="平均成本（選填）"
              className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-right"
            />
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-3 py-1 text-xs bg-foreground text-background rounded disabled:opacity-50"
            >
              {createMutation.isPending ? "新增中…" : "新增"}
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            HK 股票加 .HK 後綴 (例：0700.HK = 騰訊)，US 股票直接用 ticker (AAPL, VOO 等)
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground py-2">載入中…</div>
      ) : holdings.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">仲未有持倉</div>
      ) : (
        <div className="space-y-1">
          {holdings.map((h) => {
            const qty = Number(h.quantity || 0);
            const price = h.last_price != null ? Number(h.last_price) : null;
            const cost = h.avg_cost != null ? Number(h.avg_cost) : null;
            const value = price != null ? qty * price : null;
            const pl = price != null && cost != null ? qty * (price - cost) : null;
            const plPct = price != null && cost != null && cost > 0 ? ((price - cost) / cost) * 100 : null;
            const isEditing = editId === h.id;
            return (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs bg-muted/30 rounded"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {h.symbol}
                    {h.name && (
                      <span className="text-muted-foreground font-normal ml-1.5">
                        {h.name}
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1 mt-1">
                      <input
                        type="number"
                        step="0.000001"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="股數"
                        className="w-20 px-1.5 py-0.5 text-[11px] border border-border rounded bg-background text-right"
                        autoFocus
                      />
                      <input
                        type="number"
                        step="0.0001"
                        value={editCost}
                        onChange={(e) => setEditCost(e.target.value)}
                        placeholder="成本"
                        className="w-20 px-1.5 py-0.5 text-[11px] border border-border rounded bg-background text-right"
                      />
                      <button
                        type="button"
                        onClick={() => commitEdit(h.id)}
                        className="px-1.5 py-0.5 text-[10px] bg-foreground text-background rounded"
                      >
                        確認
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="px-1.5 py-0.5 text-[10px] border border-border rounded"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">
                      {qty.toLocaleString("zh-HK", { maximumFractionDigits: 4 })} 股
                      {price != null && (
                        <>
                          {" · "}
                          <span>@ {price.toFixed(2)} {h.currency}</span>
                        </>
                      )}
                      {cost != null && (
                        <>
                          {" · 成本 "}
                          {cost.toFixed(2)}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {value != null ? (
                    <div className="font-semibold tabular-nums">
                      {value.toLocaleString("zh-HK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">—</div>
                  )}
                  {pl != null && (
                    <div
                      className={`text-[10px] tabular-nums ${
                        pl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {pl >= 0 ? "+" : ""}
                      {pl.toLocaleString("zh-HK", { maximumFractionDigits: 2 })}
                      {plPct != null && (
                        <> ({pl >= 0 ? "+" : ""}{plPct.toFixed(2)}%)</>
                      )}
                    </div>
                  )}
                  {!isEditing && (
                    <div className="flex gap-2 mt-0.5 justify-end">
                      <button
                        type="button"
                        onClick={() => startEdit(h)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        改
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`刪除 ${h.symbol}？`)) deleteMutation.mutate(h.id);
                        }}
                        className="text-[10px] text-red-500 hover:underline"
                      >
                        刪
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
