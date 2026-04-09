"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type EmailDetail } from "@/lib/api";

const CATEGORIES = [
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("無效 email id");
      setLoading(false);
      return;
    }
    api
      .getEmail(id)
      .then((e) => {
        setEmail(e);
        setCurrentCategory(e.classification?.final_category ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCategoryChange(category: string) {
    if (!email || saving) return;
    setSaving(true);
    try {
      const res = await api.updateCategory(email.id, category);
      setCurrentCategory(res.final_category);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-8">載入中…</main>;
  if (error)
    return (
      <main className="p-8">
        <Link href="/inbox" className="text-sm text-blue-600 hover:underline">
          ← 返回 inbox
        </Link>
        <div className="mt-4 text-red-600">錯誤：{error}</div>
      </main>
    );
  if (!email) return <main className="p-8">找不到 email</main>;

  const receivedAt = new Date(email.received_at);

  return (
    <main className="min-h-screen p-4 max-w-3xl mx-auto">
      <div className="mb-4">
        <Link href="/inbox" className="text-sm text-blue-600 hover:underline">
          ← 返回 inbox
        </Link>
      </div>

      <article className="space-y-4">
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-bold mb-2">
            {email.subject || "(無主題)"}
          </h1>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">寄件者：</span>
              {email.sender} &lt;{email.sender_email}&gt;
            </div>
            <div>
              <span className="font-medium">收件者：</span>
              {email.recipients}
            </div>
            <div>
              <span className="font-medium">時間：</span>
              {receivedAt.toLocaleString("zh-HK")}
            </div>
          </div>
        </header>

        <section>
          <div className="text-sm font-medium mb-2">分類</div>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                disabled={saving}
                onClick={() => handleCategoryChange(c.value)}
                className={`text-sm px-3 py-1 rounded-full border disabled:opacity-50 ${
                  currentCategory === c.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {email.classification?.ai_reason && (
            <p className="text-xs text-muted-foreground mt-2">
              AI 原因：{email.classification.ai_reason}（信心{" "}
              {(email.classification.ai_confidence * 100).toFixed(0)}%）
            </p>
          )}
        </section>

        <section className="border-t border-border pt-4">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {email.body_text || email.snippet}
          </div>
        </section>
      </article>
    </main>
  );
}
