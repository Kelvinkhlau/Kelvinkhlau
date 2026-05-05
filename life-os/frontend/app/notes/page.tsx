"use client";

/**
 * Notes list page — 顯示筆記列表，點擊進入 detail page 查看/編輯。
 */

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Note, type NoteContentFormat } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const ENCRYPTED_TITLE_PLACEHOLDER = "🔒 加密筆記";

/** 抽出筆記預覽文字 */
function extractPreview(content: string, format: NoteContentFormat | undefined): string {
  if (!content) return "";
  if (format === "blocks") {
    try {
      const doc = JSON.parse(content) as { content?: unknown[] };
      const lines: string[] = [];
      const walk = (node: unknown): string => {
        if (!node || typeof node !== "object") return "";
        const n = node as { type?: string; text?: string; content?: unknown[] };
        if (n.type === "text" && typeof n.text === "string") return n.text;
        if (Array.isArray(n.content)) return n.content.map(walk).join("");
        return "";
      };
      if (Array.isArray(doc.content)) {
        for (const block of doc.content) {
          const text = walk(block).trim();
          if (text) lines.push(text);
          if (lines.length >= 3) break;
        }
      }
      return lines.join(" · ");
    } catch {
      return "";
    }
  }
  return content.replace(/^#{1,6}\s+/gm, "").replace(/[*_`]/g, "").slice(0, 150);
}

export default function NotesPage() {
  const queryClient = useQueryClient();
  const [filterFolder, setFilterFolder] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", { filterFolder, search, showArchived }],
    queryFn: () => {
      const params: Record<string, string | boolean> = { archived: showArchived };
      if (filterFolder) params.folder = filterFolder;
      if (search) params.q = search;
      return api.listNotes(params as Parameters<typeof api.listNotes>[0]);
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["noteFolders"],
    queryFn: () => api.listNoteFolders(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNote(id),
    onMutate: async (id) => {
      const key = ["notes", { filterFolder, search, showArchived }];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (old) => old?.filter((n) => n.id !== id));
      return { prev, key };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev && ctx.key) queryClient.setQueryData(ctx.key, ctx.prev);
      toast.error((e as Error).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["noteFolders"] });
      toast.success("已刪除");
    },
  });

  const pinMutation = useMutation({
    mutationFn: (note: Note) => api.updateNote(note.id, { pinned: !note.pinned }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Note[]>(
        ["notes", { filterFolder, search, showArchived }],
        (old) => old?.map((n) => (n.id === updated.id ? updated : n))
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveMutation = useMutation({
    mutationFn: (note: Note) => api.updateNote(note.id, { archived: !note.archived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">📝 知識庫</h1>
      </div>

      {/* Search + filters */}
      <section className="mb-4 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋筆記…"
          className="w-full px-4 py-2 border border-border rounded-lg bg-background"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterFolder}
            onChange={(e) => setFilterFolder(e.target.value)}
            className="px-2 py-1 text-sm border border-border rounded bg-background"
          >
            <option value="">全部 folder</option>
            {folders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            顯示已封存
          </label>
        </div>
      </section>

      {/* New note button */}
      <Link
        href="/notes/detail"
        className="block w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition text-center"
      >
        + 新增筆記
      </Link>

      {/* Notes list */}
      <section className="space-y-2">
        {isLoading ? (
          <Loading />
        ) : notes.length === 0 ? (
          <EmptyState message="暫時冇筆記" />
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="border border-border rounded-lg hover:bg-muted/50 transition"
            >
              <Link
                href={`/notes/detail?id=${note.id}`}
                className="block p-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  {note.pinned && <span className="text-xs" title="已釘選">📌</span>}
                  {note.is_encrypted && <span className="text-xs" title="已加密">🔒</span>}
                  <h3 className="font-medium truncate">
                    {note.is_encrypted ? ENCRYPTED_TITLE_PLACEHOLDER : note.title}
                  </h3>
                </div>
                {!note.is_encrypted && (() => {
                  const preview = extractPreview(note.content, note.content_format);
                  return preview ? (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {preview}
                    </p>
                  ) : null;
                })()}
                {note.is_encrypted && (
                  <p className="text-xs text-muted-foreground mb-2 italic">
                    內容已加密 — 點擊解鎖查看
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {note.folder && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                      {note.folder}
                    </span>
                  )}
                  {note.tags && note.tags.split(",").map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-muted rounded">{t.trim()}</span>
                  ))}
                  <span>{note.updated_at.slice(0, 10)}</span>
                  {note.attachments && note.attachments.length > 0 && (
                    <span>📎 {note.attachments.length}</span>
                  )}
                </div>
              </Link>
              {/* Action buttons */}
              <div className="flex items-center gap-3 px-4 pb-3 text-xs">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); pinMutation.mutate(note); }}
                  className="hover:underline text-muted-foreground"
                >
                  {note.pinned ? "取消釘選" : "📌 釘選"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); archiveMutation.mutate(note); }}
                  className="hover:underline text-muted-foreground"
                >
                  {note.archived ? "還原" : "封存"}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setDeleteTarget(note.id); }}
                  className="hover:underline text-red-500"
                >
                  刪除
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除筆記"
        message="確定要刪除呢個筆記？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
