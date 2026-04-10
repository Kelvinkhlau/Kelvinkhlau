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
  const host = isDev ? "localhost:8000" : window.location.host;
  return `${proto}//${host}`;
}

export type EmailClassification = {
  ai_category: string;
  ai_confidence: number;
  ai_reason: string | null;
  user_category: string | null;
  final_category: string;
};

export type Email = {
  id: number;
  subject: string;
  sender: string;
  sender_email: string;
  snippet: string;
  received_at: string;
  is_read: boolean;
  has_attachment: boolean;
  classification: EmailClassification | null;
};

export type EmailDetail = Email & {
  body_text: string;
  body_html: string | null;
  recipients: string;
};

export type GmailStatus =
  | { connected: false }
  | { connected: true; email: string; name: string };

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

export type Todo = {
  id: number;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  due_at: string | null;
  project_id: number | null;
  done: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoCreate = {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high";
  due_at?: string | null;
  project_id?: number | null;
};

export type TodoUpdate = Partial<TodoCreate> & { done?: boolean };

export type ProjectStatus = "active" | "paused" | "done" | "archived";

export type Project = {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string | null;
  todo_count: number;
  done_count: number;
  created_at: string;
  updated_at: string;
};

export type ProjectCreate = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  color?: string | null;
};

export type ProjectUpdate = Partial<ProjectCreate>;

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
  google_event_id: string;
  google_calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
    const detail = await res.text();
    // Token 過期 / 無效 —— 清除並 redirect login（只喺 browser）
    if (res.status === 401 && typeof window !== "undefined") {
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

export const api = {
  health: () => request<{ status: string; env: string }>("/health"),

  // Emails
  listEmails: async (params?: {
    category?: string;
    q?: string;
    unread_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<EmailListResponse> => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    const res = await rawFetch(`/emails${suffix}`);
    const items = (await res.json()) as Email[];
    const total = Number(res.headers.get("X-Total-Count") ?? items.length);
    return { items, total };
  },
  getEmail: (id: number) => request<EmailDetail>(`/emails/${id}`),
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

  // Todos
  listTodos: (params?: { done?: boolean; project_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.done !== undefined) qs.set("done", String(params.done));
    if (params?.project_id !== undefined)
      qs.set("project_id", String(params.project_id));
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
  listCalendarEvents: (params?: { days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set("days", String(params.days));
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

  // Gmail auth
  gmailStatus: () => request<GmailStatus>("/auth/gmail/status"),
  gmailAuthorize: () =>
    request<{ authorization_url: string; state: string }>("/auth/gmail/authorize"),

  // Passkey
  passkeyRegisterStart: () =>
    request<{ challenge_token: string; options: PublicKeyCredentialCreationOptionsJSON }>(
      "/auth/passkey/register/start",
      { method: "POST" }
    ),
  passkeyRegisterFinish: (challenge_token: string, credential: unknown) =>
    request<{ ok: boolean; token: string; user: { email: string; name: string } }>(
      "/auth/passkey/register/finish",
      { method: "POST", body: JSON.stringify({ challenge_token, credential }) }
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
};

// Minimal types for WebAuthn options — browser 會直接用原始 JSON
export type PublicKeyCredentialCreationOptionsJSON = Record<string, unknown>;
export type PublicKeyCredentialRequestOptionsJSON = Record<string, unknown>;
