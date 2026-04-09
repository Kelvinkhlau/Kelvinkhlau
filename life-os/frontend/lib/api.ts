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
  listEmails: () => request<Email[]>("/emails"),
  getEmail: (id: number) => request<Email>(`/emails/${id}`),
  updateCategory: (id: number, category: string) =>
    request<{ ok: boolean }>(`/emails/${id}/category`, {
      method: "PUT",
      body: JSON.stringify({ category }),
    }),
};
