"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type EmailDetail } from "@/lib/api";

const CATEGORIES = [
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

/** 用 sandbox iframe 安全地顯示 HTML email（包括外部圖片）。 */
function EmailHtmlViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height =
      iframe.contentDocument.body.scrollHeight + 16 + "px";
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<base target="_blank">
<style>
  body { margin: 0; padding: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; line-height: 1.6; word-break: break-word; overflow-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
</style>
</head><body>${html}</body></html>`);
    doc.close();

    const images = doc.querySelectorAll("img");
    let loaded = 0;
    const total = images.length;
    if (total === 0) {
      adjustHeight();
    } else {
      images.forEach((img) => {
        const check = () => {
          loaded++;
          if (loaded >= total) adjustHeight();
        };
        if (img.complete) {
          check();
        } else {
          img.addEventListener("load", check);
          img.addEventListener("error", check);
        }
      });
    }

    const timer = setTimeout(adjustHeight, 1000);
    return () => clearTimeout(timer);
  }, [html, adjustHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className="w-full border-0"
      style={{ minHeight: 200 }}
      title="Email content"
    />
  );
}

function EmailDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = Number(searchParams.get("id"));

  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [muting, setMuting] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("無效 email id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getEmail(id)
      .then((e) => {
        setEmail(e);
        setCurrentCategory(e.classification?.final_category ?? null);
        if (!e.is_read) {
          api.markRead(id, true).catch(() => {});
        }
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

  async function handleMuteSender() {
    if (!email || muting) return;
    setMuting(true);
    try {
      await api.addMuted({
        email: email.sender_email,
        name: email.sender,
        reason: "從 inbox 封鎖",
      });
      // Navigate to next email or back to inbox
      if (email.next_id) {
        router.push(`/inbox/detail?id=${email.next_id}`);
      } else {
        router.push("/inbox");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMuting(false);
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
  const isPromo = currentCategory === "promotional";

  return (
    <main className="min-h-screen p-4 max-w-3xl mx-auto">
      {/* Navigation bar: back + prev/next */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/inbox" className="text-sm text-blue-600 hover:underline">
          ← 返回 inbox
        </Link>
        <div className="flex gap-2">
          {email.prev_id ? (
            <Link
              href={`/inbox/detail?id=${email.prev_id}`}
              className="px-3 py-1.5 text-sm font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
              title="上一封（較新）"
            >
              ← 上一封
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-sm border border-border rounded opacity-40 text-muted-foreground">
              ← 上一封
            </span>
          )}
          {email.next_id ? (
            <Link
              href={`/inbox/detail?id=${email.next_id}`}
              className="px-3 py-1.5 text-sm font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
              title="下一封（較舊）"
            >
              下一封 →
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-sm border border-border rounded opacity-40 text-muted-foreground">
              下一封 →
            </span>
          )}
        </div>
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
          <div className="flex gap-2 flex-wrap items-center">
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
            {/* 封鎖寄件者按鈕 */}
            <button
              onClick={handleMuteSender}
              disabled={muting}
              className="text-sm px-3 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 ml-2"
              title="封鎖此寄件者 — 以後嘅 email 自動 archive"
            >
              {muting ? "封鎖中…" : "封鎖寄件者"}
            </button>
          </div>
          {email.classification?.ai_reason && (
            <p className="text-xs text-muted-foreground mt-2">
              AI 原因：{email.classification.ai_reason}（信心{" "}
              {(email.classification.ai_confidence * 100).toFixed(0)}%）
            </p>
          )}
          {isPromo && (
            <p className="text-xs text-muted-foreground mt-1">
              如果想繼續收到呢個寄件者嘅 email，唔好撳「封鎖寄件者」。
            </p>
          )}
        </section>

        <section className="border-t border-border pt-4">
          {email.body_html ? (
            <EmailHtmlViewer html={email.body_html} />
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {email.body_text || email.snippet}
            </div>
          )}
        </section>
      </article>
    </main>
  );
}

export default function EmailDetailPage() {
  return (
    <Suspense fallback={<main className="p-8">載入中…</main>}>
      <EmailDetailContent />
    </Suspense>
  );
}
