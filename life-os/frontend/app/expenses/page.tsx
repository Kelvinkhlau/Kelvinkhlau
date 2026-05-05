"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Expense, type ExpenseStats, type FinancialSummary, type BankAccount, type Transfer } from "@/lib/api";
import { BankLogo } from "@/components/BankLogo";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money, useMoneyFmt } from "@/components/Money";
import { AmountKeypad } from "@/components/AmountKeypad";
import { MerchantAutocomplete } from "@/components/MerchantAutocomplete";
import { ExpenseSplitsModal } from "@/components/ExpenseSplitsModal";

/* ─── 二級分類定義（HK 適用） ─── */

type CategoryGroup = {
  icon: string;
  label: string;
  subs: { icon: string; label: string }[];
};

const CATEGORY_TREE: CategoryGroup[] = [
  {
    icon: "🍽️", label: "餐飲",
    subs: [
      { icon: "🍳", label: "早餐" },
      { icon: "🍱", label: "午餐" },
      { icon: "🍲", label: "晚餐" },
      { icon: "🌙", label: "宵夜" },
      { icon: "🍿", label: "零食" },
      { icon: "🥤", label: "飲料水果" },
      { icon: "🛒", label: "買餸" },
      { icon: "🍽️", label: "餐飲其他" },
    ],
  },
  {
    icon: "🚗", label: "交通",
    subs: [
      { icon: "🚇", label: "港鐵" },
      { icon: "🚌", label: "巴士" },
      { icon: "🚕", label: "的士" },
      { icon: "⛽", label: "油費" },
      { icon: "🔌", label: "充電" },
      { icon: "🅿️", label: "泊車" },
      { icon: "🛣️", label: "隧道費" },
      { icon: "✈️", label: "飛機" },
      { icon: "🚂", label: "火車" },
      { icon: "⛴️", label: "渡輪" },
      { icon: "🔧", label: "保養維修" },
      { icon: "🛡️", label: "車保" },
      { icon: "📝", label: "罰款" },
      { icon: "🚗", label: "交通其他" },
    ],
  },
  {
    icon: "🛍️", label: "購物",
    subs: [
      { icon: "📦", label: "淘寶" },
      { icon: "👕", label: "衫褲鞋袋" },
      { icon: "🏠", label: "家品百貨" },
      { icon: "📱", label: "電子產品" },
      { icon: "📚", label: "書籍文具" },
      { icon: "🍷", label: "煙酒" },
      { icon: "🔌", label: "電器" },
      { icon: "💍", label: "珠寶首飾" },
      { icon: "🛍️", label: "購物其他" },
    ],
  },
  {
    icon: "🎮", label: "娛樂",
    subs: [
      { icon: "🏖️", label: "旅遊度假" },
      { icon: "🎬", label: "電影" },
      { icon: "🎮", label: "遊戲" },
      { icon: "💪", label: "運動健身" },
      { icon: "🐾", label: "寵物" },
      { icon: "🥂", label: "聚會" },
      { icon: "☕", label: "咖啡茶飲" },
      { icon: "🎤", label: "KTV" },
      { icon: "🎭", label: "演出" },
      { icon: "📺", label: "串流訂閱" },
      { icon: "🎮", label: "娛樂其他" },
    ],
  },
  {
    icon: "🏥", label: "醫療",
    subs: [
      { icon: "🩺", label: "門診" },
      { icon: "💊", label: "藥品" },
      { icon: "🏥", label: "住院" },
      { icon: "🔬", label: "體檢" },
      { icon: "🧘", label: "保健" },
      { icon: "🦷", label: "牙科" },
      { icon: "🏥", label: "醫療其他" },
    ],
  },
  {
    icon: "🎓", label: "教育",
    subs: [
      { icon: "🎓", label: "學費" },
      { icon: "📖", label: "培訓課程" },
      { icon: "📚", label: "書籍教材" },
      { icon: "✏️", label: "補習" },
      { icon: "🎓", label: "教育其他" },
    ],
  },
  {
    icon: "🏠", label: "住屋",
    subs: [
      { icon: "🏠", label: "租金" },
      { icon: "🏢", label: "管理費" },
      { icon: "💡", label: "水電煤" },
      { icon: "📶", label: "電話上網" },
      { icon: "🧹", label: "家政" },
      { icon: "🔨", label: "維修裝修" },
      { icon: "🛋️", label: "傢俬" },
      { icon: "📮", label: "快遞郵政" },
      { icon: "🏠", label: "住屋其他" },
    ],
  },
  {
    icon: "🧴", label: "日用品",
    subs: [
      { icon: "💄", label: "美容護理" },
      { icon: "🧹", label: "清潔用品" },
      { icon: "💇", label: "理髮" },
      { icon: "🧴", label: "日用其他" },
    ],
  },
  {
    icon: "🎁", label: "人情",
    subs: [
      { icon: "🧧", label: "禮金紅包" },
      { icon: "🍽️", label: "請客" },
      { icon: "❤️", label: "孝敬" },
      { icon: "🎁", label: "禮物" },
      { icon: "🤝", label: "捐款" },
      { icon: "💸", label: "代付" },
      { icon: "🎁", label: "人情其他" },
    ],
  },
  {
    icon: "📈", label: "投資",
    subs: [
      { icon: "🛡️", label: "保險" },
      { icon: "📊", label: "基金" },
      { icon: "📈", label: "股票" },
      { icon: "💰", label: "利息" },
      { icon: "🏦", label: "銀行手續費" },
      { icon: "📈", label: "投資其他" },
    ],
  },
  {
    icon: "💼", label: "生意",
    subs: [
      { icon: "🖨️", label: "辦公費" },
      { icon: "👷", label: "人工" },
      { icon: "📦", label: "採購" },
      { icon: "📣", label: "營銷" },
      { icon: "🏪", label: "店舖租金" },
      { icon: "💼", label: "生意其他" },
    ],
  },
  {
    icon: "📎", label: "其他",
    subs: [
      { icon: "💳", label: "八達通" },
      { icon: "❓", label: "漏記" },
      { icon: "📎", label: "其他" },
    ],
  },
];

