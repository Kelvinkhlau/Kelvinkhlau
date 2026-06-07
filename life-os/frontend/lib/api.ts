/**
 * API client — 同 backend (FastAPI) 講嘢。
 *
 * 開發時：next.config.mjs 會 proxy /api 去 localhost:8000
 * 部署時：FastAPI serve 同一個 origin，唔需要 CORS
 */

const BASE = "/api";

/**
 * WebSocket base URL。
 * - 開發時：Next.js rewrites 唔 proxy WebSocket，所以直駁 backend（:8000）。
 * - 部署時：同 origin，用 `location.host`。
 */
export function getWsBase(): string {
  if (typeof window === "undefined") return "";
  const isDev = process.env.NODE_ENV === "development";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = isDev ? "localhost:3100" : window.location.host;
  return `${proto}//${host}`;
}

export type EmailClassification = {
  ai_category: string;
  ai_confidence: number;
  ai_reason: string | null;
  user_category: string | null;
  final_category: string;
  action_required: boolean;
  action_summary: string | null;
  action_deadline: string | null;
};

export type SmartLabelBrief = {
  id: number;
  name: string;
  color: string;
};

export type Email = {
  id: number;
  subject: string;
  sender: string;
  sender_email: string;
  recipients: string;
  snippet: string;
  received_at: string;
  is_read: boolean;
  has_attachment: boolean;
  folder: string;
  classification: EmailClassification | null;
  smart_label: SmartLabelBrief | null;
};

export type EmailAttachment = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
};

export type EmailDetail = Email & {
  body_text: string;
  body_html: string | null;
  recipients: string;
  is_archived: boolean;
  prev_id: number | null;
  next_id: number | null;
  is_sender_muted: boolean;
  attachments?: EmailAttachment[];
};

export type EmailSendResponse = {
  ok: boolean;
  gmail_message_id: string | null;
  error: string | null;
};

export type AiComposeDraft = {
  to: string;
  subject: string;
  body: string;
  model: string;
};

export type AiReplyDraft = {
  draft: string;
  model: string;
};

export type EmailTranslation = {
  translation: string;
  model: string;
};

export type EmailSummary = {
  tldr: string;
  key_points: string[];
  action_needed: string | null;
  model: string;
};

export type MutedSender = {
  id: number;
  email: string;
  name: string;
  reason: string | null;
  created_at: string;
};

export type GmailStatus =
  | { connected: false; healthy: false }
  | { connected: true; healthy: boolean; email: string; name: string };

export type SyncResult = {
  fetched: number;
  new: number;
  classified: number;
  errors: string[];
};

export type EmailStats = {
  total: number;
  unread: number;
  today_new: number;
  by_category: Record<string, number>;
};

export type EmailListResponse = {
  items: Email[];
  total: number;
};

export type TodoAttachment = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  due_at: string | null;
  project_id: number | null;
  sub_project_id: number | null;
  done: boolean;
  completed_at: string | null;
  source_email_id: number | null;
  attachments: TodoAttachment[];
  created_at: string;
  updated_at: string;
};

export type TodoCreate = {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high";
  due_at?: string | null;
  project_id?: number | null;
  sub_project_id?: number | null;
};

export type TodoUpdate = Partial<TodoCreate> & { done?: boolean };

export type ProjectStatus = "active" | "paused" | "done" | "archived";

export type Project = {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string | null;
  parent_id: number | null;
  due_date: string | null;
  todo_count: number;
  done_count: number;
  sub_project_count: number;
  created_at: string;
  updated_at: string;
};

export type ProjectCreate = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  color?: string | null;
  parent_id?: number | null;
  due_date?: string | null;
};

export type ProjectUpdate = Partial<ProjectCreate>;

export type SubProject = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  order: number;
  todo_count: number;
  done_count: number;
  created_at: string;
  updated_at: string;
};

export type SubProjectCreate = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  due_date?: string | null;
  order?: number;
};

export type SubProjectUpdate = Partial<SubProjectCreate>;

