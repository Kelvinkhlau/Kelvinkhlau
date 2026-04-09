"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, getToken, getWsBase, type Email } from "@/lib/api";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

const PAGE_SIZE = 50;

const CATEGORY_LABEL: Record<string, string> = {
  important: "重要",
  normal: "一般",
  promotional: "廣告",
  unclassified: "未分類",
};

function classificationChip(email: Email) {
  if (!email.classification) return null;
  const cat = email.classification.final_category;
  const conf = email.classification.ai_confidence;
  const userOverridden = !!email.classification.user_category;
  const isSuggestion = !userOverridden && conf < 0.85;

  const color =
    cat === "important"
      ? "bg-red-50 text-red-700 border-red-200"
      : cat === "promotional"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span
      className={`ml-2 text-xs px-2 py-1 rounded border whitespace-nowrap ${color} ${
        isSuggestion ? "opacity-60 italic" : ""
      }`}
      title={
        isSuggestion
          ? `AI 建議（信心 ${(conf * 100).toFixed(0)}%）`
          : userOverridden
            ? "用戶修正"
            : `AI 分類（信心 ${(conf * 100).toFixed(0)}%）`
      }
    >
      {isSuggestion ? "建議：" : ""}
      {CATEGORY_LABEL[cat] ?? cat}
    </span>
  );
}

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [liveCount, setLiveCount] = useState(0);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [category, debouncedQ, unreadOnly]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listEmails({
        category: category || undefined,
        q: debouncedQ || undefined,
        unread_only: unreadOnly || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((res) => {
        setEmails(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [category, debouncedQ, unreadOnly, page]);

  // WebSocket real-time push —— 新 email 入嚟直接 prepend（只喺第一頁）
  useEffect(() => {
    const base = getWsBase();
    const token = getToken();
    if (!base || !token) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(
          `${base}/ws/emails?token=${encodeURIComponent(token)}`,
        );
      } catch {
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "email.new" && msg.email) {
            setEmails((prev) => {
              if (prev.some((e) => e.id === msg.email.id)) return prev;
              // 只喺第一頁先 prepend，避免跨頁亂序
              if (page !== 0) return prev;
              return [msg.email as Email, ...prev];
            });
            setTotal((t) => t + 1);
            setLiveCount((n) => n + 1);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [page]);

  const resultLabel = useMemo(() => {
    if (loading) return "載入中…";
    const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const to = Math.min((page + 1) * PAGE_SIZE, total);
    return `${from}-${to} / ${total}`;
  }, [loading, total, page]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <main className="min-h-screen p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">Inbox</h1>
          {liveCount > 0 && (
            <span className="text-xs text-green-600">
              🟢 {liveCount} 封新 email（實時）
            </span>
          )}
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input
          type="search"
          placeholder="搜尋 subject / sender / 內文…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background"
        />
        <div className="flex gap-2 items-center flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`text-sm px-3 py-1 rounded-full border ${
                category === c.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={`text-sm px-3 py-1 rounded-full border ${
              unreadOnly
                ? "bg-blue-600 text-white border-blue-600"
                : "border-border hover:bg-muted"
            }`}
          >
            只睇未讀
          </button>
          <span className="ml-auto text-xs text-muted-foreground">
            {resultLabel}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-4 text-red-600 border border-red-200 rounded">
          錯誤：{error}
        </div>
      )}

      {!loading && emails.length === 0 ? (
        <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg">
          {debouncedQ || category || unreadOnly ? (
            <>冇符合條件嘅 email。</>
          ) : (
            <>
              仲未有任何 email。
              <br />
              <span className="text-sm">
                連接 Gmail account 之後背景 sync 會自動填滿。
              </span>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {emails.map((email) => (
              <li
                key={email.id}
                className={`hover:bg-muted ${email.is_read ? "opacity-60" : ""}`}
              >
                <Link href={`/inbox/detail?id=${email.id}`} className="block p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`truncate ${email.is_read ? "font-normal" : "font-semibold"}`}
                      >
                        {!email.is_read && (
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2 align-middle" />
                        )}
                        {email.subject || "(無主題)"}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {email.sender}
                      </div>
                      <div className="text-sm mt-1 line-clamp-2">
                        {email.snippet}
                      </div>
                    </div>
                    {classificationChip(email)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 border border-border rounded disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-muted-foreground">
                第 {page + 1} / {lastPage + 1} 頁
              </span>
              <button
                disabled={page >= lastPage || loading}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                className="px-3 py-1 border border-border rounded disabled:opacity-40"
              >
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
