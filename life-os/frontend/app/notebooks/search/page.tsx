"use client";

/**
 * Notebook search page — 全文/標籤搜尋所有記事簿頁面。
 * 搜尋 source：tldraw text shapes 嘅純文字（text_content） + OCR 結果 + tags。
 */

import Link from "next/link";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type NotebookPageSearchHit } from "@/lib/api";
import { Loading, EmptyState } from "@/components/Loading";

export default function NotebookSearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const enabled = Boolean(q || tag);

  const { data: hits = [], isFetching } = useQuery<NotebookPageSearchHit[]>({
    queryKey: ["notebook-search", { q, tag }],
    queryFn: () => api.searchNotebookPages({ q: q || undefined, tag: tag || undefined }),
    enabled,
  });

  function highlight(text: string, needle: string): React.ReactNode {
    if (!needle) return text;
    const idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-900">
          {text.slice(idx, idx + needle.length)}
        </mark>
        {text.slice(idx + needle.length)}
      </>
    );
  }

  return (
    <main className="min-h-full max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/notebooks"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </Link>
        <h1 className="text-xl font-bold">🔎 搜尋記事簿</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋文字內容 / 記事簿名 / 頁面標題…"
          autoFocus
          className="px-3 py-2 border border-border rounded bg-background"
        />
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="#tag"
          className="px-3 py-2 border border-border rounded bg-background w-full sm:w-32"
        />
      </div>

      {!enabled ? (
        <p className="text-muted-foreground text-sm">輸入關鍵字或 tag 開始搜尋。</p>
      ) : isFetching ? (
        <Loading />
      ) : hits.length === 0 ? (
        <EmptyState message="搵唔到相關頁面 — 試下其他關鍵字，或先 OCR 手寫頁面" />
      ) : (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.page_id} className="border border-border rounded-lg p-3 hover:bg-muted/30">
              <Link href={`/notebooks/detail?id=${h.notebook_id}`} className="block">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">📓 {h.notebook_title}</span>
                  <span>· 第 {h.page_number} 頁</span>
                  {h.page_title && <span>· {h.page_title}</span>}
                  <span className="ml-auto">{h.updated_at.slice(0, 10)}</span>
                </div>
                {h.snippet && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {highlight(h.snippet, q)}
                  </p>
                )}
                {h.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {h.tags.split(",").filter(Boolean).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 bg-muted rounded"
                      >
                        #{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
