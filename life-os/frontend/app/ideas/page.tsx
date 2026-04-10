"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Idea } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function IdeasPage() {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["ideas", { archived: showArchived, q: search || undefined }],
    queryFn: () =>
      api.listIdeas({
        archived: showArchived,
        q: search || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string }) => api.createIdea(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      setNewTitle("");
      toast.success("已新增");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pinMutation = useMutation({
    mutationFn: (idea: Idea) =>
      api.updateIdea(idea.id, { pinned: !idea.pinned }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Idea[]>(
        ["ideas", { archived: showArchived, q: search || undefined }],
        (old) => old?.map((i) => (i.id === updated.id ? updated : i))
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveMutation = useMutation({
    mutationFn: (idea: Idea) =>
      api.updateIdea(idea.id, { archived: !idea.archived }),
    onSuccess: (_, idea) => {
      queryClient.setQueryData<Idea[]>(
        ["ideas", { archived: showArchived, q: search || undefined }],
        (old) => old?.filter((i) => i.id !== idea.id)
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteIdea(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Idea[]>(
        ["ideas", { archived: showArchived, q: search || undefined }],
        (old) => old?.filter((i) => i.id !== id)
      );
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim() });
  };

  return (
    <main className="min-h-screen p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Ideas</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Quick add */}
      <form
        onSubmit={handleCreate}
        className="flex gap-2 mb-4 p-3 border border-border rounded-lg"
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="記低個 idea…"
          className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || createMutation.isPending}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加
        </button>
      </form>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋…"
          className="px-3 py-1 border border-border rounded-md bg-background text-sm w-40"
        />
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`px-3 py-1 rounded-full border text-sm ${
            showArchived
              ? "bg-foreground text-background border-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          {showArchived ? "睇返進行中" : "睇已封存"}
        </button>
      </div>

      {isLoading ? (
        <Loading />
      ) : ideas.length === 0 ? (
        <EmptyState
          message={search ? "搵唔到嘢" : "仲未有 idea — 加個先！"}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className={`border rounded-lg p-4 flex flex-col gap-2 hover:shadow-md transition ${
                idea.pinned
                  ? "border-blue-400 bg-blue-50/30"
                  : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium break-words flex-1">
                  {idea.pinned && (
                    <span className="text-blue-600 mr-1" title="已釘選">
                      *
                    </span>
                  )}
                  {idea.title}
                </h3>
              </div>

              {idea.content && (
                <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                  {idea.content}
                </p>
              )}

              {idea.tags && (
                <div className="flex gap-1 flex-wrap">
                  {idea.tags.split(",").map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-auto pt-2 text-xs">
                <button
                  onClick={() => pinMutation.mutate(idea)}
                  className={`hover:underline ${
                    idea.pinned ? "text-blue-600" : "text-muted-foreground"
                  }`}
                  aria-label={idea.pinned ? `取消釘選 ${idea.title}` : `釘選 ${idea.title}`}
                >
                  {idea.pinned ? "取消釘選" : "釘選"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => archiveMutation.mutate(idea)}
                  className="text-muted-foreground hover:underline"
                  aria-label={idea.archived ? `取消封存 ${idea.title}` : `封存 ${idea.title}`}
                >
                  {idea.archived ? "取消封存" : "封存"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => setDeleteTarget(idea.id)}
                  className="text-red-600 hover:underline"
                  aria-label={`刪除 ${idea.title}`}
                >
                  刪
                </button>
                <span className="ml-auto text-muted-foreground">
                  {new Date(idea.updated_at).toLocaleDateString("zh-HK")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除 Idea"
        message="確定要刪除呢個 idea？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
