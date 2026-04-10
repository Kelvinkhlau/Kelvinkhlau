"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Idea } from "@/lib/api";

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listIdeas({
        archived: showArchived,
        q: search || undefined,
      })
      .then(setIdeas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [showArchived, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await api.createIdea({ title: newTitle.trim() });
      setNewTitle("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePin = async (idea: Idea) => {
    try {
      const updated = await api.updateIdea(idea.id, { pinned: !idea.pinned });
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? updated : i)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleArchive = async (idea: Idea) => {
    try {
      await api.updateIdea(idea.id, { archived: !idea.archived });
      setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定要刪除？")) return;
    try {
      await api.deleteIdea(id);
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
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
          disabled={!newTitle.trim()}
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

      {error && (
        <div className="p-3 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground p-8">載入中…</div>
      ) : ideas.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          {search ? "搵唔到嘢" : "仲未有 idea — 加個先！"}
        </div>
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
                  onClick={() => handlePin(idea)}
                  className={`hover:underline ${
                    idea.pinned ? "text-blue-600" : "text-muted-foreground"
                  }`}
                >
                  {idea.pinned ? "取消釘選" : "釘選"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => handleArchive(idea)}
                  className="text-muted-foreground hover:underline"
                >
                  {idea.archived ? "取消封存" : "封存"}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() => handleDelete(idea.id)}
                  className="text-red-600 hover:underline"
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
    </main>
  );
}
