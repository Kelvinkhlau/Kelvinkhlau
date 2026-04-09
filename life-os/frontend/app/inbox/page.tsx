"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, getWsBase, type Email } from "@/lib/api";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [liveCount, setLiveCount] = useState(0);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listEmails({
        category: category || undefined,
        q: debouncedQ || undefined,
      })
      .then(setEmails)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [category, debouncedQ]);

  // WebSocket real-time push —— 新 email 入嚟直接 prepend
  useEffect(() => {
    const base = getWsBase();
    if (!base) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(`${base}/ws/emails`);
      } catch {
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "email.new" && msg.email) {
            setEmails((prev) => {
              if (prev.some((e) => e.id === msg.email.id)) return prev;
              return [msg.email as Email, ...prev];
            });
            setLiveCount((n) => n + 1);
          }
        } catch {
          // ignore malformed
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
  }, []);

  const resultLabel = useMemo(() => {
    if (loading) return "載入中…";
    return `共 ${emails.length} 封`;
  }, [loading, emails.length]);

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
        <div className="flex gap-2 items-center">
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
          {debouncedQ || category ? (
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
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {emails.map((email) => (
            <li key={email.id} className="hover:bg-muted">
              <Link
                href={`/inbox/${email.id}`}
                className="block p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {email.subject || "(無主題)"}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {email.sender}
                    </div>
                    <div className="text-sm mt-1 line-clamp-2">
                      {email.snippet}
                    </div>
                  </div>
                  {email.classification && (
                    <span className="ml-2 text-xs px-2 py-1 rounded bg-muted whitespace-nowrap">
                      {email.classification.final_category}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
