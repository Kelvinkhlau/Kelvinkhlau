"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  api,
  getToken,
  setToken,
  type EmailStats,
  type GmailStatus,
} from "@/lib/api";

export default function HomePage() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const hasToken = !!getToken();
    setLoggedIn(hasToken);
    api.gmailStatus().then(setGmail).catch(() => setGmail({ connected: false }));
    if (hasToken) {
      api.emailStats().then(setStats).catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    setToken(null);
    setLoggedIn(false);
  };

  const connectGmail = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      const { authorization_url } = await api.gmailAuthorize();
      window.location.href = authorization_url;
    } catch (e) {
      setMessage(`連接失敗：${(e as Error).message}`);
      setConnecting(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await api.triggerSync({ limit: 50, classify: true });
      setMessage(
        `✓ 已 sync：拉咗 ${result.fetched} 封，新 ${result.new} 封，分類咗 ${result.classified} 封` +
          (result.errors.length ? `（${result.errors.length} 個錯誤）` : ""),
      );
    } catch (e) {
      setMessage(`Sync 失敗：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">life-os</h1>
          <p className="text-muted-foreground">個人生活整合管理系統</p>
        </div>
        {loggedIn ? (
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs px-3 py-1 border border-border rounded hover:bg-muted"
          >
            登出
          </button>
        ) : (
          <Link
            href="/login"
            className="text-xs px-3 py-1 border border-border rounded hover:bg-muted"
          >
            登入
          </Link>
        )}
      </header>

      {/* Dashboard stats */}
      {loggedIn && stats && stats.total > 0 && (
        <section className="mb-6 grid grid-cols-4 gap-2">
          <div className="p-3 border border-border rounded-lg text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">總數</div>
          </div>
          <div className="p-3 border border-border rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats.unread}
            </div>
            <div className="text-xs text-muted-foreground">未讀</div>
          </div>
          <div className="p-3 border border-border rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats.today_new}
            </div>
            <div className="text-xs text-muted-foreground">今日新</div>
          </div>
          <div className="p-3 border border-border rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">
              {stats.by_category.important ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">重要</div>
          </div>
        </section>
      )}

      {/* Gmail connect card */}
      <section className="mb-6 p-4 border border-border rounded-lg">
        <h2 className="font-medium mb-3">📧 Gmail 連接</h2>
        {gmail === null ? (
          <p className="text-sm text-muted-foreground">檢查中…</p>
        ) : gmail.connected ? (
          <div className="space-y-2">
            <p className="text-sm">
              已連接：<span className="font-medium">{gmail.email}</span>
            </p>
            <button
              type="button"
              onClick={triggerSync}
              disabled={syncing || !loggedIn}
              className="w-full p-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
              title={!loggedIn ? "請先 Passkey 登入" : undefined}
            >
              {!loggedIn
                ? "請先登入先可以 sync"
                : syncing
                  ? "同步中…"
                  : "而家同步 Gmail"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={connectGmail}
            disabled={connecting}
            className="w-full p-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {connecting ? "跳轉中…" : "連接 Gmail"}
          </button>
        )}
        {message && (
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        )}
      </section>

      {/* Navigation */}
      <section className="space-y-3">
        <Link
          href="/inbox"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">📬 Inbox</div>
          <div className="text-sm text-muted-foreground">
            睇晒你嘅 email，AI 自動分類
          </div>
        </Link>

        <Link
          href="/todos"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">✅ Todos</div>
          <div className="text-sm text-muted-foreground">
            簡單清單 — 記低要做嘅嘢
          </div>
        </Link>

        <Link
          href="/projects"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">📁 Projects</div>
          <div className="text-sm text-muted-foreground">
            將 todos group 做專案，追進度
          </div>
        </Link>

        <Link
          href="/ideas"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">💡 Ideas</div>
          <div className="text-sm text-muted-foreground">
            快速記低靈感、想法、snippets
          </div>
        </Link>

        <Link
          href="/calendar"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">📅 Calendar</div>
          <div className="text-sm text-muted-foreground">
            Google Calendar 同步，睇 upcoming events
          </div>
        </Link>

        <Link
          href="/assistant"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">🤖 AI 助手</div>
          <div className="text-sm text-muted-foreground">
            用自然語言建 todo / idea / project
          </div>
        </Link>

        <Link
          href="/vip"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">⭐ VIP 白名單</div>
          <div className="text-sm text-muted-foreground">
            重要寄件者 — email 自動標「重要」
          </div>
        </Link>

        {!loggedIn && (
          <Link
            href="/login"
            className="block p-4 border border-border rounded-lg hover:bg-muted transition"
          >
            <div className="font-medium">🔐 Passkey 登入</div>
            <div className="text-sm text-muted-foreground">
              Face ID / Touch ID — 訪問 inbox 前要先登入
            </div>
          </Link>
        )}
      </section>

      <p className="mt-12 text-xs text-muted-foreground text-center">
        詳見 docs/plan.md
      </p>
    </main>
  );
}
