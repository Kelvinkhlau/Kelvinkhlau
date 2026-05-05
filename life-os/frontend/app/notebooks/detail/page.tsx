"use client";

/**
 * Notebook detail / editor page。
 *
 * - 左邊：頁面縮圖 sidebar（可加新頁 / 刪頁 / 切頁）
 * - 中間：tldraw canvas（畫圖 + 文字 + 手寫）
 * - 頂部：title、tag、儲存狀態
 *
 * 自動儲存策略：
 * - 停頓 1.5s 無變更 → auto save
 * - 明確「儲存」按鈕 → 即時 save
 *
 * tldraw 組件只喺 client render（SSR disabled）。
 */

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Notebook, type NotebookPage, type NotebookPageSummary } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import type { Editor } from "tldraw";
// 喺頁面層 eager import tldraw.css，避免 lazy chunk race condition
// （原本喺 dynamic component 入面 import，會導致 CSS 未載入就 render）
import "tldraw/tldraw.css";

// tldraw 依賴 DOM — 禁用 SSR
const NotebookEditor = dynamic(() => import("./NotebookEditor"), {
  ssr: false,
  loading: () => <Loading />,
});

export default function NotebookDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inner />
    </Suspense>
  );
}

/** 頁面 title + tags 編輯欄（inline，blur / Enter 存檔） */
function PageMetaBar({
  notebookId,
  page,
}: {
  notebookId: number;
  page: NotebookPage;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(page.title ?? "");
  const [tagsText, setTagsText] = useState(page.tags ?? "");
  const [saving, setSaving] = useState(false);

  // page 切換時重設 state
  useEffect(() => {
    setTitle(page.title ?? "");
    setTagsText(page.tags ?? "");
  }, [page.id, page.title, page.tags]);

  const mutation = useMutation({
    mutationFn: (payload: { title?: string | null; tags?: string; template?: string }) =>
      api.updateNotebookPage(notebookId, page.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-pages", notebookId] });
      queryClient.invalidateQueries({ queryKey: ["notebook-page", notebookId, page.id] });
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setSaving(false),
  });

  const handleTemplateChange = (template: string) => {
    if (template === page.template) return;
    setSaving(true);
    mutation.mutate({ template });
  };

  const commitTitle = () => {
    const t = title.trim();
    if (t === (page.title ?? "").trim()) return;
    setSaving(true);
    mutation.mutate({ title: t || null });
  };

  const commitTags = () => {
    // normalise: trim each, dedupe, join
    const raw = tagsText
      .replace(/#/g, "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const deduped = Array.from(new Set(raw));
    const normalised = deduped.join(",");
    if (normalised === (page.tags ?? "").trim()) return;
    setSaving(true);
    mutation.mutate({ tags: normalised });
    setTagsText(normalised);
  };

  const tagChips = (page.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 text-sm">
      <label className="text-xs text-muted-foreground whitespace-nowrap">標題</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="（未命名頁面）"
        className="flex-1 min-w-[120px] px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <label className="text-xs text-muted-foreground whitespace-nowrap ml-2">
        #標籤
      </label>
      <input
        type="text"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        onBlur={commitTags}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="tag1, tag2, tag3"
        className="flex-1 min-w-[140px] px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <label className="text-xs text-muted-foreground whitespace-nowrap ml-2">模板</label>
      <select
        value={page.template || "blank"}
        onChange={(e) => handleTemplateChange(e.target.value)}
        className="px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-400"
        title="改變呢頁嘅背景線樣"
      >
        <option value="blank">空白</option>
        <option value="ruled">橫線</option>
        <option value="grid">方格</option>
        <option value="dot">點陣</option>
      </select>
      {saving && <span className="text-[10px] text-muted-foreground">💾 儲存…</span>}
      {!saving && tagChips.length > 0 && (
        <div className="flex flex-wrap gap-1 basis-full">
          {tagChips.map((t) => (
            <Link
              key={t}
              href={`/notebooks/search?tag=${encodeURIComponent(t)}`}
              className="text-[10px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-500/20"
              title={`搜尋標籤 #${t}`}
            >
              #{t}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const notebookId = Number(sp.get("id"));
  const queryClient = useQueryClient();

  const [activePageId, setActivePageId] = useState<number | null>(null);

  const { data: notebook } = useQuery<Notebook>({
    queryKey: ["notebook", notebookId],
    queryFn: () => api.getNotebook(notebookId),
    enabled: Number.isFinite(notebookId),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const { data: pages = [], isLoading: pagesLoading } = useQuery<NotebookPageSummary[]>({
    queryKey: ["notebook-pages", notebookId],
    queryFn: () => api.listNotebookPages(notebookId),
    enabled: Number.isFinite(notebookId),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  // Pick first page by default
  useEffect(() => {
    if (activePageId == null && pages.length > 0) {
      setActivePageId(pages[0].id);
    }
  }, [pages, activePageId]);

  const { data: activePage } = useQuery<NotebookPage>({
    queryKey: ["notebook-page", notebookId, activePageId],
    queryFn: () => api.getNotebookPage(notebookId, activePageId!),
    enabled: Number.isFinite(notebookId) && activePageId != null,
    // 關鍵：避免 iPad 上 focus/blur 觸發 refetch 令 activePage 暫時 undefined
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
  });

  const addPageMutation = useMutation({
    mutationFn: () => {
      if (!notebook) {
        throw new Error("Notebook 未載入，請稍候再試");
      }
      return api.createNotebookPage(notebookId, {
        template: notebook.default_template || "blank",
      });
    },
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ["notebook-pages", notebookId] });
      setActivePageId(page.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: number) => api.deleteNotebookPage(notebookId, pageId),
    onSuccess: (_d, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["notebook-pages", notebookId] });
      if (activePageId === deletedId) {
        const remaining = pages.filter((p) => p.id !== deletedId);
        setActivePageId(remaining[0]?.id ?? null);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const editorRef = useRef<Editor | null>(null);
  const handleEditorReady = useCallback((ed: Editor) => {
    editorRef.current = ed;
  }, []);

  const savePageMutation = useMutation({
    mutationFn: (payload: {
      canvas_json: string;
      text_content?: string;
      thumbnail?: string | null;
    }) => api.updateNotebookPage(notebookId, activePageId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebook-pages", notebookId] });
    },
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 由 tldraw canvas 生成小縮圖（~180px 寬 base64 PNG）。 */
  const generateThumbnail = useCallback(async (): Promise<string | null> => {
    const editor = editorRef.current;
    if (!editor) return null;
    try {
      const allShapes = editor.getCurrentPageShapeIds();
      if (allShapes.size === 0) return null;
      const { url } = await editor.toImageDataUrl(Array.from(allShapes), {
        format: "png",
        scale: 0.3,
        background: true,
        padding: 16,
      });
      return url;
    } catch (e) {
      console.warn("thumbnail gen failed:", e);
      return null;
    }
  }, []);

  // Mutation ref 令 handleChange 唔需要 depend on 新 mutation object
  const saveMutRef = useRef(savePageMutation);
  const genThumbRef = useRef(generateThumbnail);
  useEffect(() => {
    saveMutRef.current = savePageMutation;
  }, [savePageMutation]);
  useEffect(() => {
    genThumbRef.current = generateThumbnail;
  }, [generateThumbnail]);

  /**
   * 有兩個獨立 debounce：
   *
   * 1. **canvas_json save**（1.5s，輕）— 只寄 JSON，backend 幾十 ms 就 done。
   * 2. **thumbnail generation**（5s idle，重）— `editor.toImageDataUrl()`
   *    喺 iPad 會鎖 canvas 1-2 秒，所以只喺用戶停手一段時間先做。
   *
   * 咁樣寫字流暢度 >> 縮圖 freshness。
   */
  const latestPayloadRef = useRef<{ canvas_json: string; text_content: string } | null>(null);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback((includeThumbnail: boolean) => {
    const payload = latestPayloadRef.current;
    if (!payload) return;
    (async () => {
      const thumbnail = includeThumbnail ? await genThumbRef.current() : undefined;
      saveMutRef.current.mutate(
        {
          canvas_json: payload.canvas_json,
          text_content: payload.text_content,
          ...(thumbnail !== undefined ? { thumbnail: thumbnail ?? null } : {}),
        },
        {
          onSuccess: () => setSaveStatus("saved"),
          onError: () => setSaveStatus("error"),
        },
      );
    })();
  }, []);

  const handleChange = useCallback(
    (canvasJson: string, textContent: string) => {
      if (activePageId == null) return;
      latestPayloadRef.current = { canvas_json: canvasJson, text_content: textContent };
      setSaveStatus("saving");

      // 輕 save：1.5s debounce，唔帶 thumbnail（thumbnail 攞 toImageDataUrl 比較重）
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => runSave(false), 1500);

      // 5s idle 再生成 thumbnail（冇新改動才做）— flushSave / 切頁時都會 flush 一次
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
      thumbTimerRef.current = setTimeout(() => runSave(true), 5000);
    },
    [activePageId, runSave],
  );

  // 切頁前 flush：立即 save + 生成 thumbnail
  const flushSaveRef = useRef<() => Promise<void>>(async () => {});
  flushSaveRef.current = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    const payload = latestPayloadRef.current;
    if (!payload) return;
    const thumbnail = await genThumbRef.current();
    await new Promise<void>((resolve) => {
      saveMutRef.current.mutate(
        {
          canvas_json: payload.canvas_json,
          text_content: payload.text_content,
          thumbnail: thumbnail ?? null,
        },
        {
          onSuccess: () => {
            setSaveStatus("saved");
            resolve();
          },
          onError: () => {
            setSaveStatus("error");
            resolve();
          },
        },
      );
    });
  };

  // 切頁時 flush
  const prevPageIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevPageIdRef.current;
    if (prev != null && prev !== activePageId) {
      flushSaveRef.current();
      latestPayloadRef.current = null;
    }
    prevPageIdRef.current = activePageId;
  }, [activePageId]);

  // 離開頁 / tab 變暗 時 flush
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSaveRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    };
  }, []);

  // ─── OCR ──────────────────────────────────────────────────────────────
  const ocrMutation = useMutation({
    mutationFn: async () => {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor 未就緒");
      if (activePageId == null) throw new Error("未選擇頁面");
      const shapeIds = Array.from(editor.getCurrentPageShapeIds());
      if (shapeIds.length === 0) throw new Error("呢頁係空白，冇嘢 OCR");
      const { url } = await editor.toImageDataUrl(shapeIds, {
        format: "png",
        scale: 1,
        background: true,
        padding: 16,
      });
      return api.ocrNotebookPage(notebookId, activePageId, url);
    },
    onSuccess: (res) => {
      toast.success(
        `OCR 完成：${res.text.length} 字${res.tags.length ? `，${res.tags.length} 個 tag` : ""}`,
      );
      queryClient.invalidateQueries({ queryKey: ["notebook-pages", notebookId] });
      queryClient.invalidateQueries({
        queryKey: ["notebook-page", notebookId, activePageId],
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ─── PDF 匯出（當前頁） ──────────────────────────────────────────────
  const exportPdfMutation = useMutation({
    mutationFn: async () => {
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor 未就緒");
      const shapeIds = Array.from(editor.getCurrentPageShapeIds());
      if (shapeIds.length === 0) throw new Error("空白頁唔洗匯出");
      const { url, width, height } = await editor.toImageDataUrl(shapeIds, {
        format: "png",
        scale: 2,
        background: true,
        padding: 32,
      });
      const { jsPDF } = await import("jspdf");
      const orientation = width >= height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "pt",
        format: [width, height],
      });
      pdf.addImage(url, "PNG", 0, 0, width, height);
      const safeName = `${notebook?.title || "notebook"}-p${activePage?.page_number ?? ""}.pdf`
        .replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(safeName);
    },
    onSuccess: () => toast.success("已匯出 PDF"),
    onError: (e) => toast.error((e as Error).message),
  });

  if (!Number.isFinite(notebookId)) {
    return <main className="p-4">缺少 notebook id</main>;
  }

  return (
    <main
      className="flex flex-col h-full"
      style={{ minHeight: "calc(100dvh - 160px)" }}
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background">
        <Link
          href="/notebooks"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </Link>
        <div className="flex-1 truncate">
          <span className="text-lg mr-1">{notebook?.icon || "📓"}</span>
          <span className="font-semibold">{notebook?.title || "…"}</span>
          <span className="text-xs text-muted-foreground ml-2">
            第 {activePage?.page_number ?? "?"} 頁 / 共 {pages.length} 頁
          </span>
        </div>
        <button
          type="button"
          onClick={() => ocrMutation.mutate()}
          disabled={ocrMutation.isPending || activePageId == null}
          title="用 AI 識別手寫/打字文字，寫入 page text_content 俾搜尋用"
          className="px-2 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50"
        >
          {ocrMutation.isPending ? "識別中…" : "🔍 OCR"}
        </button>
        <button
          type="button"
          onClick={() => exportPdfMutation.mutate()}
          disabled={exportPdfMutation.isPending || activePageId == null}
          className="px-2 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50"
        >
          {exportPdfMutation.isPending ? "匯出中…" : "📄 PDF"}
        </button>
        <span className="text-xs text-muted-foreground">
          {saveStatus === "saving" && "💾 儲存中…"}
          {saveStatus === "saved" && "✅ 已儲存"}
          {saveStatus === "error" && "⚠️ 儲存失敗"}
        </span>
      </header>

      {activePage && <PageMetaBar notebookId={notebookId} page={activePage} />}

      <div className="flex flex-1 overflow-hidden">
        {/* Pages sidebar */}
        <aside className="w-28 shrink-0 border-r border-border overflow-y-auto bg-muted/30 p-2 space-y-2">
          {pagesLoading ? (
            <Loading />
          ) : (
            pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePageId(p.id)}
                className={`w-full aspect-[3/4] border-2 rounded bg-white text-[10px] text-left p-1 transition ${
                  activePageId === p.id
                    ? "border-indigo-500 shadow"
                    : "border-transparent hover:border-border"
                }`}
              >
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt={`Page ${p.page_number}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-gray-400">p.{p.page_number}</div>
                )}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => addPageMutation.mutate()}
            className="w-full aspect-[3/4] border-2 border-dashed border-border rounded text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition"
          >
            + 新頁
          </button>
          {activePageId != null && pages.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("刪除呢一頁？")) deletePageMutation.mutate(activePageId);
              }}
              className="w-full py-1 text-xs text-red-500 hover:underline"
            >
              刪除此頁
            </button>
          )}
        </aside>

        {/* Canvas — template 背景直接放落 container CSS，避免 absolute sibling 同 tldraw 打架 */}
        <div
          className="flex-1 relative"
          style={{
            height: "calc(100dvh - 220px)",
            ...templateBackgroundStyle(activePage?.template),
          }}
        >
          {activePage ? (
            <NotebookEditor
              key={activePage.id}
              initialSnapshot={activePage.canvas_json}
              onChange={handleChange}
              onEditorReady={handleEditorReady}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              {pages.length === 0 ? "未有頁面" : "載入中…"}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** 將 template 轉成 CSS background style object — 直接 apply 落 canvas container。 */
function templateBackgroundStyle(template?: string): React.CSSProperties {
  const base: React.CSSProperties = { backgroundColor: "#ffffff" };
  if (!template || template === "blank") return base;

  const lineColor = "rgba(156, 163, 175, 0.45)";
  const size = "28px";

  if (template === "ruled") {
    return {
      ...base,
      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 27px, ${lineColor} 27px 28px)`,
      backgroundSize: "100% 28px",
      backgroundPosition: "0 0",
    };
  }
  if (template === "grid") {
    return {
      ...base,
      backgroundImage: `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: `${size} ${size}`,
      backgroundPosition: "0 0",
    };
  }
  if (template === "dot") {
    return {
      ...base,
      backgroundImage: `radial-gradient(${lineColor} 1px, transparent 1px)`,
      backgroundSize: `${size} ${size}`,
      backgroundPosition: "0 0",
    };
  }
  return base;
}
