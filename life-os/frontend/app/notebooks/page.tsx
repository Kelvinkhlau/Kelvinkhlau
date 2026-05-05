"use client";

/**
 * Notebooks list page — GoodNotes 風格嘅記事簿總覽。
 * 每本記事簿顯示 cover color、icon、title、頁數；點擊入 detail editor。
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Notebook, type NotebookCreate } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/** 相片封面 — 用 JWT fetch 成 blob URL，顯示覆蓋 cover_color */
function NotebookCoverImage({ notebookId }: { notebookId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    api.fetchNotebookCoverBlobUrl(notebookId)
      .then((u) => {
        if (!active) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setSrc(u);
      })
      .catch(() => {/* fallback cover_color */});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [notebookId]);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

const COVER_PALETTE = [
  "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#6b7280",
];

export default function NotebooksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ["notebooks", { search, showArchived }],
    queryFn: () => {
      const params: { archived?: boolean; q?: string } = { archived: showArchived };
      if (search) params.q = search;
      return api.listNotebooks(params);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: NotebookCreate) => api.createNotebook(payload),
    onSuccess: (nb) => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("已建立記事簿");
      setShowCreate(false);
      // Navigate into it
      window.location.href = `/notebooks/detail?id=${nb.id}`;
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNotebook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pinMutation = useMutation({
    mutationFn: (nb: Notebook) => api.updateNotebook(nb.id, { pinned: !nb.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveMutation = useMutation({
    mutationFn: (nb: Notebook) =>
      api.updateNotebook(nb.id, { archived: !nb.archived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notebooks"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const coverUploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      api.uploadNotebookCover(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("已更新封面");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const coverDeleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNotebookCover(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("已移除封面相片");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // 隱藏 file input — click 先觸發
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [coverTargetId, setCoverTargetId] = useState<number | null>(null);
  const openCoverPicker = (id: number) => {
    setCoverTargetId(id);
    coverFileInputRef.current?.click();
  };
  const handleCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || coverTargetId == null) return;
    coverUploadMutation.mutate({ id: coverTargetId, file });
    setCoverTargetId(null);
  };

  return (
    <main className="min-h-full max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">📓 記事簿</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/notebooks/search"
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
          >
            🔎 搜尋
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded-lg hover:opacity-90"
          >
            + 新增
          </button>
        </div>
      </div>

      <section className="mb-4 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋記事簿…"
          className="w-full px-4 py-2 border border-border rounded-lg bg-background"
        />
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          顯示已封存
        </label>
      </section>

      {isLoading ? (
        <Loading />
      ) : notebooks.length === 0 ? (
        <EmptyState message="暫時冇記事簿 — 點右上「+新增」開始" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {notebooks.map((nb) => (
            <div key={nb.id} className="group relative">
              <Link
                href={`/notebooks/detail?id=${nb.id}`}
                className="relative block aspect-[3/4] rounded-lg shadow-md hover:shadow-lg transition overflow-hidden"
                style={{ backgroundColor: nb.cover_color }}
              >
                {nb.has_cover_image && <NotebookCoverImage notebookId={nb.id} />}
                {/* 相片上加深色漸變，等白字可讀 */}
                {nb.has_cover_image && (
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                )}
                <div className="relative h-full w-full p-3 flex flex-col justify-between text-white">
                  <div className="text-2xl drop-shadow">{nb.icon || "📓"}</div>
                  <div>
                    <div className="font-semibold text-sm line-clamp-2 drop-shadow">
                      {nb.pinned && "📌 "}
                      {nb.title}
                    </div>
                    <div className="text-[11px] opacity-90 mt-1 drop-shadow">
                      {nb.page_count} 頁 · {nb.updated_at.slice(0, 10)}
                    </div>
                  </div>
                </div>
              </Link>
              {nb.tags && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {nb.tags.split(",").filter(Boolean).slice(0, 3).map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 bg-muted rounded">
                      {t.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex-wrap">
                <button
                  type="button"
                  onClick={() => pinMutation.mutate(nb)}
                  className="hover:underline"
                >
                  {nb.pinned ? "取消釘選" : "釘選"}
                </button>
                <button
                  type="button"
                  onClick={() => openCoverPicker(nb.id)}
                  className="hover:underline"
                  title="上載相片做封面"
                >
                  封面
                </button>
                {nb.has_cover_image && (
                  <button
                    type="button"
                    onClick={() => coverDeleteMutation.mutate(nb.id)}
                    className="hover:underline"
                    title="移除相片，回復純色封面"
                  >
                    移除相片
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => archiveMutation.mutate(nb)}
                  className="hover:underline"
                >
                  {nb.archived ? "還原" : "封存"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(nb.id)}
                  className="hover:underline text-red-500"
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateNotebookModal
          onCancel={() => setShowCreate(false)}
          onCreate={(payload) => createMutation.mutate(payload)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除記事簿"
        message="確定要刪除？連同所有頁面一齊刪。"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverFile}
      />
    </main>
  );
}

function CreateNotebookModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (payload: NotebookCreate) => void;
}) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("📓");
  const [color, setColor] = useState(COVER_PALETTE[0]);
  const [template, setTemplate] = useState("blank");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg p-5 w-full max-w-sm space-y-3">
        <h2 className="font-semibold text-lg">新增記事簿</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="名稱"
          autoFocus
          className="w-full px-3 py-2 border border-border rounded bg-background"
        />
        <div>
          <div className="text-xs text-muted-foreground mb-1">Icon (emoji)</div>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 3))}
            className="w-20 px-3 py-2 border border-border rounded bg-background text-center text-xl"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">封面顏色</div>
          <div className="flex flex-wrap gap-2">
            {COVER_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">預設紙張</div>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded bg-background"
          >
            <option value="blank">空白</option>
            <option value="ruled">橫線</option>
            <option value="grid">方格</option>
            <option value="dot">點陣</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-border rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!title.trim()}
            onClick={() =>
              onCreate({
                title: title.trim(),
                icon,
                cover_color: color,
                default_template: template,
              })
            }
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded disabled:opacity-50"
          >
            建立
          </button>
        </div>
      </div>
    </div>
  );
}
