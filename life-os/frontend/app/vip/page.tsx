"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type VipSender } from "@/lib/api";

export default function VipPage() {
  const [vips, setVips] = useState<VipSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listVips()
      .then(setVips)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setError(null);
    try {
      await api.addVip({ email: newEmail.trim(), name: newName.trim() });
      setNewEmail("");
      setNewName("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定要移出 VIP？")) return;
    try {
      await api.deleteVip(id);
      setVips((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">VIP 白名單</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        VIP 寄件者嘅 email 會自動歸類為「重要」，唔使過 AI 分類。
      </p>

      <form
        onSubmit={handleAdd}
        className="flex gap-2 mb-4 p-3 border border-border rounded-lg flex-wrap"
      >
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Email 地址"
          className="flex-1 min-w-[200px] px-3 py-2 border border-border rounded-md bg-background"
          required
        />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="名稱（選填）"
          className="w-32 px-3 py-2 border border-border rounded-md bg-background"
        />
        <button
          type="submit"
          disabled={!newEmail.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加入
        </button>
      </form>

      {error && (
        <div className="p-3 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground p-8">載入中…</div>
      ) : vips.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          仲未有 VIP — 加個重要寄件者先！
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {vips.map((vip) => (
            <li
              key={vip.id}
              className="flex items-center gap-3 p-3 hover:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{vip.email}</div>
                {vip.name && (
                  <div className="text-sm text-muted-foreground">
                    {vip.name}
                  </div>
                )}
                {vip.note && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {vip.note}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(vip.id)}
                className="text-xs text-red-600 hover:underline shrink-0"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
