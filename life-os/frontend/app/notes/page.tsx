"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Note } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Markdown } from "@/components/Markdown";

export default function NotesPage() {
  const queryClient = useQueryClient();
  const [filterFolder, setFilterFolder] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Editor state
  const [editing, setEditing] = useState<Note | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");

  // View / delete state
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["notes", { filterFolder, search, showArchived }],
    queryFn: () => {
      const params: Record<string, string | boolean> = {
        archived: showArchived,
      };
      if (filterFolder) params.folder = filterFolder;
      if (search) params.q = search;
      return api.listNotes(params as Parameters<typeof api.listNotes>[0]);
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["noteFolders"],
    queryFn: () => api.listNoteFolders(),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { title: string; content: string; folder: string; tags: string }) =>
      editing
        ? api.updateNote(editing.id, payload)
        : api.createNote(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["noteFolders"] });
      setShowNew(false);
      setEditing(null);
      toast.success(editing ? "已更新" : "已儲存");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNote(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Note[]>(
        ["notes", { filterFolder, search, showArchived }],
        (old) => old?.filter((n) => n.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["noteFolders"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openEditor = (note?: Note) => {
    if (note) {
      setEditing(note);
      setTitle(note.title);
      setContent(note.content);
      setFolder(note.folder);
      setTags(note.tags);
    } else {
      setEditing(null);
      setTitle("");
      setContent("");
      setFolder("");
      setTags("");
    }
    setShowNew(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    saveMutation.mutate({ title, content, folder, tags });
  };

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">📝 知識庫</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
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
              <option key={f} value={f}>
                {f}
              </option>
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

      {/* New note button / editor */}
      {!showNew ? (
        <button
          type="button"
          onClick={() => openEditor()}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增筆記
        </button>
      ) : (
        <form
          onSubmit={handleSave}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="標題"
            className="w-full px-3 py-2 border border-border rounded bg-background font-medium"
            autoFocus
            required
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="內容（支援 Markdown）…"
            rows={8}
            className="w-full px-3 py-2 border border-border rounded bg-background font-mono text-sm"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder（例：技術）"
              className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
              list="folder-options"
            />
            <datalist id="folder-options">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags（逗號分隔）"
              className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {saveMutation.isPending ? "儲存中…" : editing ? "更新" : "儲存"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNew(false);
                setEditing(null);
              }}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* Note viewer */}
      {viewingNote && !showNew && (
        <div className="mb-4 p-4 border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{viewingNote.title}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  openEditor(viewingNote);
                  setViewingNote(null);
                }}
                className="text-sm px-3 py-1 border border-border rounded hover:bg-muted"
              >
                編輯
              </button>
              <button
                onClick={() => setViewingNote(null)}
                className="text-sm px-3 py-1 border border-border rounded hover:bg-muted"
              >
                關閉
              </button>
            </div>
          </div>
          {viewingNote.content ? (
            <Markdown content={viewingNote.content} />
          ) : (
            <p className="text-sm text-muted-foreground">（空白）</p>
          )}
        </div>
      )}

      {/* Notes list */}
      <section className="space-y-2">
        {notesLoading ? (
          <Loading />
        ) : notes.length === 0 ? (
          <EmptyState message="暫時冇筆記" />
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-4 border border-border rounded-lg hover:bg-muted/50 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {note.pinned && (
                      <span className="text-xs" title="已釘選">
                        📌
                      </span>
                    )}
                    <h3
                      className="font-medium truncate cursor-pointer hover:text-blue-600"
                      onClick={() => setViewingNote(note)}
                    >
                      {note.title}
                    </h3>
                  </div>
                  {note.content && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {note.content.slice(0, 150)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {note.folder && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {note.folder}
                      </span>
                    )}
                    {note.tags &&
                      note.tags.split(",").map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 bg-muted rounded"
                        >
                          {t.trim()}
                        </span>
                      ))}
                    <span>{note.updated_at.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => pinMutation.mutate(note)}
                    className="text-xs hover:underline"
                    title={note.pinned ? "取消釘選" : "釘選"}
                    aria-label={note.pinned ? "取消釘選" : "釘選"}
                  >
                    {note.pinned ? "unpin" : "pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveMutation.mutate(note)}
                    className="text-xs hover:underline"
                    aria-label={note.archived ? "還原筆記" : "封存筆記"}
                  >
                    {note.archived ? "還原" : "封存"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(note.id)}
                    className="text-xs text-red-500 hover:underline"
                    aria-label={`刪除 ${note.title}`}
                  >
                    刪除
                  </button>
                </div>
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
