/**
 * API client — 同 backend (FastAPI) 講嘢。
 *
 * 開發時：next.config.mjs 會 proxy /api 去 localhost:8000
 * 部署時：FastAPI serve 同一個 origin，唔需要 CORS
 */

const BASE = "/api";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; env: string }>("/health"),

  // Emails
  listEmails: (params?: { category?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<Email[]>(`/emails${suffix}`);
  },
  getEmail: (id: number) => request<EmailDetail>(`/emails/${id}`),
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

  // Gmail auth
  gmailStatus: () => request<GmailStatus>("/auth/gmail/status"),
  gmailAuthorize: () =>
    request<{ authorization_url: string; state: string }>("/auth/gmail/authorize"),
};