export type Idea = {
  id: number;
  title: string;
  content: string | null;
  tags: string;
  project_id: number | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type IdeaCreate = {
  title: string;
  content?: string | null;
  tags?: string;
  project_id?: number | null;
};

export type IdeaUpdate = Partial<IdeaCreate> & {
  pinned?: boolean;
  archived?: boolean;
};

export type CalendarEvent = {
  id: number;
  source: string;
  external_id: string;
  external_calendar_id: string;
  calendar_name: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category: string;
  color: string;
  recurrence: string | null;
  visibility: string;
  busy: boolean;
  reminders: string | null;
  conference_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CalendarEventCreate = {
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  category?: string;
  color?: string;
  recurrence?: string | null;
  visibility?: string;
  busy?: boolean;
  reminders?: string | null;
};

export type CalendarEventUpdate = Partial<CalendarEventCreate>;

export type CalendarSyncResult = {
  fetched: number;
  new: number;
  updated: number;
};

export type VipSender = {
  id: number;
  email: string;
  name: string;
  note: string | null;
  created_at: string;
};

export type VipCreate = {
  email: string;
  name?: string;
  note?: string | null;
};

export type VipUpdate = {
  name?: string;
  note?: string | null;
};

export type Expense = {
  id: number;
  txn_type: "expense" | "income";
  amount: number;
  currency: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  merchant: string | null;
  payment_method: string | null;
  payment_account_id: number | null;
  ledger_id: number | null;
  subscription_id: number | null;
  spent_at: string;
  source: string | null;
  source_email_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseCreate = {
  txn_type?: "expense" | "income";
  amount: number;
  currency?: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  merchant?: string | null;
  payment_method?: string | null;
  payment_account_id?: number | null;
  ledger_id?: number | null;
  spent_at: string;
};

export type MonthlySummary = {
  year: number;
  month: number;
  income: number;
  expense: number;
  net: number;
  income_count: number;
  expense_count: number;
};

export type DailyTrend = {
  date: string;
  total: number;
  count: number;
};

export type ExpenseUpdate = Partial<ExpenseCreate>;

export type ExpenseStats = {
  total: number;
  count: number;
  by_category: Record<string, number>;
};

export type AuditLogEntry = {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
};

export type DailyReport = {
  date: string;
  todos: {
    pending_total: number;
    overdue: number;
    due_today: number;
    completed_today: number;
    overdue_items: { id: number; title: string; due_at: string | null }[];
    due_today_items: { id: number; title: string; priority: string }[];
  };
  calendar: {
    event_count: number;
    events: {
      id: number;
      title: string;
      start_at: string;
      end_at: string;
      all_day: boolean;
    }[];
  };
  emails: {
    received_today: number;
    unread_total: number;
    important_today: number;
  };
  expenses: {
    today_total: number;
    today_count: number;
  };
};

export type NoteAttachment = {
  id: number;
  note_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type PushSubscriptionOut = {
  id: number;
  label: string;
  user_agent: string;
  enabled: boolean;
  created_at: string;
  is_current: boolean;
};

export type NoteContentFormat = "markdown" | "blocks";

export type Note = {
  id: number;
  title: string;
  content: string;
  content_format: NoteContentFormat;
  folder: string;
  tags: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
  attachments?: NoteAttachment[];
  is_encrypted: boolean;
  encrypted_payload: string | null;
  encryption_iv: string | null;
};

export type NoteCreate = {
  title: string;
  content?: string;
  content_format?: NoteContentFormat;
  folder?: string;
  tags?: string;
  is_encrypted?: boolean;
  encrypted_payload?: string | null;
  encryption_iv?: string | null;
};

export type NoteUpdate = Partial<NoteCreate> & {
  pinned?: boolean;
  archived?: boolean;
};

// Notebooks (GoodNotes-style drawing + writing)

export type Notebook = {
  id: number;
  title: string;
  description: string | null;
  cover_color: string;
  icon: string | null;
  default_template: string;
  tags: string;
  pinned: boolean;
  archived: boolean;
  sort_order: number;
  has_cover_image: boolean;
  created_at: string;
  updated_at: string;
  page_count: number;
};

export type NotebookCreate = {
  title: string;
  description?: string | null;
  cover_color?: string;
  icon?: string | null;
  default_template?: string;
  tags?: string;
};

export type NotebookUpdate = Partial<NotebookCreate> & {
  pinned?: boolean;
  archived?: boolean;
  sort_order?: number;
};

export type NotebookPageSummary = {
  id: number;
  notebook_id: number;
  page_number: number;
  title: string | null;
  thumbnail: string | null;
  tags: string;
  template: string;
  updated_at: string;
};

export type NotebookPage = {
  id: number;
  notebook_id: number;
  page_number: number;
  title: string | null;
  canvas_json: string;
  text_content: string;
  thumbnail: string | null;
  tags: string;
  template: string;
  created_at: string;
  updated_at: string;
};

export type NotebookPageCreate = {
  title?: string | null;
  canvas_json?: string;
  text_content?: string;
  tags?: string;
  template?: string;
  page_number?: number;
};

export type NotebookPageUpdate = {
  title?: string | null;
  canvas_json?: string;
  text_content?: string;
  thumbnail?: string | null;
  tags?: string;
  template?: string;
  page_number?: number;
};

export type NotebookPageSearchHit = {
  notebook_id: number;
  notebook_title: string;
  page_id: number;
  page_number: number;
  page_title: string | null;
  snippet: string;
  tags: string;
  updated_at: string;
};

export type NotebookOcrResponse = {
  text: string;
  tags: string[];
};

export type EncryptionInfo = {
  configured: boolean;
  salt: string | null;
  verifier: string | null;
  verifier_iv: string | null;
};

export type EncryptionSetupPayload = {
  salt: string;
  verifier: string;
  verifier_iv: string;
};

export type Subscription = {
  id: number;
  name: string;
  amount: number;
  currency: string;
  cycle: string;
  category: string;
  next_billing: string;
  note: string | null;
  active: boolean;
  auto_create_expense: boolean;
  payment_account_id: number | null;
  merchant: string | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionCreate = {
  name: string;
  amount: number;
  currency?: string;
  cycle?: string;
  category?: string;
  next_billing: string;
  note?: string | null;
  auto_create_expense?: boolean;
  payment_account_id?: number | null;
  merchant?: string | null;
};

export type Budget = {
  id: number;
  category: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentage: number;
  created_at: string;
  updated_at: string;
};

export type BudgetCreate = {
  category: string;
  amount: number;
  currency?: string;
};

export type CashBalance = { currency: string; amount: number };
export type HoldingBreakdown = { currency: string; market_value: number };

export type StatementReconcileLine = {
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  txn_type: string;
  kind: string;
  category: string | null;
  subcategory: string | null;
  action: "added" | "matched" | "skipped" | "transfer";
  expense_id: number | null;
  note: string | null;
  counterparty: string | null;
  to_name: string | null;
  account_name: string | null;
  currency: string | null;
};

export type StatementReconcileResult = {
  statement_import_id: number | null;
  account_id: number;
  account_name: string;
  period: string | null;
  statement_date: string | null;
  parsed: number;
  matched: number;
  added: number;
  skipped: number;
  transfers: number;
  lines: StatementReconcileLine[];
  balance_updates: { account_name: string; currency: string; balance: number }[];
  needs_confirm: boolean;
  confirm_message: string | null;
  model: string | null;
};

export type StatementImportRecord = {
  id: number;
  bank_account_id: number | null;
  filename: string | null;
  period: string | null;
  statement_date: string | null;
  parsed_count: number;
  matched_count: number;
  added_count: number;
  skipped_count: number;
  created_at: string;
};

export type CategorySub = {
  id: number;
  kind: string;
  name: string;
  icon: string | null;
  parent_id: number | null;
  sort_order: number;
};

export type ApiCategoryGroup = {
  id: number;
  kind: string;
  name: string;
  icon: string | null;
  sort_order: number;
  subs: CategorySub[];
};

export type CategoryCreate = {
  kind?: string;
  name: string;
  icon?: string | null;
  parent_id?: number | null;
  sort_order?: number;
};

export type BankAccount = {
  id: number;
  name: string;
  bank: string;
  account_type: string;
  currency: string;
  balance: number;
  icon: string | null;
  color: string | null;
  last4: string | null;
  is_active: boolean;
  sort_order: number;
  note: string | null;
  parent_account_id: number | null;
  statement_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
  created_at: string;
  updated_at: string;
  // 證券戶口先有
  cash_balances: CashBalance[];
  holdings_by_currency: HoldingBreakdown[];
};

export type BankAccountCreate = {
  name: string;
  bank: string;
  account_type?: string;
  currency?: string;
  balance?: number;
  icon?: string | null;
  color?: string | null;
  last4?: string | null;
  is_active?: boolean;
  sort_order?: number;
  note?: string | null;
  parent_account_id?: number | null;
  statement_day?: number | null;
  due_day?: number | null;
  credit_limit?: number | null;
};

export type BankPreset = {
  name: string;
  bank: string;
  account_type: string;
  icon: string;
  color: string;
};

export type Transfer = {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  currency: string;
  note: string | null;
  transferred_at: string;
  from_account_name: string | null;
  from_account_icon: string | null;
  from_account_type: string | null;
  to_account_name: string | null;
  to_account_icon: string | null;
  to_account_type: string | null;
  created_at: string;
};

export type TransferCreate = {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  currency?: string;
  note?: string | null;
  transferred_at: string;
};

export type StockHolding = {
  id: number;
  account_id: number;
  symbol: string;
  name: string | null;
  quantity: number;
  avg_cost: number | null;
  currency: string;
  last_price: number | null;
  last_price_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockHoldingCreate = {
  account_id: number;
  symbol: string;
  name?: string | null;
  quantity?: number;
  avg_cost?: number | null;
  currency?: string;
};

export type StockRefreshResult = {
  refreshed: number;
  failed: string[];
  accounts_updated: number[];
};

export type BudgetWarning = {
  category: string;
  budget: number;
  spent: number;
  percentage: number;
};

export type ExpenseCreateResponse = Expense & {
  budget_warning: BudgetWarning | null;
};

export type MerchantSuggestion = {
  merchant: string;
  count: number;
  last_at: string | null;
  last_category: string | null;
  last_subcategory: string | null;
  last_payment_method: string | null;
  last_payment_account_id: number | null;
};

export type FinancialSummary = {
  summary: string;
  month: string;
  total: number;
  count: number;
  by_category: Record<string, number>;
};

export type BackupVersion = {
  filename: string;
  date: string;
  size_kb: number;
};

export type DecomposeResult = {
  subtasks: string[];
  created_ids: number[];
};

export type EmailActionResponse = {
  ok: boolean;
  created_type: string;
  created_id: number;
};

// ─── P3-14 Ledger ─────────────────────────────────────────
export type Ledger = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type LedgerCreate = {
  name: string;
  icon?: string | null;
  color?: string | null;
  is_default?: boolean;
  sort_order?: number;
  note?: string | null;
};

export type LedgerUpdate = Partial<LedgerCreate> & { is_active?: boolean };

// ─── P3-15 Loan ─────────────────────────────────────────
export type Loan = {
  id: number;
  direction: "lent" | "borrowed";
  counterparty: string;
  amount: number;
  currency: string;
  repaid_amount: number;
  started_at: string;
  due_at: string | null;
  settled_at: string | null;
  status: "active" | "settled" | "overdue";
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type LoanRepayment = {
  id: number;
  loan_id: number;
  amount: number;
  paid_at: string;
  note: string | null;
  created_at: string;
};

export type LoanDetail = Loan & { repayments: LoanRepayment[]; outstanding: number };

export type LoanCreate = {
  direction: "lent" | "borrowed";
  counterparty: string;
  amount: number;
  currency?: string;
  started_at: string;
  due_at?: string | null;
  description?: string | null;
};

export type LoanUpdate = Partial<LoanCreate> & {
  settled_at?: string | null;
  status?: "active" | "settled" | "overdue";
};

export type LoanSummary = {
  lent_outstanding: number;
  borrowed_outstanding: number;
  lent_count: number;
  borrowed_count: number;
};

// ─── P3-17 Family Member + Split ──────────────────────────
export type FamilyMember = {
  id: number;
  name: string;
  relation: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
};

export type FamilyMemberCreate = {
  name: string;
  relation?: string | null;
  color?: string | null;
};

export type ExpenseSplit = {
  id: number;
  expense_id: number;
  member_id: number | null;
  amount: number;
  is_paid: boolean;
  created_at: string;
};

export type ExpenseSplitInput = {
  member_id: number | null;
  amount: number;
  is_paid?: boolean;
};

// ─── Reports aggregation ──────────────────────────────────
export type ExpenseByMerchant = { merchant: string; total: number; count: number };
export type ExpenseByAccount = {
  payment_account_id: number | null;
  name: string;
  payment_method: string | null;
  total: number;
  count: number;
};

// JWT token storage（localStorage — MVP 夠用）
const TOKEN_KEY = "lifeos.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  // FormData 要由 browser 自己寫 `Content-Type: multipart/form-data; boundary=...`，
  // 所以唔可以 hardcode 做 JSON。
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const raw = await res.text();
    // 如果 server 返 HTML（例如 stale backend 將未知 API 路由 fallthrough 到 SPA 404.html）
    // 唔好將整段 HTML 塞入 error message — 會爆 modal / toast。
    const contentType = res.headers.get("content-type") || "";
    const looksLikeHtml =
      contentType.includes("text/html") ||
      /^<!doctype html|^<html|^<head|^<body/i.test(raw.trim().slice(0, 64));
    let detail: string;
    if (looksLikeHtml) {
      detail = `endpoint 回傳 HTML（可能 backend 未更新或路徑錯誤）`;
    } else {
      // 嘗試 parse JSON detail
      try {
        const j = JSON.parse(raw);
        detail = typeof j.detail === "string" ? j.detail : raw.slice(0, 200);
      } catch {
        detail = raw.slice(0, 200);
      }
    }
    // Token 過期 / 無效 —— 清除並 redirect login（只喺 browser）
    // Exception：vault 嘅 "step_up_required" 唔算登出，由 caller 處理（prompt re-login）
    const isStepUp = detail.includes("step_up_required");
    if (res.status === 401 && !isStepUp && typeof window !== "undefined") {
      setToken(null);
      const here = window.location.pathname;
      if (here !== "/login" && here !== "/") {
        window.location.href = "/login";
      }
    }
    throw new ApiError(res.status, `${res.status} ${detail}`);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawFetch(path, init);
  return res.json();
}

/** FormData 請求 — 唔設 Content-Type（browser 自動加 multipart boundary）。 */
async function formRequest<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const raw = await res.text();
    let detail: string;
    try {
      const j = JSON.parse(raw);
      detail = typeof j.detail === "string" ? j.detail : raw.slice(0, 200);
    } catch {
      detail = raw.slice(0, 200);
    }
    if (res.status === 401 && typeof window !== "undefined") {
      setToken(null);
      const here = window.location.pathname;
      if (here !== "/login" && here !== "/") {
        window.location.href = "/login";
      }
    }
    throw new ApiError(res.status, `${res.status} ${detail}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; env: string }>("/health"),

  // Emails
  listEmails: async (params?: {
    folder?: string;
    source?: string;
    category?: string;
    q?: string;
    unread_only?: boolean;
    archived?: boolean;
    trashed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<EmailListResponse> => {
    const qs = new URLSearchParams();
    if (params?.folder) qs.set("folder", params.folder);
    if (params?.source) qs.set("source", params.source);
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.archived) qs.set("archived", "true");
    if (params?.trashed) qs.set("trashed", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await rawFetch(`/emails${suffix}`);
    const items = (await res.json()) as Email[];
    const total = Number(res.headers.get("X-Total-Count") ?? items.length);
    return { items, total };
  },
  getEmail: (
    id: number,
    params?: { archived?: boolean; category?: string; folder?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.archived) qs.set("archived", "true");
    if (params?.category) qs.set("category", params.category);
    if (params?.folder) qs.set("folder", params.folder);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<EmailDetail>(`/emails/${id}${suffix}`);
  },
  listEmailAttachments: (emailId: number) =>
    request<EmailAttachment[]>(`/emails/${emailId}/attachments`),
  /** Fetch attachment bytes with JWT, return blob URL (object URL). Caller should revoke when done. */
  fetchEmailAttachmentBlobUrl: async (
    emailId: number,
    attachmentId: number,
    inline = false,
  ): Promise<string> => {
    const qs = inline ? "?inline=true" : "";
    const res = await rawFetch(`/emails/${emailId}/attachments/${attachmentId}/download${qs}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  markRead: (id: number, read = true) =>
    request<{ ok: boolean; is_read: boolean }>(
      `/emails/${id}/read?read=${read}`,
      { method: "PUT" },
    ),
  emailStats: () => request<EmailStats>("/emails/stats"),
  updateCategory: (id: number, category: string) =>
    request<{ ok: boolean; final_category: string }>(`/emails/${id}/category`, {
      method: "PUT",
      body: JSON.stringify({ category }),
    }),
  triggerSync: (params?: { limit?: number; classify?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.classify !== undefined) qs.set("classify", String(params.classify));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SyncResult>(`/emails/sync${suffix}`, { method: "POST" });
  },
  syncSent: (limit = 50) =>
    request<SyncResult>(`/emails/sync-sent?limit=${limit}`, { method: "POST" }),
  gmailBackfill: (after?: string) => {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    return request<{ status: string; message: string }>(
      `/emails/gmail/backfill${qs}`,
      { method: "POST" },
    );
  },
  gmailBackfillStatus: () =>
    request<{ status: string; message: string }>(
      "/emails/gmail/backfill/status",
    ),
  learningStats: () =>
    request<{
      total_classified: number;
      total_corrected: number;
      accuracy_pct: number;
      corrections: Record<string, number>;
    }>("/emails/learning-stats"),
  syncICloud: (limit?: number) => {
    const qs = new URLSearchParams();
    if (limit) qs.set("limit", String(limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ fetched: number; new: number; errors: string[] }>(
      `/emails/sync-icloud${suffix}`,
      { method: "POST" },
    );
  },
  aiTest: () =>
    request<{
      ok: boolean;
      provider: string;
      model: string | null;
      result: { category: string; confidence: number; reason: string } | null;
      error: string | null;
    }>("/emails/ai-test"),
  classifyAll: (limit = 50) =>
    request<{ total_unclassified: number; classified: number; errors: string[] }>(
      `/emails/classify-all?limit=${limit}`,
      { method: "POST" },
    ),
  replyEmail: (
    id: number,
    body: string,
    files?: File[],
    vaultFileIds?: number[],
    account?: string,
  ) => {
    const form = new FormData();
    form.append("body", body);
    if (files) files.forEach((f) => form.append("attachments", f));
    if (vaultFileIds && vaultFileIds.length)
      form.append("vault_file_ids", vaultFileIds.join(","));
    if (account) form.append("account", account);
    return formRequest<EmailSendResponse>(`/emails/${id}/reply`, form);
  },
  saveReplyDraft: (
    id: number,
    body: string,
    files?: File[],
    vaultFileIds?: number[],
  ) => {
    const form = new FormData();
    form.append("body", body);
    if (files) files.forEach((f) => form.append("attachments", f));
    if (vaultFileIds && vaultFileIds.length)
      form.append("vault_file_ids", vaultFileIds.join(","));
    return formRequest<EmailSendResponse>(`/emails/${id}/draft`, form);
  },
  composeEmail: (
    to: string,
    subject: string,
    body: string,
    files?: File[],
    vaultFileIds?: number[],
    account?: string,
  ) => {
    const form = new FormData();
    form.append("to", to);
    form.append("subject", subject);
    form.append("body", body);
    if (files) files.forEach((f) => form.append("attachments", f));
    if (vaultFileIds && vaultFileIds.length)
      form.append("vault_file_ids", vaultFileIds.join(","));
    if (account) form.append("account", account);
    return formRequest<EmailSendResponse>("/emails/compose", form);
  },
  listMailAccounts: () =>
    request<
      Array<{ id: string; label: string; email: string | null; connected: boolean }>
    >("/emails/accounts"),
  aiCompose: (instructions: string) =>
    request<AiComposeDraft>("/emails/ai-compose", {
      method: "POST",
      body: JSON.stringify({ instructions }),
    }),
  restoreEmail: (id: number) =>
    request<{ ok: boolean }>(`/emails/${id}/restore`, { method: "POST" }),
  permanentDeleteEmail: (id: number) =>
    request<{ ok: boolean }>(`/emails/${id}/permanent`, { method: "DELETE" }),
  translateEmail: (id: number) =>
    request<EmailTranslation>(`/emails/${id}/translate`, { method: "POST" }),
  summarizeEmail: (id: number) =>
    request<EmailSummary>(`/emails/${id}/summarize`, { method: "POST" }),
  suggestReply: (id: number, instructions?: string) =>
    request<AiReplyDraft>(`/emails/${id}/suggest-reply`, {
      method: "POST",
      body: JSON.stringify({ instructions: instructions || null }),
    }),
  createEmailAction: (id: number, payload: { action_type: string; title?: string; due_at?: string }) =>
    request<EmailActionResponse>(`/emails/${id}/create-action`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reclassifyEmail: (id: number) =>
    request<{ ok: boolean; classification: EmailClassification }>(`/emails/${id}/reclassify`, {
      method: "POST",
    }),

  // Todos
  listTodos: (params?: { done?: boolean; project_id?: number; sub_project_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.done !== undefined) qs.set("done", String(params.done));
    if (params?.project_id !== undefined)
      qs.set("project_id", String(params.project_id));
    if (params?.sub_project_id !== undefined)
      qs.set("sub_project_id", String(params.sub_project_id));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Todo[]>(`/todos${suffix}`);
  },
  createTodo: (payload: TodoCreate) =>
    request<Todo>("/todos", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTodo: (id: number, payload: TodoUpdate) =>
    request<Todo>(`/todos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTodo: async (id: number): Promise<void> => {
    await rawFetch(`/todos/${id}`, { method: "DELETE" });
  },
  decomposeTodo: (id: number) =>
    request<DecomposeResult>(`/todos/${id}/decompose`, { method: "POST" }),
  uploadTodoAttachment: async (
    todoId: number,
    file: File,
  ): Promise<TodoAttachment> => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/todos/${todoId}/attachments`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  todoAttachmentUrl: (todoId: number, attId: number): string =>
    `${BASE}/todos/${todoId}/attachments/${attId}`,
  fetchTodoAttachmentBlobUrl: async (
    todoId: number,
    attId: number,
  ): Promise<string> => {
    const res = await rawFetch(`/todos/${todoId}/attachments/${attId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  deleteTodoAttachment: async (
    todoId: number,
    attId: number,
  ): Promise<void> => {
    await rawFetch(`/todos/${todoId}/attachments/${attId}`, {
      method: "DELETE",
    });
  },

  // Projects
  listProjects: (params?: { status?: ProjectStatus }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Project[]>(`/projects${suffix}`);
  },
  getProject: (id: number) => request<Project>(`/projects/${id}`),
  createProject: (payload: ProjectCreate) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProject: (id: number, payload: ProjectUpdate) =>
    request<Project>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteProject: async (id: number): Promise<void> => {
    await rawFetch(`/projects/${id}`, { method: "DELETE" });
  },

  // Sub-projects
  listSubProjects: (projectId: number, params?: { status?: ProjectStatus }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SubProject[]>(
      `/projects/${projectId}/sub-projects${suffix}`,
    );
  },
  getSubProject: (id: number) =>
    request<SubProject>(`/sub-projects/${id}`),
  createSubProject: (projectId: number, payload: SubProjectCreate) =>
    request<SubProject>(`/projects/${projectId}/sub-projects`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSubProject: (id: number, payload: SubProjectUpdate) =>
    request<SubProject>(`/sub-projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteSubProject: async (id: number): Promise<void> => {
    await rawFetch(`/sub-projects/${id}`, { method: "DELETE" });
  },

  // Ideas
  listIdeas: (params?: {
    archived?: boolean;
    tag?: string;
    project_id?: number;
    q?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.archived !== undefined) qs.set("archived", String(params.archived));
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.project_id !== undefined)
      qs.set("project_id", String(params.project_id));
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Idea[]>(`/ideas${suffix}`);
  },
  createIdea: (payload: IdeaCreate) =>
    request<Idea>("/ideas", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateIdea: (id: number, payload: IdeaUpdate) =>
    request<Idea>(`/ideas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteIdea: async (id: number): Promise<void> => {
    await rawFetch(`/ideas/${id}`, { method: "DELETE" });
  },

  // Calendar
  listCalendarEvents: (params?: { days?: number; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set("days", String(params.days));
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<CalendarEvent[]>(`/calendar${suffix}`);
  },
  todayEvents: () => request<CalendarEvent[]>("/calendar/today"),
  syncCalendar: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set("days", String(params.days));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<CalendarSyncResult>(`/calendar/sync${suffix}`, {
      method: "POST",
    });
  },
  createCalendarEvent: (payload: CalendarEventCreate) =>
    request<CalendarEvent>("/calendar", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCalendarEvent: (id: number, payload: CalendarEventUpdate) =>
    request<CalendarEvent>(`/calendar/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCalendarEvent: async (id: number): Promise<void> => {
    await rawFetch(`/calendar/${id}`, { method: "DELETE" });
  },

  deleteEmail: async (id: number): Promise<void> => {
    await rawFetch(`/emails/${id}`, { method: "DELETE" });
  },
  archiveEmail: (id: number, archive = true) =>
    request<{ ok: boolean; is_archived: boolean }>(
      `/emails/${id}/archive?archive=${archive}`,
      { method: "PUT" },
    ),

  // Muted senders (封鎖寄件者)
  listMuted: () => request<MutedSender[]>("/muted"),
  addMuted: (payload: { email: string; name?: string; reason?: string }) =>
    request<MutedSender>("/muted", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteMuted: async (id: number): Promise<void> => {
    await rawFetch(`/muted/${id}`, { method: "DELETE" });
  },

  // VIP senders
  listVips: () => request<VipSender[]>("/vip"),
  addVip: (payload: VipCreate) =>
    request<VipSender>("/vip", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateVip: (id: number, payload: VipUpdate) =>
    request<VipSender>(`/vip/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteVip: async (id: number): Promise<void> => {
    await rawFetch(`/vip/${id}`, { method: "DELETE" });
  },

  // Notes (Knowledge)
  listNotes: (params?: {
    archived?: boolean;
    folder?: string;
    tag?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.archived !== undefined) qs.set("archived", String(params.archived));
    if (params?.folder !== undefined) qs.set("folder", params.folder);
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Note[]>(`/notes${suffix}`);
  },
  listNoteFolders: () => request<string[]>("/notes/folders"),
  getNote: (id: number) => request<Note>(`/notes/${id}`),
  createNote: (payload: NoteCreate) =>
    request<Note>("/notes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNote: (id: number, payload: NoteUpdate) =>
    request<Note>(`/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteNote: async (id: number): Promise<void> => {
    await rawFetch(`/notes/${id}`, { method: "DELETE" });
  },
  relatedNotes: (id: number) =>
    request<{ related: Note[] }>(`/notes/${id}/related`),
  uploadNoteAttachment: async (noteId: number, file: File): Promise<NoteAttachment> => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/notes/${noteId}/attachments`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  noteAttachmentUrl: (noteId: number, attId: number): string =>
    `${BASE}/notes/${noteId}/attachments/${attId}`,
  fetchNoteAttachmentBlobUrl: async (noteId: number, attId: number): Promise<string> => {
    const res = await rawFetch(`/notes/${noteId}/attachments/${attId}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  deleteNoteAttachment: async (noteId: number, attId: number): Promise<void> => {
    await rawFetch(`/notes/${noteId}/attachments/${attId}`, { method: "DELETE" });
  },

  // Notebooks (GoodNotes-style drawing + writing)
  listNotebooks: (params?: { archived?: boolean; tag?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.archived !== undefined) qs.set("archived", String(params.archived));
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Notebook[]>(`/notebooks${suffix}`);
  },
  getNotebook: (id: number) => request<Notebook>(`/notebooks/${id}`),
  createNotebook: (payload: NotebookCreate) =>
    request<Notebook>("/notebooks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNotebook: (id: number, payload: NotebookUpdate) =>
    request<Notebook>(`/notebooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteNotebook: async (id: number): Promise<void> => {
    await rawFetch(`/notebooks/${id}`, { method: "DELETE" });
  },
  uploadNotebookCover: async (id: number, file: File): Promise<Notebook> => {
    const form = new FormData();
    form.append("file", file);
    const res = await rawFetch(`/notebooks/${id}/cover`, {
      method: "POST",
      body: form,
    });
    return res.json();
  },
  deleteNotebookCover: async (id: number): Promise<Notebook> => {
    const res = await rawFetch(`/notebooks/${id}/cover`, { method: "DELETE" });
    return res.json();
  },
  /** Fetch notebook cover with JWT → blob URL. Caller should revoke when done. */
  fetchNotebookCoverBlobUrl: async (id: number): Promise<string> => {
    const res = await rawFetch(`/notebooks/${id}/cover`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  listNotebookPages: (notebookId: number) =>
    request<NotebookPageSummary[]>(`/notebooks/${notebookId}/pages`),
  getNotebookPage: (notebookId: number, pageId: number) =>
    request<NotebookPage>(`/notebooks/${notebookId}/pages/${pageId}`),
  createNotebookPage: (notebookId: number, payload: NotebookPageCreate) =>
    request<NotebookPage>(`/notebooks/${notebookId}/pages`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateNotebookPage: (
    notebookId: number,
    pageId: number,
    payload: NotebookPageUpdate,
  ) =>
    request<NotebookPage>(`/notebooks/${notebookId}/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteNotebookPage: async (notebookId: number, pageId: number): Promise<void> => {
    await rawFetch(`/notebooks/${notebookId}/pages/${pageId}`, { method: "DELETE" });
  },
  reorderNotebookPages: async (
    notebookId: number,
    pages: { id: number; page_number: number }[],
  ): Promise<void> => {
    await rawFetch(`/notebooks/${notebookId}/pages/reorder`, {
      method: "POST",
      body: JSON.stringify({ pages }),
    });
  },
  searchNotebookPages: (params?: { q?: string; tag?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.tag) qs.set("tag", params.tag);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<NotebookPageSearchHit[]>(`/notebooks/search${suffix}`);
  },
  ocrNotebookPage: (notebookId: number, pageId: number, imageDataUrl: string) =>
    request<NotebookOcrResponse>(`/notebooks/${notebookId}/pages/${pageId}/ocr`, {
      method: "POST",
      body: JSON.stringify({ image: imageDataUrl }),
    }),

  // Expenses
  listExpenses: (params?: {
    category?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Expense[]>(`/expenses${suffix}`);
  },
  expenseMonthly: (months?: number) => {
    const qs = new URLSearchParams();
    if (months) qs.set("months", String(months));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ year: number; month: number; total: number; count: number }[]>(
      `/expenses/monthly${suffix}`
    );
  },
  monthlySummary: (months?: number) => {
    const qs = new URLSearchParams();
    if (months) qs.set("months", String(months));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<MonthlySummary[]>(`/expenses/monthly-summary${suffix}`);
  },
  dailyTrend: (params?: { date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<DailyTrend[]>(`/expenses/daily-trend${suffix}`);
  },
  suggestMerchants: (q: string, limit = 8) => {
    const qs = new URLSearchParams();
    qs.set("q", q);
    qs.set("limit", String(limit));
    return request<MerchantSuggestion[]>(`/expenses/merchants/suggest?${qs}`);
  },
  expenseStats: (params?: { txn_type?: string; date_from?: string; date_to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.txn_type) qs.set("txn_type", params.txn_type);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<ExpenseStats>(`/expenses/stats${suffix}`);
  },
  createExpense: (payload: ExpenseCreate) =>
    request<ExpenseCreateResponse>("/expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateExpense: (id: number, payload: ExpenseUpdate) =>
    request<Expense>(`/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteExpense: async (id: number): Promise<void> => {
    await rawFetch(`/expenses/${id}`, { method: "DELETE" });
  },
  financialSummary: (params?: { year?: number; month?: number }) => {
    const qs = new URLSearchParams();
    if (params?.year) qs.set("year", String(params.year));
    if (params?.month) qs.set("month", String(params.month));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<FinancialSummary>(`/expenses/financial-summary${suffix}`);
  },
  importOctopus: async (file: File): Promise<{ imported: number; skipped: number; errors: string[] }> => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/expenses/import-octopus`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  importExpenseCsv: async (file: File): Promise<{ imported: number; skipped: number; errors: string[] }> => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/expenses/import-csv`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },

  // Subscriptions
  listSubscriptions: (activeOnly = true) => {
    const qs = new URLSearchParams();
    if (!activeOnly) qs.set("active_only", "false");
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Subscription[]>(`/subscriptions${suffix}`);
  },
  createSubscription: (payload: SubscriptionCreate) =>
    request<Subscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSubscription: (id: number, payload: Partial<SubscriptionCreate> & { active?: boolean }) =>
    request<Subscription>(`/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteSubscription: async (id: number): Promise<void> => {
    await rawFetch(`/subscriptions/${id}`, { method: "DELETE" });
  },

  // Budgets
  listBudgets: () => request<Budget[]>("/budgets"),
  createBudget: (payload: BudgetCreate) =>
    request<Budget>("/budgets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBudget: (id: number, payload: Partial<BudgetCreate>) =>
    request<Budget>(`/budgets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBudget: async (id: number): Promise<void> => {
    await rawFetch(`/budgets/${id}`, { method: "DELETE" });
  },

  // Bank Accounts
  listBankAccounts: (activeOnly = true) => {
    const qs = new URLSearchParams();
    if (!activeOnly) qs.set("active_only", "false");
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<BankAccount[]>(`/bank-accounts${suffix}`);
  },
  bankPresets: () => request<BankPreset[]>("/bank-accounts/presets"),
  createBankAccount: (payload: BankAccountCreate) =>
    request<BankAccount>("/bank-accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBankAccount: (id: number, payload: Partial<BankAccountCreate>) =>
    request<BankAccount>(`/bank-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBankAccount: async (id: number): Promise<void> => {
    await rawFetch(`/bank-accounts/${id}`, { method: "DELETE" });
  },

  // 自訂分類（主／副）
  listCustomCategories: (kind?: "expense" | "income") =>
    request<ApiCategoryGroup[]>(`/categories${kind ? `?kind=${kind}` : ""}`),
  createCustomCategory: (payload: CategoryCreate) =>
    request<ApiCategoryGroup>("/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCustomCategory: (id: number, payload: Partial<CategoryCreate>) =>
    request<ApiCategoryGroup>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCustomCategory: async (id: number): Promise<void> => {
    await rawFetch(`/categories/${id}`, { method: "DELETE" });
  },

  // 月結單核對
  importStatement: (file: File, accountId: number, dryRun = false, force = false) => {
    const form = new FormData();
    form.append("file", file);
    const qs = new URLSearchParams({ account_id: String(accountId) });
    if (dryRun) qs.set("dry_run", "true");
    if (force) qs.set("force", "true");
    return formRequest<StatementReconcileResult>(
      `/statements/import?${qs}`,
      form,
    );
  },
  listStatementImports: () =>
    request<StatementImportRecord[]>("/statements/imports"),
  undoStatementImport: async (id: number): Promise<void> => {
    await rawFetch(`/statements/imports/${id}`, { method: "DELETE" });
  },

  // Brokerage cash balances
  listCashBalances: (accountId: number) =>
    request<CashBalance[]>(`/bank-accounts/${accountId}/cash`),
  upsertCashBalance: (accountId: number, currency: string, amount: number) =>
    request<CashBalance>(`/bank-accounts/${accountId}/cash`, {
      method: "PUT",
      body: JSON.stringify({ currency, amount }),
    }),
  deleteCashBalance: async (accountId: number, currency: string): Promise<void> => {
    await rawFetch(`/bank-accounts/${accountId}/cash/${currency}`, {
      method: "DELETE",
    });
  },

  // Transfers
  listTransfers: (params?: {
    account_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.account_id !== undefined) qs.set("account_id", String(params.account_id));
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Transfer[]>(`/transfers${suffix}`);
  },
  createTransfer: (payload: TransferCreate) =>
    request<Transfer>("/transfers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteTransfer: async (id: number): Promise<void> => {
    await rawFetch(`/transfers/${id}`, { method: "DELETE" });
  },

  // Stock holdings (brokerage accounts)
  listStockHoldings: (accountId?: number) => {
    const qs = new URLSearchParams();
    if (accountId !== undefined) qs.set("account_id", String(accountId));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<StockHolding[]>(`/stocks${suffix}`);
  },
  createStockHolding: (payload: StockHoldingCreate) =>
    request<StockHolding>("/stocks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStockHolding: (id: number, payload: Partial<StockHoldingCreate>) =>
    request<StockHolding>(`/stocks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteStockHolding: async (id: number): Promise<void> => {
    await rawFetch(`/stocks/${id}`, { method: "DELETE" });
  },
  refreshStockQuotes: () =>
    request<StockRefreshResult>("/stocks/refresh", { method: "POST" }),

  // AI assistant
  chat: (message: string) =>
    request<{
      action: string;
      reply: string;
      created_id: number | null;
      created_type: string | null;
    }>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // Export + Backup
  exportAll: () => rawFetch("/export").then((res) => res.json()),

  // Web Push
  getVapidPublicKey: () =>
    request<{ public_key: string | null; configured: boolean }>(
      "/push/vapid-public-key"
    ),
  subscribePush: (payload: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    user_agent?: string;
    label?: string;
  }) =>
    request<PushSubscriptionOut>("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  unsubscribePush: (payload: { endpoint: string }) =>
    rawFetch("/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listPushSubscriptions: (current_endpoint?: string) => {
    const qs = current_endpoint
      ? `?current_endpoint=${encodeURIComponent(current_endpoint)}`
      : "";
    return request<PushSubscriptionOut[]>(`/push/subscriptions${qs}`);
  },
  updatePushSubscription: (
    id: number,
    payload: { label?: string; enabled?: boolean }
  ) =>
    request<PushSubscriptionOut>(`/push/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deletePushSubscription: async (id: number): Promise<void> => {
    await rawFetch(`/push/subscriptions/${id}`, { method: "DELETE" });
  },
  testPush: () => request<{ sent: number }>("/push/test", { method: "POST" }),
  createSnapshot: () => request<{ ok: boolean; filename: string; size_kb: number }>("/export/snapshot", { method: "POST" }),
  listBackupVersions: () => request<BackupVersion[]>("/export/versions"),
  triggerSystemBackup: () =>
    request<{ name: string; size_bytes: number; created_at: string }>(
      "/export/system-backup",
      { method: "POST" }
    ),
  listSystemBackups: () =>
    request<Array<{ name: string; size_bytes: number; created_at: string }>>(
      "/export/system-backups"
    ),
  downloadSystemBackupUrl: (name: string) =>
    `${BASE}/export/system-backups/${encodeURIComponent(name)}/download`,

  // Audit log
  listAuditLogs: (params?: {
    action?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.action) qs.set("action", params.action);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<AuditLogEntry[]>(`/audit${suffix}`);
  },

  // Daily Report
  dailyReport: (params?: { report_date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.report_date) qs.set("report_date", params.report_date);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<DailyReport>(`/report${suffix}`);
  },
  dailyReportAiSummary: (params?: { report_date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.report_date) qs.set("report_date", params.report_date);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ summary: string }>(`/report/ai-summary${suffix}`);
  },

  // Voice
  smartTranscribe: async (audioBlob: Blob): Promise<{
    text: string;
    type: string;
    title: string;
    content: string;
    priority: string;
    created_id: number | null;
    created_type: string | null;
  }> => {
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/voice/smart-transcribe`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },
  transcribe: async (audioBlob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/voice/transcribe`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new ApiError(res.status, detail);
    }
    const data = await res.json();
    return data.text;
  },

  // Smart Labels
  listSmartLabels: () => request<SmartLabel[]>("/smart-labels"),
  createSmartLabel: (data: SmartLabelCreate) =>
    request<SmartLabel>("/smart-labels", { method: "POST", body: JSON.stringify(data) }),
  updateSmartLabel: (id: number, data: Partial<SmartLabelCreate>) =>
    request<SmartLabel>(`/smart-labels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSmartLabel: (id: number) =>
    request<void>(`/smart-labels/${id}`, { method: "DELETE" }),
  emailsByLabel: (labelId: number, params?: { q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Email[]>(`/smart-labels/emails/${labelId}${suffix}`);
  },
  matchAllLabels: () =>
    request<{ matched: number }>("/smart-labels/match-all", { method: "POST" }),

  // Gmail auth
  gmailStatus: () => request<GmailStatus>("/auth/gmail/status"),
  gmailAuthorize: () =>
    request<{ authorization_url: string; state: string }>("/auth/gmail/authorize"),

  // E2E encryption master password
  encryptionInfo: () => request<EncryptionInfo>("/auth/encryption/info"),
  encryptionSetup: (payload: EncryptionSetupPayload) =>
    request<{ ok: boolean }>("/auth/encryption/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Passkey
  passkeyRegisterStart: () =>
    request<{ challenge_token: string; options: PublicKeyCredentialCreationOptionsJSON }>(
      "/auth/passkey/register/start",
      { method: "POST" }
    ),
  passkeyRegisterFinish: (
    challenge_token: string,
    credential: unknown,
    device_name?: string
  ) =>
    request<{ ok: boolean; token: string; user: { email: string; name: string } }>(
      "/auth/passkey/register/finish",
      {
        method: "POST",
        body: JSON.stringify({ challenge_token, credential, device_name }),
      }
    ),
  passkeyLoginStart: () =>
    request<{ challenge_token: string; options: PublicKeyCredentialRequestOptionsJSON }>(
      "/auth/passkey/login/start",
      { method: "POST" }
    ),
  passkeyLoginFinish: (challenge_token: string, credential: unknown) =>
    request<{ ok: boolean; token: string; user: { email: string; name: string } }>(
      "/auth/passkey/login/finish",
      { method: "POST", body: JSON.stringify({ challenge_token, credential }) }
    ),
  passkeyListDevices: () =>
    request<{
      devices: {
        id: number;
        device_name: string | null;
        created_at: string | null;
        last_used_at: string | null;
      }[];
    }>("/auth/passkey/devices"),
  passkeyDeleteDevice: (id: number) =>
    request<{ ok: boolean }>(`/auth/passkey/devices/${id}`, { method: "DELETE" }),

  // ─── Relations ──────────────────────────────────────────────────────
  listRelations: (type: RelationEntityType, id: number) =>
    request<RelatedLink[]>(`/relations?type=${type}&id=${id}`),
  createRelation: (payload: RelationCreatePayload) =>
    request<RelationOut>("/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteRelation: (relationId: number) =>
    request<void>(`/relations/${relationId}`, { method: "DELETE" }),
  searchEntities: (
    q: string,
    types: RelationEntityType[] = [
      "todo",
      "note",
      "idea",
      "project",
      "email",
      "event",
      "expense",
    ],
    limit = 10,
  ) => {
    const params = new URLSearchParams({
      q,
      types: types.join(","),
      limit: String(limit),
    });
    return request<RelatedEntity[]>(`/relations/search?${params.toString()}`);
  },

  // ─── Today view ─────────────────────────────────────────────────────
  today: (focusDate?: string) => {
    const q = focusDate ? `?focus_date=${focusDate}` : "";
    return request<TodayResponse>(`/today${q}`);
  },
  addFocus: (todoId: number, focusDate?: string) =>
    request<DailyFocus>("/today/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        todo_id: todoId,
        focus_date: focusDate ?? null,
      }),
    }),
  removeFocus: (focusId: number) =>
    request<void>(`/today/focus/${focusId}`, { method: "DELETE" }),
  reorderFocus: (focusIds: number[], focusDate?: string) =>
    request<DailyFocus[]>("/today/focus/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_ids: focusIds,
        focus_date: focusDate ?? null,
      }),
    }),

  // ─── P3-14 Ledgers ──────────────────────────────────────────────────
  listLedgers: (activeOnly = false) => {
    const q = activeOnly ? "?active_only=true" : "";
    return request<Ledger[]>(`/ledgers${q}`);
  },
  createLedger: (payload: LedgerCreate) =>
    request<Ledger>("/ledgers", { method: "POST", body: JSON.stringify(payload) }),
  updateLedger: (id: number, payload: LedgerUpdate) =>
    request<Ledger>(`/ledgers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteLedger: async (id: number): Promise<void> => {
    await rawFetch(`/ledgers/${id}`, { method: "DELETE" });
  },

  // ─── P3-15 Loans ────────────────────────────────────────────────────
  listLoans: (params?: { direction?: "lent" | "borrowed"; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.direction) qs.set("direction", params.direction);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Loan[]>(`/loans${suffix}`);
  },
  getLoan: (id: number) => request<LoanDetail>(`/loans/${id}`),
  loanSummary: () => request<LoanSummary>("/loans/summary"),
  createLoan: (payload: LoanCreate) =>
    request<Loan>("/loans", { method: "POST", body: JSON.stringify(payload) }),
  updateLoan: (id: number, payload: LoanUpdate) =>
    request<Loan>(`/loans/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteLoan: async (id: number): Promise<void> => {
    await rawFetch(`/loans/${id}`, { method: "DELETE" });
  },
  addLoanRepayment: (loanId: number, payload: { amount: number; paid_at: string; note?: string | null }) =>
    request<LoanRepayment>(`/loans/${loanId}/repayments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteLoanRepayment: async (loanId: number, repaymentId: number): Promise<void> => {
    await rawFetch(`/loans/${loanId}/repayments/${repaymentId}`, { method: "DELETE" });
  },

  // ─── P3-17 Family members + splits ──────────────────────────────────
  listFamilyMembers: (activeOnly = true) => {
    const q = activeOnly ? "?active_only=true" : "?active_only=false";
    return request<FamilyMember[]>(`/family-members${q}`);
  },
  createFamilyMember: (payload: FamilyMemberCreate) =>
    request<FamilyMember>("/family-members", { method: "POST", body: JSON.stringify(payload) }),
  updateFamilyMember: (id: number, payload: Partial<FamilyMemberCreate> & { is_active?: boolean }) =>
    request<FamilyMember>(`/family-members/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteFamilyMember: async (id: number): Promise<void> => {
    await rawFetch(`/family-members/${id}`, { method: "DELETE" });
  },
  memberOwed: (id: number) =>
    request<{ member_id: number; name: string; outstanding: number; total: number }>(
      `/family-members/${id}/owed`
    ),
  listExpenseSplits: (expenseId: number) =>
    request<ExpenseSplit[]>(`/family-members/splits/by-expense/${expenseId}`),
  setExpenseSplits: (expenseId: number, splits: ExpenseSplitInput[]) =>
    request<ExpenseSplit[]>(`/family-members/splits/by-expense/${expenseId}`, {
      method: "POST",
      body: JSON.stringify(splits),
    }),
  markSplitPaid: (splitId: number, isPaid: boolean) =>
    request<ExpenseSplit>(
      `/family-members/splits/${splitId}/mark-paid?is_paid=${isPaid ? "true" : "false"}`,
      { method: "PATCH" }
    ),

  // ─── Expense reports extras (P2-10) ─────────────────────────────────
  expensesByMerchant: (params?: { date_from?: string; date_to?: string; txn_type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.txn_type) qs.set("txn_type", params.txn_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<ExpenseByMerchant[]>(`/expenses/by-merchant${suffix}`);
  },
  expensesByAccount: (params?: { date_from?: string; date_to?: string; txn_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.txn_type) qs.set("txn_type", params.txn_type);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<ExpenseByAccount[]>(`/expenses/by-account${suffix}`);
  },
  triggerRecurring: () =>
    request<{ processed: number; generated: number; errors: string[] }>(`/recurring/generate`, {
      method: "POST",
    }),

  // ─── Vault (個人資料庫) ──────────────────────────────────────────────
  listVaultCategories: () => request<VaultCategory[]>(`/vault/categories`),
  createVaultCategory: (payload: { name: string; icon?: string; sort_order?: number }) =>
    request<VaultCategory>(`/vault/categories`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateVaultCategory: (
    id: number,
    payload: { name?: string; icon?: string; sort_order?: number }
  ) =>
    request<VaultCategory>(`/vault/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteVaultCategory: async (id: number): Promise<void> => {
    await rawFetch(`/vault/categories/${id}`, { method: "DELETE" });
  },

  listVaultTags: () => request<VaultTag[]>(`/vault/tags`),
  createVaultTag: (payload: { name: string; color?: string }) =>
    request<VaultTag>(`/vault/tags`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteVaultTag: async (id: number): Promise<void> => {
    await rawFetch(`/vault/tags/${id}`, { method: "DELETE" });
  },

  vaultSummary: () => request<VaultSummaryData>(`/vault/summary`),

  listVaultFiles: (params?: {
    q?: string;
    category_id?: number | null;
    tag_id?: number | null;
    include_deleted?: boolean;
    expiring_within_days?: number;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category_id != null) qs.set("category_id", String(params.category_id));
    if (params?.tag_id != null) qs.set("tag_id", String(params.tag_id));
    if (params?.include_deleted) qs.set("include_deleted", "true");
    if (params?.expiring_within_days != null)
      qs.set("expiring_within_days", String(params.expiring_within_days));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<VaultFile[]>(`/vault/files${suffix}`);
  },

  getVaultFile: (id: number) => request<VaultFile>(`/vault/files/${id}`),

  uploadVaultFile: async (
    file: File,
    payload: {
      category_id?: number | null;
      title?: string;
      filename?: string;
      notes?: string;
      expiry_date?: string;
      reminder_days_before?: number;
    }
  ): Promise<VaultFile> => {
    const form = new FormData();
    form.append("file", file);
    if (payload.title) form.append("title", payload.title);
    if (payload.filename) form.append("filename", payload.filename);
    if (payload.notes) form.append("notes", payload.notes);
    if (payload.expiry_date) form.append("expiry_date", payload.expiry_date);
    if (payload.reminder_days_before != null)
      form.append("reminder_days_before", String(payload.reminder_days_before));
    if (payload.category_id != null)
      form.append("category_id", String(payload.category_id));

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/vault/files`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const raw = await res.text();
      let detail = raw.slice(0, 200);
      try {
        const j = JSON.parse(raw);
        if (typeof j.detail === "string") detail = j.detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, `${res.status} ${detail}`);
    }
    return res.json();
  },

  createVaultTextEntry: (payload: {
    title: string;
    content: string;
    category_id?: number | null;
    notes?: string;
    expiry_date?: string;
    reminder_days_before?: number;
    tag_ids?: number[];
  }) =>
    request<VaultFile>(`/vault/files/text`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateVaultFile: (
    id: number,
    payload: {
      title?: string;
      filename?: string;
      category_id?: number | null;
      notes?: string;
      expiry_date?: string | null;
      reminder_days_before?: number | null;
      tag_ids?: number[];
      clear_expiry?: boolean;
      clear_reminder?: boolean;
      clear_title?: boolean;
    }
  ) =>
    request<VaultFile>(`/vault/files/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  softDeleteVaultFile: async (id: number): Promise<void> => {
    await rawFetch(`/vault/files/${id}`, { method: "DELETE" });
  },

  restoreVaultFile: (id: number) =>
    request<VaultFile>(`/vault/files/${id}/restore`, { method: "POST" }),

  permanentDeleteVaultFile: async (id: number): Promise<void> => {
    await rawFetch(`/vault/files/${id}/permanent`, { method: "DELETE" });
  },

  vaultFilePreviewUrl: (id: number): string => {
    const token = getToken() || "";
    return `${BASE}/vault/files/${id}/preview?token=${encodeURIComponent(token)}`;
  },

  downloadVaultFile: async (id: number): Promise<Blob> => {
    const res = await rawFetch(`/vault/files/${id}/download`);
    return res.blob();
  },

  // ─── Vault external shares ───────────────────────────────────────────────
  listVaultShares: (fileId: number) =>
    request<VaultShare[]>(`/vault/files/${fileId}/shares`),

  createVaultShare: (
    fileId: number,
    payload: {
      label?: string;
      expires_in_hours?: number | null;
      max_downloads?: number | null;
      allow_download?: boolean;
    }
  ) =>
    request<VaultShare>(`/vault/files/${fileId}/shares`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revokeVaultShare: async (shareId: number): Promise<void> => {
    await rawFetch(`/vault/shares/${shareId}`, { method: "DELETE" });
  },

  // ─── Forex reconciliation ────────────────────────────────────────────────
  listForexGroups: () => request<ForexGroup[]>("/forex/groups"),
  listForexWallets: (groupId: number) =>
    request<ForexWallet[]>(`/forex/groups/${groupId}/wallets`),
  listForexBrokers: (groupId: number) =>
    request<ForexBroker[]>(`/forex/groups/${groupId}/brokers`),
  createForexBroker: (
    groupId: number,
    payload: { name: string; owner?: string | null; email?: string | null; account_number?: string | null; notes?: string | null; is_active?: boolean },
  ) =>
    request<ForexBroker>(`/forex/groups/${groupId}/brokers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateForexBroker: (
    groupId: number,
    brokerId: number,
    payload: Partial<{ name: string; owner: string | null; email: string | null; account_number: string | null; notes: string | null; is_active: boolean }>,
  ) =>
    request<ForexBroker>(`/forex/groups/${groupId}/brokers/${brokerId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteForexBroker: async (groupId: number, brokerId: number) => {
    await rawFetch(`/forex/groups/${groupId}/brokers/${brokerId}`, { method: "DELETE" });
  },
  createForexWallet: (
    groupId: number,
    payload: { address: string; label: string; is_active?: boolean },
  ) =>
    request<ForexWallet>(`/forex/groups/${groupId}/wallets`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateForexWallet: (
    groupId: number,
    walletId: number,
    payload: Partial<{ label: string; is_active: boolean }>,
  ) =>
    request<ForexWallet>(`/forex/groups/${groupId}/wallets/${walletId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteForexWallet: async (groupId: number, walletId: number) => {
    await rawFetch(`/forex/groups/${groupId}/wallets/${walletId}`, { method: "DELETE" });
  },
  listForexTransactions: (params?: {
    group_id?: number;
    wallet_id?: number;
    status?: "pending_tag" | "tagged" | "ignored" | "internal_transfer";
    direction?: "in" | "out";
    date_from?: string;
    date_to?: string;
    include_internal?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.group_id) qs.set("group_id", String(params.group_id));
    if (params?.wallet_id) qs.set("wallet_id", String(params.wallet_id));
    if (params?.status) qs.set("status", params.status);
    if (params?.direction) qs.set("direction", params.direction);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    if (params?.include_internal) qs.set("include_internal", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<ForexTransaction[]>(`/forex/transactions${suffix}`);
  },
  tagForexTransaction: (
    txId: number,
    brokerId: number,
    opts?: { learnAddress?: boolean; fee_usdt?: number | null; notes?: string | null },
  ) =>
    request<ForexTransaction>(`/forex/transactions/${txId}/tag`, {
      method: "POST",
      body: JSON.stringify({
        broker_account_id: brokerId,
        learn_address: opts?.learnAddress ?? true,
        ...(opts && "fee_usdt" in opts ? { fee_usdt: opts.fee_usdt } : {}),
        ...(opts && "notes" in opts ? { notes: opts.notes } : {}),
      }),
    }),
  updateForexTransaction: (
    txId: number,
    payload: { fee_usdt?: number | null; notes?: string | null },
  ) =>
    request<ForexTransaction>(`/forex/transactions/${txId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  forexDashboard: () => request<ForexDashboard>("/forex/dashboard"),
  reconcileForex: (groupId: number, month: string) =>
    request<ForexReconciliationResult>(`/forex/groups/${groupId}/reconcile/${month}`, {
      method: "POST",
    }),
  reconcileAllForex: (month: string) =>
    request<{ id: number; group_code: string; month: string; total_accounts: number; matched_count: number; flagged_count: number }[]>(
      `/forex/reconcile/${month}`,
      { method: "POST" },
    ),
  getForexReconciliation: (groupId: number, month: string) =>
    request<ForexReconciliationResult>(`/forex/groups/${groupId}/reconciliation/${month}`),
  importForexMonthlyReport: async (groupId: number, file: File, month?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    const token = getToken();
    const res = await fetch(`${BASE}/forex/groups/${groupId}/import-monthly-report${qs}`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as ForexImportResult;
  },
  getForexMonthly: (groupId: number, month: string) =>
    request<ForexMonthlyView>(`/forex/groups/${groupId}/monthly/${month}`),
  upsertForexMonthly: (
    groupId: number,
    month: string,
    brokerId: number,
    payload: {
      opening_balance: number;
      closing_balance: number;
      notes?: string | null;
    },
  ) =>
    request<ForexMonthlyView>(
      `/forex/groups/${groupId}/monthly/${month}/brokers/${brokerId}`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  listForexTransfers: (groupId: number, brokerId: number, month: string) =>
    request<ForexTransfer[]>(
      `/forex/groups/${groupId}/brokers/${brokerId}/transfers?month=${month}`,
    ),
  createForexTransfer: (
    groupId: number,
    payload: {
      broker_account_id: number;
      flow: "withdrawal" | "deposit";
      method: string;
      amount_usdt: number;
      transfer_date: string;
      notes?: string | null;
    },
  ) =>
    request<{ id: number }>(`/forex/groups/${groupId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteForexTransfer: async (groupId: number, transferId: number) => {
    await rawFetch(`/forex/groups/${groupId}/transfers/${transferId}`, { method: "DELETE" });
  },
  listForexSettlements: (groupId: number) =>
    request<ForexSettlement[]>(`/forex/groups/${groupId}/settlements`),
  getForexSettlementPreview: (
    groupId: number,
    quarter: string,
    opts?: { total_fees?: number; paid_amount?: number },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.total_fees != null) qs.set("total_fees", String(opts.total_fees));
    if (opts?.paid_amount != null) qs.set("paid_amount", String(opts.paid_amount));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<ForexSettlementPreview>(
      `/forex/groups/${groupId}/settlement/${quarter}/preview${suffix}`,
    );
  },
  saveForexSettlement: (
    groupId: number,
    quarter: string,
    payload: {
      total_fees?: number | null;
      paid_amount: number;
      paid_tx_hash?: string | null;
      paid_at?: string | null;
      notes?: string | null;
      status?: "draft" | "settled";
    },
  ) =>
    request<ForexSettlement>(`/forex/groups/${groupId}/settlement/${quarter}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

// ─── Forex types ──────────────────────────────────────────────────────────
export type ForexGroup = {
  id: number;
  name: string;
  code: string;
  owner_name: string | null;
  partner_name: string | null;
  partner_split_pct: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type ForexMonthlyRow = {
  broker_id: number;
  broker_name: string;
  owner: string | null;
  account_number: string | null;
  opening: number;
  closing: number;
  deposit: number;
  withdrawal: number;
  pnl: number;
  has_data: boolean;
  notes: string | null;
};

export type ForexMonthlyView = {
  group_id: number;
  month: string;
  rows: ForexMonthlyRow[];
  totals: {
    opening: number;
    closing: number;
    deposit: number;
    withdrawal: number;
    pnl: number;
  };
};

export type ForexTransfer = {
  id: number;
  source: "manual" | "wallet";
  flow: "withdrawal" | "deposit";
  method: string;
  amount: number;
  date: string;
  notes: string | null;
};

export type ForexSettlementPreview = {
  group_id: number;
  quarter: string;
  months: string[];
  partner_name: string | null;
  partner_split_pct: number;
  gross_pnl: number;
  total_fees: number;
  fees_auto: boolean;
  net_pnl: number;
  carry_in: number;
  distributable: number;
  partner_share: number;
  paid_amount: number;
  carry_out: number;
};

export type ForexSettlement = {
  id: number;
  group_id: number;
  quarter: string;
  gross_pnl: number;
  total_fees: number;
  net_pnl: number;
  carry_in: number;
  distributable: number;
  partner_split_pct: number;
  partner_share: number;
  paid_amount: number;
  paid_tx_hash: string | null;
  paid_at: string | null;
  carry_out: number;
  status: "draft" | "settled";
  notes: string | null;
  updated_at: string;
};

export type ForexWallet = {
  id: number;
  group_id: number;
  address: string;
  label: string;
  is_active: boolean;
  created_at: string;
};

export type ForexBroker = {
  id: number;
  group_id: number;
  name: string;
  owner: string | null;
  email: string | null;
  account_number: string | null;
  notes: string | null;
  is_active: boolean;
};

export type ForexTransaction = {
  id: number;
  group_id: number;
  wallet_id: number;
  tx_hash: string;
  block_timestamp: string;
  direction: "in" | "out";
  amount_usdt: number;
  fee_usdt: number | null;
  notes: string | null;
  counterparty_address: string;
  broker_account_id: number | null;
  status: "pending_tag" | "tagged" | "ignored" | "internal_transfer";
  created_at: string;
};

export type ForexDashboardGroup = {
  id: number;
  code: string;
  name: string;
  brokers: number;
  pending_tag: number;
  tagged: number;
  internal_transfer: number;
  latest_reconciliation: {
    month: string;
    run_at: string;
    total: number;
    matched: number;
    flagged: number;
  } | null;
};

export type ForexDashboard = {
  groups: ForexDashboardGroup[];
};

export type ForexReconciliationRow = {
  broker_id: number;
  broker_name: string;
  owner: string | null;
  opening: number;
  closing: number;
  reported_pnl: number;
  tracked_in: number;
  tracked_out: number;
  expected_pnl: number;
  variance: number;
  status: "matched" | "flagged";
};

export type ForexReconciliationSummary = {
  tolerance_usdt: number;
  rows: ForexReconciliationRow[];
  totals: {
    opening: number;
    closing: number;
    reported_pnl: number;
    expected_pnl: number;
    variance: number;
    tracked_in: number;
    tracked_out: number;
  };
};

export type ForexReconciliationResult = {
  id: number;
  group_code: string;
  month: string;
  run_at?: string;
  total_accounts: number;
  matched_count: number;
  flagged_count: number;
  summary: ForexReconciliationSummary;
};

export type ForexImportResult = {
  month: string;
  brokers_created: number;
  monthly_inserted: number;
  monthly_updated: number;
  intents_inserted: number;
  warnings: string[];
};

// ─── Vault types ────────────────────────────────────────────────────────────
export type VaultCategory = {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
  file_count: number;
};

export type VaultTag = {
  id: number;
  name: string;
  color: string;
  file_count: number;
};

export type VaultFile = {
  id: number;
  title: string | null;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  notes: string;
  expiry_date: string | null;
  reminder_days_before: number | null;
  days_until_expiry: number | null;
  tag_ids: number[];
  tag_names: string[];
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VaultShare = {
  id: number;
  file_id: number;
  token: string;
  label: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  allow_download: boolean;
  created_at: string;
  revoked_at: string | null;
  url: string;
};

export type VaultSummaryData = {
  total_files: number;
  total_size_bytes: number;
  categories: VaultCategory[];
  expiring_soon: number;
  trashed: number;
};


// ─── Relations — polymorphic cross-module links ─────────────────────────
export type RelationEntityType =
  | "email"
  | "todo"
  | "note"
  | "idea"
  | "project"
  | "event"
  | "expense";

export type RelatedEntity = {
  type: RelationEntityType;
  id: number;
  title: string;
  subtitle: string | null;
  href: string;
};

export type RelatedLink = {
  relation_id: number;
  kind: string;
  note: string | null;
  entity: RelatedEntity;
  created_at: string;
};

export type RelationCreatePayload = {
  source_type: RelationEntityType;
  source_id: number;
  target_type: RelationEntityType;
  target_id: number;
  kind?: string;
  note?: string | null;
};

export type RelationOut = {
  id: number;
  source_type: RelationEntityType;
  source_id: number;
  target_type: RelationEntityType;
  target_id: number;
  kind: string;
  note: string | null;
  created_at: string;
};

// Add relation helpers onto the api object via a second block below.

// Smart Labels
export type SmartLabel = {
  id: number;
  name: string;
  color: string;
  match_patterns: string;
  email_count: number;
};

export type SmartLabelCreate = {
  name: string;
  color?: string;
  match_patterns: string;
};

// Minimal types for WebAuthn options — browser 會直接用原始 JSON
export type PublicKeyCredentialCreationOptionsJSON = Record<string, unknown>;
export type PublicKeyCredentialRequestOptionsJSON = Record<string, unknown>;

// ─── Today view ─────────────────────────────────────────────────────────
export type DailyFocus = {
  id: number;
  focus_date: string;
  todo_id: number;
  position: number;
  created_at: string;
  todo: Todo | null;
};

export type TodayEmailBrief = {
  id: number;
  subject: string;
  sender: string;
  received_at: string;
  snippet: string;
};

export type TodayStats = {
  todos_done_today: number;
  todos_open_total: number;
  todos_overdue: number;
  unread_important: number;
  events_today: number;
  streak_days: number;
};

export type TodayResponse = {
  today: string;
  focuses: DailyFocus[];
  events: CalendarEvent[];
  important_emails: TodayEmailBrief[];
  suggested_todos: Todo[];
  stats: TodayStats;
};
