"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type GmailStatus } from "@/lib/api";

export default function HomePage() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.gmailStatus().then(setGmail).catch(() => setGmail({ connected: false }));
  }, []);

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
      <header className="mb-8">
        <h1 className="text-3xl font-bold">life-os</h1>
        <p className="text-muted-foreground">個人生活整合管理系統</p>
      </header>

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
              disabled={syncing}
              className="w-full p-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {syncing ? "同步中…" : "而家同步 Gmail"}
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
          href="/login"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">🔐 Passkey 登入</div>
          <div className="text-sm text-muted-foreground">
            Face ID / Touch ID（MVP Week 3）
          </div>
        </Link>
      </section>

      <p className="mt-12 text-xs text-muted-foreground text-center">
        MVP Week 1 — 詳見 docs/plan.md
      </p>
    </main>
  );
}
