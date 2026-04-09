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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  return res.json();
}

export const api = {
  health: () => request<{ status: string; env: string }>("/health"),

  // Emails
  listEmails: (params?: {
    category?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
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