/** 收入分類 */
const INCOME_CATEGORIES: CategoryGroup[] = [
  { icon: "💰", label: "薪金", subs: [{ icon: "💰", label: "月薪" }, { icon: "🎖️", label: "獎金" }, { icon: "💸", label: "佣金" }] },
  { icon: "👷", label: "兼職", subs: [{ icon: "💻", label: "freelance" }, { icon: "👷", label: "兼職其他" }] },
  { icon: "📈", label: "投資收益", subs: [{ icon: "📊", label: "股息" }, { icon: "🏦", label: "利息" }, { icon: "🏠", label: "租金收入" }, { icon: "📈", label: "投資其他" }] },
  { icon: "↩️", label: "退款", subs: [{ icon: "↩️", label: "退款" }] },
  { icon: "🎁", label: "紅包", subs: [{ icon: "🧧", label: "利是" }, { icon: "🎁", label: "禮金" }] },
  { icon: "💵", label: "收入其他", subs: [{ icon: "💵", label: "收入其他" }] },
];

/** 所有大類名稱 */
const ALL_CATEGORIES = CATEGORY_TREE.map((g) => g.label);

const FALLBACK_METHODS = ["現金", "信用卡", "八達通", "PayMe", "轉數快", "其他"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** 本地 now，格式 YYYY-MM-DDTHH:mm（唔含 timezone）— 用嚟俾 <input type="datetime-local"> */
function nowLocalStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 當前時段 → 對應餐飲子類（6-11 早餐、12-17 午餐、18-20 晚餐、21-3 宵夜）*/
function mealSubcategoryByHour(hour: number): string | null {
  if (hour >= 6 && hour <= 11) return "早餐";
  if (hour >= 12 && hour <= 17) return "午餐";
  if (hour >= 18 && hour <= 20) return "晚餐";
  if (hour >= 21 || hour <= 3) return "宵夜";
  // 4-5 冇定義（太早食「早餐」又太夜食「宵夜」），return null
  return null;
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/* ─── 分類 icon：用 grayscale + contrast 令 emoji 貼近頁面 monochrome 風格 ─── */

// 未選中：完全 grayscale；已選：保留一點色彩 subtle
const ICON_FILTER_MUTED = "grayscale(1) contrast(0.9) opacity(0.8)";
const ICON_FILTER_ACTIVE = "grayscale(0.3) contrast(1) opacity(1)";

/* ─── 分類選擇器（full-sheet bottom modal，系統風格） ─── */

function CategoryPicker({
  value,
  subValue,
  onChange,
  tree,
}: {
  value: string;
  subValue: string | null;
  onChange: (cat: string, sub: string | null) => void;
  tree?: CategoryGroup[];
}) {
  const currentTree = tree || CATEGORY_TREE;
  const [open, setOpen] = useState(false);
  const [viewLabel, setViewLabel] = useState<string>(
    value || currentTree[0]?.label || ""
  );

  // 鎖 body scroll when modal open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const displayLabel = subValue || value || "選擇分類";
  const group = currentTree.find((g) => g.label === value);
  const displayIcon =
    (subValue && group?.subs.find((s) => s.label === subValue)?.icon) ||
    group?.icon ||
    "📎";

  const viewGroup =
    currentTree.find((g) => g.label === viewLabel) || currentTree[0];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewLabel(value || currentTree[0]?.label || "");
          setOpen(true);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 border border-border rounded bg-background text-left"
      >
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted text-base leading-none"
          style={{ filter: ICON_FILTER_MUTED }}
        >
          {displayIcon}
        </span>
        <span className="flex-1 truncate text-sm">{displayLabel}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl h-[88vh] bg-background rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-[slideup_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
            style={{
              // iOS safe area bottom
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Drag handle + header */}
            <div className="flex-shrink-0">
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-4 pt-1 pb-3 border-b border-border">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 -ml-2 min-h-[44px] min-w-[44px] flex items-center"
                  aria-label="取消"
                >
                  取消
                </button>
                <h3 className="text-base font-semibold">選擇分類</h3>
                <div className="w-[60px]" aria-hidden="true" />
              </div>
            </div>

            {/* Two-column layout: left major cats, right subcats */}
            <div className="flex flex-1 min-h-0">
              {/* Left column */}
              <div className="w-[96px] flex-shrink-0 overflow-y-auto bg-muted/50 border-r border-border">
                {currentTree.map((g) => {
                  const isActive = viewGroup?.label === g.label;
                  const isSelected = value === g.label;
                  return (
                    <button
                      key={g.label}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewLabel(g.label);
                      }}
                      className={`w-full flex flex-col items-center justify-center gap-1 py-3 min-h-[64px] text-[12px] transition ${
                        isActive
                          ? "bg-background font-semibold text-foreground border-l-[3px] border-l-foreground"
                          : isSelected
                          ? "text-foreground border-l-[3px] border-l-transparent hover:bg-background/60"
                          : "text-muted-foreground border-l-[3px] border-l-transparent hover:bg-background/60"
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${
                          isActive ? "bg-muted" : "bg-background/80"
                        } text-lg leading-none`}
                        style={{
                          filter: isActive ? ICON_FILTER_ACTIVE : ICON_FILTER_MUTED,
                        }}
                      >
                        {g.icon}
                      </span>
                      <span className="truncate max-w-full px-1">{g.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right column */}
              <div className="flex-1 overflow-y-auto p-4">
                {viewGroup && (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        {viewGroup.label}
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(viewGroup.label, null);
                          setOpen(false);
                        }}
                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted text-muted-foreground"
                      >
                        只揀「{viewGroup.label}」
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {viewGroup.subs.map((s) => {
                        const selected =
                          value === viewGroup.label && subValue === s.label;
                        return (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => {
                              onChange(viewGroup.label, s.label);
                              setOpen(false);
                            }}
                            className={`flex flex-col items-center justify-start gap-1.5 py-2 text-[12px] leading-tight transition ${
                              selected ? "text-foreground font-semibold" : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl leading-none transition ${
                                selected
                                  ? "bg-foreground ring-2 ring-foreground"
                                  : "bg-muted"
                              }`}
                              style={{
                                filter: selected
                                  ? "grayscale(1) invert(1) contrast(1.1)"
                                  : ICON_FILTER_MUTED,
                              }}
                            >
                              {s.icon}
                            </span>
                            <span className="truncate max-w-full px-1 text-center">
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <style jsx>{`
            @keyframes slideup {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

/* ─── 頁面主體 ─── */

type MonthlyData = { year: number; month: number; total: number; count: number };

export default function ExpensesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExpensesPageInner />
    </Suspense>
  );
}

function ExpensesPageInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filterCat, setFilterCat] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  // Add / edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [txnType, setTxnType] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("餐飲");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [ledgerId, setLedgerId] = useState<number | null>(null);
  const [spentAt, setSpentAt] = useState(nowLocalStr());

  // Transfer form state
  const [transferFromId, setTransferFromId] = useState<number | null>(null);
  const [transferToId, setTransferToId] = useState<number | null>(null);
  const [transferNote, setTransferNote] = useState("");

  // AmountKeypad 開關
  const [keypadOpen, setKeypadOpen] = useState(false);
  // 再記（連續記賬）— 儲存後唔 close form，只 reset amount + description，保留 category/merchant/payment
  const [continuous, setContinuous] = useState(false);

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deleteTransferTarget, setDeleteTransferTarget] = useState<number | null>(null);
  const [splitsTarget, setSplitsTarget] = useState<Expense | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const octopusRef = useRef<HTMLInputElement>(null);

  // Financial summary
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<FinancialSummary | null>(null);

  // 頂部快捷鍵「新增消費」— URL 帶 ?new=1 時自動開表單
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNewExpenseForm();
      router.replace("/expenses");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const listParams: Record<string, string> = {};
  if (filterCat) listParams.category = filterCat;
  if (dateFrom) listParams.date_from = dateFrom;
  if (dateTo) listParams.date_to = dateTo;

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses", filterCat, dateFrom, dateTo],
    queryFn: () => api.listExpenses(listParams),
  });

  const statsParams: { txn_type?: string; date_from?: string; date_to?: string } = {};
  if (dateFrom) statsParams.date_from = dateFrom;
  if (dateTo) statsParams.date_to = dateTo;

  // 開支（expense only）— 用嚟畫分類 bar chart + hero card
  const { data: stats } = useQuery<ExpenseStats>({
    queryKey: ["expenses-stats", "expense", filterCat, dateFrom, dateTo],
    queryFn: () => api.expenseStats({ ...statsParams, txn_type: "expense" }),
  });

  // 收入（income only）— 純為 hero card
  const { data: incomeStats } = useQuery<ExpenseStats>({
    queryKey: ["expenses-stats", "income", dateFrom, dateTo],
    queryFn: () => api.expenseStats({ ...statsParams, txn_type: "income" }),
  });

  const { data: monthly = [] } = useQuery<MonthlyData[]>({
    queryKey: ["expenses-monthly"],
    queryFn: () => api.expenseMonthly(6),
  });

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts-active"],
    queryFn: () => api.listBankAccounts(true),
  });

  // Ledgers (P3-14)
  const { data: ledgers = [] } = useQuery({
    queryKey: ["ledgers-active"],
    queryFn: () => api.listLedgers(true),
  });

  // 證券戶口嘅 parent group 唔可以做付款 / 轉賬 source（只係分類用）
  const selectableAccounts = bankAccounts.filter(
    (a) => !bankAccounts.some((c) => c.parent_account_id === a.id)
  );

  // Transfers — 同一日期範圍，混入列表顯示
  const { data: transfers = [] } = useQuery<Transfer[]>({
    queryKey: ["transfers", dateFrom, dateTo],
    queryFn: () =>
      api.listTransfers({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      txn_type?: "expense" | "income";
      amount: number;
      category: string;
      subcategory?: string | null;
      description?: string;
      merchant?: string;
      payment_method?: string;
      payment_account_id?: number | null;
      ledger_id?: number | null;
      spent_at: string;
    }) => api.createExpense(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      if (continuous) {
        // 再記模式：只 reset amount + description，保留 category/merchant/payment
        setAmount("");
        setDescription("");
        toast.success("已新增 — 繼續記");
      } else {
        setAmount("");
        setDescription("");
        setMerchant("");
        setPaymentAccountId(null);
        setShowForm(false);
        toast.success("已新增消費");
      }
      if (data.budget_warning) {
        const w = data.budget_warning;
        toast.warning(
          `⚠️ ${w.category} 已用 ${Math.round(w.percentage)}% 預算（$${w.spent.toLocaleString("zh-HK")}/$${w.budget.toLocaleString("zh-HK")}）`
        );
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateExpense>[1] }) =>
      api.updateExpense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      resetExpenseForm();
      toast.success("已更新");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function resetExpenseForm() {
    setEditId(null);
    setShowForm(false);
    setAmount("");
    setDescription("");
    setMerchant("");
    setPaymentMethod("");
    setPaymentAccountId(null);
    setLedgerId(null);
    setSubcategory(null);
    setSpentAt(nowLocalStr());
  }

  /** 打開新增表單 — refresh spent_at + 智能預設餐飲子類 */
  function openNewExpenseForm() {
    setEditId(null);
    setSpentAt(nowLocalStr());
    // 預設分類為餐飲 + 按當前時間填子類
    setCategory("餐飲");
    const hour = new Date().getHours();
    setSubcategory(mealSubcategoryByHour(hour));
    setTxnType("expense");
    setShowForm(true);
  }

  function startEdit(exp: Expense) {
    if (exp.txn_type !== "expense" && exp.txn_type !== "income") return;
    setEditId(exp.id);
    setTxnType(exp.txn_type);
    setAmount(String(exp.amount));
    setCategory(exp.category);
    setSubcategory(exp.subcategory ?? null);
    setDescription(exp.description ?? "");
    setMerchant(exp.merchant ?? "");
    setPaymentAccountId(exp.payment_account_id ?? null);
    setPaymentMethod(exp.payment_account_id ? "" : (exp.payment_method ?? ""));
    setLedgerId(exp.ledger_id ?? null);
    // spent_at 可能係 "2026-04-10" 或 "2026-04-10T14:30:00"，trim 到 "YYYY-MM-DDTHH:mm"
    const s = exp.spent_at || "";
    if (s.includes("T")) {
      setSpentAt(s.slice(0, 16));
    } else if (s.length >= 10) {
      setSpentAt(`${s.slice(0, 10)}T00:00`);
    } else {
      setSpentAt(nowLocalStr());
    }
    setShowForm(true);
  }

  const csvMutation = useMutation({
    mutationFn: (file: File) => api.importExpenseCsv(file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      toast.success(`匯入完成：${result.imported} 筆，跳過 ${result.skipped} 筆`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} 個錯誤`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const octopusMutation = useMutation({
    mutationFn: (file: File) => api.importOctopus(file),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      toast.success(`匯入完成：${result.imported} 筆，跳過 ${result.skipped} 筆`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} 個錯誤`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleFetchSummary = async () => {
    if (showSummary && summaryData) {
      setShowSummary(false);
      return;
    }
    setShowSummary(true);
    setSummaryLoading(true);
    try {
      const data = await api.financialSummary();
      setSummaryData(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onMutate: async (id) => {
      const key = ["expenses", filterCat, dateFrom, dateTo];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Expense[]>(key);
      queryClient.setQueryData<Expense[]>(key, (old) => old?.filter((exp) => exp.id !== id));
      return { prev, key };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev && ctx.key) queryClient.setQueryData(ctx.key, ctx.prev);
      toast.error((e as Error).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expenses-monthly"] });
      toast.success("已刪除");
    },
  });

  const createTransferMutation = useMutation({
    mutationFn: (payload: {
      from_account_id: number;
      to_account_id: number;
      amount: number;
      transferred_at: string;
      note?: string;
      currency?: string;
    }) => api.createTransfer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      setAmount("");
      setTransferNote("");
      setShowForm(false);
      toast.success("已記錄轉賬");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (id: number) => api.deleteTransfer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-active"] });
      toast.success("已刪除轉賬");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    if (txnType === "transfer") {
      if (!transferFromId || !transferToId) {
        toast.error("請揀出賬同入賬戶口");
        return;
      }
      if (transferFromId === transferToId) {
        toast.error("兩個戶口唔可以相同");
        return;
      }
      const fromAcc = bankAccounts.find((a) => a.id === transferFromId);
      const toAcc = bankAccounts.find((a) => a.id === transferToId);
      if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency) {
        toast.error(`跨貨幣轉賬未支援（${fromAcc.currency} → ${toAcc.currency}）`);
        return;
      }
      createTransferMutation.mutate({
        from_account_id: transferFromId,
        to_account_id: transferToId,
        amount: amt,
        currency: fromAcc?.currency || "HKD",
        note: transferNote || undefined,
        // backend `transferred_at` 係 date (YYYY-MM-DD)，截走時間部分
        transferred_at: spentAt.slice(0, 10),
      });
      return;
    }

    // 如果選咗付款賬戶，用賬戶名做 payment_method
    const selectedAccount = paymentAccountId
      ? bankAccounts.find((a) => a.id === paymentAccountId)
      : null;
    const method = selectedAccount ? selectedAccount.name : (paymentMethod || undefined);

    const payload = {
      txn_type: txnType as "expense" | "income",
      amount: amt,
      category,
      subcategory: subcategory || undefined,
      description: description || undefined,
      merchant: merchant || undefined,
      payment_method: method,
      payment_account_id: paymentAccountId || undefined,
      ledger_id: ledgerId ?? undefined,
      spent_at: spentAt,
    };

    if (editId !== null) {
      updateMutation.mutate({ id: editId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // 搵大類嘅 icon（expense + income 都支援）
  const getCategoryIcon = (cat: string) => {
    return (
      CATEGORY_TREE.find((g) => g.label === cat)?.icon ||
      INCOME_CATEGORIES.find((g) => g.label === cat)?.icon ||
      "📎"
    );
  };

  // 賬戶 id → last4 map（row 顯示尾 4 碼 chip 用）
  const accountLast4 = new Map<number, string>();
  const accountIconMap = new Map<number, string>();
  bankAccounts.forEach((a) => {
    if (a.last4) accountLast4.set(a.id, a.last4);
    if (a.icon) accountIconMap.set(a.id, a.icon);
  });

  // 搵子類嘅 icon
  const getSubIcon = (cat: string, sub: string | null) => {
    if (!sub) return getCategoryIcon(cat);
    const g =
      CATEGORY_TREE.find((g) => g.label === cat) ||
      INCOME_CATEGORIES.find((g) => g.label === cat);
    return g?.subs.find((s) => s.label === sub)?.icon || getCategoryIcon(cat);
  };

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">消費記錄</h1>
        <div className="flex items-center gap-3">
          <input
            ref={csvRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) csvMutation.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => csvRef.current?.click()}
            disabled={csvMutation.isPending}
            className="text-sm px-3 py-1 border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            {csvMutation.isPending ? "匯入中…" : "匯入 CSV"}
          </button>
          <input
            ref={octopusRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) octopusMutation.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => octopusRef.current?.click()}
            disabled={octopusMutation.isPending}
            className="text-sm px-3 py-1 border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            {octopusMutation.isPending ? "匯入中…" : "匯入八達通"}
          </button>
        </div>
      </div>

      {/* Hero: 支出 / 收入 / 結餘 */}
      {(stats || incomeStats) && (() => {
        const expTotal = stats?.total ?? 0;
        const incTotal = incomeStats?.total ?? 0;
        const net = incTotal - expTotal;
        const netPositive = net >= 0;
        return (
          <section className="mb-5 grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow">
              <div className="text-[11px] opacity-80">月支出</div>
              <div className="text-lg sm:text-xl font-bold tabular-nums mt-1 truncate">
                <Money value={expTotal} prefix="$" />
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">{stats?.count ?? 0} 筆</div>
            </div>
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow">
              <div className="text-[11px] opacity-80">收入</div>
              <div className="text-lg sm:text-xl font-bold tabular-nums mt-1 truncate">
                <Money value={incTotal} prefix="$" />
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">{incomeStats?.count ?? 0} 筆</div>
            </div>
            <div
              className={`p-3 rounded-xl shadow text-white ${
                netPositive
                  ? "bg-gradient-to-br from-blue-500 to-blue-700"
                  : "bg-gradient-to-br from-slate-500 to-slate-700"
              }`}
            >
              <div className="text-[11px] opacity-80">結餘</div>
              <div className="text-lg sm:text-xl font-bold tabular-nums mt-1 truncate">
                <Money value={Math.abs(net)} prefix={netPositive ? "+$" : "−$"} />
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">
                {incTotal > 0 ? `儲蓄率 ${Math.round((net / incTotal) * 100)}%` : "收支淨額"}
              </div>
            </div>
          </section>
        );
      })()}

      {/* 分類 breakdown */}
      {stats && Object.keys(stats.by_category).length > 0 && (
        <section className="mb-6 p-4 border border-border rounded-lg">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-medium">支出分類</h2>
            <div className="text-sm text-muted-foreground">
              共 {stats.count} 筆
            </div>
          </div>
          {Object.keys(stats.by_category).length > 0 && (
            <div className="space-y-1">
              {Object.entries(stats.by_category)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt]) => (
                  <div key={cat} className="flex items-center text-sm">
                    <span
                      className="w-5 text-center mr-1"
                      style={{ filter: ICON_FILTER_MUTED }}
                    >
                      {getCategoryIcon(cat)}
                    </span>
                    <span className="w-14 text-muted-foreground truncate">{cat}</span>
                    <div className="flex-1 mx-2 h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded"
                        style={{
                          width: `${stats.total ? (amt / stats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs w-20 text-right">
                      <Money value={amt} prefix="$" decimals={2} />
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Monthly trend chart */}
      {monthly.length > 0 && (
        <section className="mb-6 p-4 border border-border rounded-lg">
          <h2 className="font-medium mb-3">月度趨勢</h2>
          <div className="flex items-end gap-1 h-32">
            {(() => {
              const maxVal = Math.max(...monthly.map((m) => m.total), 1);
              return monthly.map((m) => (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <span className="text-[10px] text-muted-foreground">
                    ${m.total >= 1000
                      ? `${(m.total / 1000).toFixed(1)}k`
                      : m.total.toFixed(0)}
                  </span>
                  <div className="w-full flex justify-center">
                    <div
                      className="w-4/5 bg-blue-500 rounded-t min-h-[2px]"
                      style={{
                        height: `${Math.max((m.total / maxVal) * 100, 2)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {m.month}月
                  </span>
                </div>
              ));
            })()}
          </div>
        </section>
      )}

      {/* AI Financial Summary */}
      <section className="mb-6">
        <button
          type="button"
          onClick={handleFetchSummary}
          disabled={summaryLoading}
          className="text-sm px-3 py-1 border border-border rounded hover:bg-muted disabled:opacity-50"
        >
          {summaryLoading ? "分析中…" : "AI 財務分析"}
        </button>
        {showSummary && (
          <div className="mt-3 p-4 border border-border rounded-lg">
            {summaryLoading ? (
              <Loading />
            ) : summaryData ? (
              <div className="text-sm whitespace-pre-wrap">{summaryData.summary}</div>
            ) : null}
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        />
        <span className="text-muted-foreground text-sm">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
        >
          <option value="">全部分類</option>
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {getCategoryIcon(c)} {c}
            </option>
          ))}
        </select>
      </section>

      {/* Add button / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={openNewExpenseForm}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 記一筆消費
        </button>
      ) : (
        <form
          onSubmit={handleAdd}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          {/* 編輯提示 */}
          {editId !== null && (
            <div className="text-xs px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
              ✏️ 修改中（#{editId}）
            </div>
          )}

          {/* 支出 / 收入 / 轉賬切換 */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              disabled={editId !== null}
              onClick={() => {
                setTxnType("expense");
                setCategory("餐飲");
                setSubcategory(mealSubcategoryByHour(new Date().getHours()));
              }}
              className={`flex-1 py-2 text-sm font-medium transition ${txnType === "expense" ? "bg-red-500 text-white" : "hover:bg-muted"} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              💸 支出
            </button>
            <button
              type="button"
              disabled={editId !== null}
              onClick={() => { setTxnType("income"); setCategory("薪金"); setSubcategory(null); }}
              className={`flex-1 py-2 text-sm font-medium transition ${txnType === "income" ? "bg-green-500 text-white" : "hover:bg-muted"} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              💰 收入
            </button>
            <button
              type="button"
              disabled={editId !== null}
              onClick={() => setTxnType("transfer")}
              className={`flex-1 py-2 text-sm font-medium transition ${txnType === "transfer" ? "bg-blue-500 text-white" : "hover:bg-muted"} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              🔄 轉賬
            </button>
          </div>

          {txnType === "transfer" ? (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">從</label>
                  <select
                    value={transferFromId ? String(transferFromId) : ""}
                    onChange={(e) => setTransferFromId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                    required
                  >
                    <option value="">— 揀戶口 —</option>
                    {selectableAccounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.icon || "💳"} {a.name}（${a.balance.toLocaleString("zh-HK")}）
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">到</label>
                  <select
                    value={transferToId ? String(transferToId) : ""}
                    onChange={(e) => setTransferToId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                    required
                  >
                    <option value="">— 揀戶口 —</option>
                    {selectableAccounts
                      .filter((a) => a.id !== transferFromId)
                      .map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.icon || "💳"} {a.name}
                          {a.account_type === "credit" ? "（卡數）" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">金額</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-lg font-bold"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">日期時間</label>
                  <input
                    type="datetime-local"
                    value={spentAt}
                    onChange={(e) => setSpentAt(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">備註</label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="例：還上月卡數"
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createTransferMutation.isPending}
                  className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
                >
                  {createTransferMutation.isPending ? "儲存中…" : "確認轉賬"}
                </button>
                <button
                  type="button"
                  onClick={() => resetExpenseForm()}
                  className="px-4 py-2 border border-border rounded hover:bg-muted"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">金額 (HKD)</label>
              <button
                type="button"
                onClick={() => setKeypadOpen(true)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-lg font-bold text-left tabular-nums hover:bg-muted/50 transition-colors"
                aria-label="開啟金額鍵盤"
              >
                {amount ? amount : <span className="text-muted-foreground font-normal">0.00</span>}
              </button>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">分類</label>
              <div className="mt-1">
                <CategoryPicker
                  value={category}
                  subValue={subcategory}
                  onChange={(cat, sub) => {
                    setCategory(cat);
                    setSubcategory(sub);
                  }}
                  tree={txnType === "income" ? INCOME_CATEGORIES : CATEGORY_TREE}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">商家</label>
              <MerchantAutocomplete
                value={merchant}
                onChange={setMerchant}
                onPick={(s) => {
                  // 自動填 category / payment — 只有當前欄位係空或 default 時先填
                  if (s.last_category && (category === "餐飲" || !category)) {
                    setCategory(s.last_category);
                    setSubcategory(s.last_subcategory ?? null);
                  }
                  if (s.last_payment_account_id && !paymentAccountId && !paymentMethod) {
                    setPaymentAccountId(s.last_payment_account_id);
                  } else if (s.last_payment_method && !paymentAccountId && !paymentMethod) {
                    setPaymentMethod(s.last_payment_method);
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">付款賬戶</label>
              <select
                value={paymentAccountId ? String(paymentAccountId) : paymentMethod ? `m:${paymentMethod}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("m:")) {
                    setPaymentAccountId(null);
                    setPaymentMethod(v.slice(2));
                  } else if (v) {
                    setPaymentAccountId(Number(v));
                    setPaymentMethod("");
                  } else {
                    setPaymentAccountId(null);
                    setPaymentMethod("");
                  }
                }}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                <option value="">—</option>
                {selectableAccounts.length > 0 && (
                  <optgroup label="我的賬戶">
                    {selectableAccounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.icon || "💳"} {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="其他方式">
                  {FALLBACK_METHODS.map((m) => (
                    <option key={m} value={`m:${m}`}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">備註</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="（選填）"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">日期時間</label>
              <input
                type="datetime-local"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
              />
            </div>
          </div>
          {ledgers.length > 1 && (
            <div>
              <label className="text-xs text-muted-foreground">帳簿</label>
              <select
                value={ledgerId ?? ""}
                onChange={(e) =>
                  setLedgerId(e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
              >
                <option value="">預設帳簿</option>
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.icon ? `${l.icon} ` : ""}
                    {l.name}
                    {l.is_default ? " (預設)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            {editId === null && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                  className="w-3.5 h-3.5 accent-foreground"
                />
                記完再記
              </label>
            )}
            <div className="flex-1" />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? "儲存中…"
                : editId !== null
                ? "更新"
                : continuous
                ? "儲存並繼續"
                : "儲存"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              取消
            </button>
          </div>
            </>
          )}
        </form>
      )}

      {/* Amount keypad overlay */}
      <AmountKeypad
        open={keypadOpen}
        value={amount}
        onClose={() => setKeypadOpen(false)}
        onConfirm={(v) => {
          setAmount(v);
          setKeypadOpen(false);
        }}
      />

      {/* Expense + Transfer 合併列表 — 按日 group + 日小計 */}
      <section className="space-y-4">
        {loadingExpenses ? (
          <Loading />
        ) : expenses.length === 0 && transfers.length === 0 ? (
          <EmptyState message="暫時冇記錄" />
        ) : (
          (() => {
            type Row =
              | { kind: "expense"; date: string; id: number; data: Expense }
              | { kind: "transfer"; date: string; id: number; data: Transfer };
            const rows: Row[] = [
              ...expenses.map<Row>((e) => ({
                kind: "expense",
                date: (e.spent_at || "").slice(0, 10),
                id: e.id,
                data: e,
              })),
              // Transfers 唔受 filterCat 影響（佢哋冇 category）
              ...(filterCat ? [] : transfers).map<Row>((t) => ({
                kind: "transfer",
                date: t.transferred_at,
                id: t.id,
                data: t,
              })),
            ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

            // Group by date
            const groups = new Map<string, Row[]>();
            for (const row of rows) {
              const arr = groups.get(row.date);
              if (arr) arr.push(row);
              else groups.set(row.date, [row]);
            }

            const todayIso = todayStr();
            const yesterdayIso = (() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              return d.toISOString().slice(0, 10);
            })();
            const formatDayLabel = (iso: string) => {
              if (iso === todayIso) return "今日";
              if (iso === yesterdayIso) return "昨日";
              const d = new Date(iso + "T00:00:00");
              const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
              return `${d.getMonth() + 1}月${d.getDate()}日 週${week}`;
            };

            return Array.from(groups.entries()).map(([date, dayRows]) => {
              // 日小計：expense 減、income 加（transfer 唔入小計）
              let dayExpense = 0;
              let dayIncome = 0;
              for (const r of dayRows) {
                if (r.kind === "expense") {
                  if (r.data.txn_type === "income") dayIncome += r.data.amount;
                  else dayExpense += r.data.amount;
                }
              }
              const dayNet = dayIncome - dayExpense;

              return (
                <div key={`day-${date}`}>
                  {/* 日 header */}
                  <div className="flex items-baseline justify-between px-1 py-1.5 mb-1.5 border-b border-border">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{formatDayLabel(date)}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      {dayIncome > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          <Money value={dayIncome} prefix="+$" decimals={2} />
                        </span>
                      )}
                      {dayExpense > 0 && (
                        <span className="text-rose-600 dark:text-rose-400">
                          <Money value={dayExpense} prefix="−$" decimals={2} />
                        </span>
                      )}
                      {dayIncome > 0 && dayExpense > 0 && (
                        <span className="text-muted-foreground">
                          淨 <Money value={Math.abs(dayNet)} prefix={dayNet >= 0 ? "+$" : "−$"} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 當日所有 rows */}
                  <div className="space-y-2">
                    {dayRows.map((row) => {
                      if (row.kind === "expense") {
                        const exp = row.data;
                        const last4 = exp.payment_account_id
                          ? accountLast4.get(exp.payment_account_id)
                          : null;
                        const accIcon = exp.payment_account_id
                          ? accountIconMap.get(exp.payment_account_id)
                          : null;
                        return (
                          <div
                            key={`e-${exp.id}`}
                            className="flex items-center p-3 border border-border rounded-lg"
                          >
                            <span
                              className="inline-flex items-center justify-center w-9 h-9 mr-3 rounded-lg bg-muted text-lg shrink-0"
                              style={{ filter: ICON_FILTER_MUTED }}
                            >
                              {getSubIcon(exp.category, exp.subcategory)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-xs px-2 py-0.5 bg-muted rounded">
                                  {exp.category}
                                </span>
                                {exp.subcategory && exp.subcategory !== exp.category && (
                                  <span className="text-xs text-muted-foreground">
                                    {exp.subcategory}
                                  </span>
                                )}
                                {exp.merchant && (
                                  <span className="text-sm font-medium truncate">
                                    {exp.merchant}
                                  </span>
                                )}
                                {exp.source === "email" &&
                                  (exp.source_email_id ? (
                                    <Link
                                      href={`/inbox/detail?id=${exp.source_email_id}`}
                                      className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300"
                                    >
                                      自動提取
                                    </Link>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded dark:bg-purple-900 dark:text-purple-300">
                                      自動提取
                                    </span>
                                  ))}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs text-muted-foreground">
                                {exp.payment_method && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                    {accIcon && <span>{accIcon}</span>}
                                    <span>{exp.payment_method}</span>
                                    {last4 && (
                                      <span className="font-mono text-[10px] opacity-75">
                                        ··{last4}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {exp.description && <span>· {exp.description}</span>}
                              </div>
                            </div>
                            <div className="text-right ml-3">
                              <div
                                className={`font-bold tabular-nums ${
                                  exp.txn_type === "income"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : ""
                                }`}
                              >
                                <Money value={exp.amount} prefix={exp.txn_type === "income" ? "+$" : "−$"} decimals={2} />
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => startEdit(exp)}
                                  className="text-xs text-blue-500 hover:underline"
                                  aria-label={`修改 ${exp.merchant || exp.category} 消費`}
                                >
                                  修改
                                </button>
                                {exp.txn_type !== "income" && (
                                  <button
                                    type="button"
                                    onClick={() => setSplitsTarget(exp)}
                                    className="text-xs text-purple-500 hover:underline"
                                    aria-label={`分攤 ${exp.merchant || exp.category} 消費`}
                                  >
                                    分攤
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(exp.id)}
                                  className="text-xs text-red-500 hover:underline"
                                  aria-label={`刪除 ${exp.merchant || exp.category} 消費`}
                                >
                                  刪除
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      // transfer row
                      const t = row.data;
                      const isCardPayment = t.to_account_type === "credit";
                      return (
                        <div
                          key={`t-${t.id}`}
                          className="flex items-center p-3 border border-border rounded-lg bg-blue-50/40 dark:bg-blue-950/20"
                        >
                          <span
                            className="inline-flex items-center justify-center w-9 h-9 mr-3 rounded-lg bg-muted text-lg shrink-0"
                            style={{ filter: ICON_FILTER_MUTED }}
                          >
                            🔄
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded dark:bg-blue-900 dark:text-blue-300">
                                轉賬
                              </span>
                              {isCardPayment && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded dark:bg-amber-900 dark:text-amber-300">
                                  還卡數
                                </span>
                              )}
                              <span className="text-sm font-medium truncate">
                                {t.from_account_icon || "💳"} {t.from_account_name || "?"} →{" "}
                                {t.to_account_icon || "💳"} {t.to_account_name || "?"}
                              </span>
                            </div>
                            {t.note && (
                              <div className="text-xs text-muted-foreground mt-1">{t.note}</div>
                            )}
                          </div>
                          <div className="text-right ml-3">
                            <div className="font-bold text-muted-foreground tabular-nums">
                              <Money value={t.amount} prefix="$" decimals={2} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeleteTransferTarget(t.id)}
                              className="text-xs text-red-500 hover:underline mt-1"
                              aria-label={`刪除轉賬 ${t.from_account_name} 到 ${t.to_account_name}`}
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除消費"
        message="確定要刪除呢筆消費記錄？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={deleteTransferTarget !== null}
        title="刪除轉賬"
        message="確定刪除呢筆轉賬？兩邊戶口 balance 會 rollback。"
        onConfirm={() => {
          if (deleteTransferTarget !== null) deleteTransferMutation.mutate(deleteTransferTarget);
          setDeleteTransferTarget(null);
        }}
        onCancel={() => setDeleteTransferTarget(null)}
      />

      {splitsTarget && (
        <ExpenseSplitsModal
          expense={splitsTarget}
          onClose={() => setSplitsTarget(null)}
        />
      )}
    </main>
  );
}
