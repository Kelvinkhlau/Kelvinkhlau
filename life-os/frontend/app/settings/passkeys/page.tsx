"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Device = {
  id: number;
  device_name: string | null;
  created_at: string | null;
  last_used_at: string | null;
};

export default function PasskeySettingsPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.passkeyListDevices();
      setDevices(res.devices);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: number, name: string | null) {
    if (!confirm(`刪除 passkey「${name ?? "Unknown"}」？呢部 device 之後無法用 Face ID / Touch ID 登入。`))
      return;
    setBusy(id);
    setError(null);
    try {
      await api.passkeyDeleteDevice(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Passkey 管理</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 返回首頁
        </Link>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        最多可以註冊 3 個 passkey。如果想用 iPhone 跨 device 登入（QR code），
        喺 iPhone 註冊一次就夠 — Mac mini / iPad 經 QR scan 借用 iPhone 嘅 passkey 登入。
      </p>

      {error && (
        <div className="mb-4 p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded">
          {error}
        </div>
      )}

      {devices === null ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : devices.length === 0 ? (
        <div className="p-4 border border-border rounded text-sm text-muted-foreground">
          仲未註冊任何 passkey。去{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            登入頁面
          </Link>{" "}
          註冊。
        </div>
      ) : (
        <ul className="space-y-3">
          {devices.map((d) => (
            <li
              key={d.id}
              className="p-4 border border-border rounded flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{d.device_name ?? "Unnamed device"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  註冊：{d.created_at ? new Date(d.created_at).toLocaleString("zh-HK") : "—"}
                  {" · "}
                  最後用：
                  {d.last_used_at ? new Date(d.last_used_at).toLocaleString("zh-HK") : "未用過"}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === d.id}
                onClick={() => handleDelete(d.id, d.device_name)}
                className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
              >
                {busy === d.id ? "刪除中…" : "刪除"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 p-4 bg-muted/50 border border-border rounded text-sm">
        <div className="font-medium mb-2">用 iPhone QR code 登入（Option B）</div>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>iPhone 開 /login，撳「➕ 註冊 Passkey」用 Face ID 註冊</li>
          <li>Mac mini / iPad 開 /login，撳「🔐 Face ID / Touch ID 登入」</li>
          <li>browser 會彈 QR code → 用 iPhone 相機 scan → Face ID 確認 → 完成</li>
          <li>確定 work 之後，可以喺呢度刪除舊嘅 device credential</li>
        </ol>
      </div>
    </main>
  );
}
