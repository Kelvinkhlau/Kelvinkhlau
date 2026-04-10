"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Project, type ProjectStatus } from "@/lib/api";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "進行中" },
  { value: "paused", label: "暫停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<ProjectStatus | "all">("active");

  const load = () => {
    setLoading(true);
    api
      .listProjects(filter === "all" ? undefined : { status: filter })
      .then(setProjects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.createProject({ name: newName.trim() });
      setNewName("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定要刪除？佢下面嘅 todos 會變成無 project 嘅孤兒。")) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleCreate}
        className="flex gap-2 mb-4 p-3 border border-border rounded-lg"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Project 名"
          className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加
        </button>
      </form>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full border ${
            filter === "all"
              ? "bg-foreground text-background border-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          全部
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1 rounded-full border ${
              filter === s.value
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground p-8">載入中…</div>
      ) : projects.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          仲未有 project — 加個先！
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {projects.map((project) => {
            const statusLabel =
              STATUSES.find((s) => s.value === project.status)?.label ??
              project.status;
            const progress =
              project.todo_count > 0
                ? Math.round((project.done_count / project.todo_count) * 100)
                : 0;
            return (
              <li key={project.id} className="hover:bg-muted">
                <div className="p-4 flex items-start gap-3">
                  {project.color && (
                    <span
                      className="mt-1 inline-block w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.color }}
                      aria-hidden
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/projects/detail?id=${project.id}`}
                      className="block"
                    >
                      <div className="font-medium break-words">
                        {project.name}
                      </div>
                      {project.description && (
                        <div className="text-sm text-muted-foreground mt-1 break-words">
                          {project.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                        <span>{statusLabel}</span>
                        <span>·</span>
                        <span>
                          {project.done_count}/{project.todo_count} ({progress}%)
                        </span>
                      </div>
                      {project.todo_count > 0 && (
                        <div className="mt-2 h-1 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </Link>
                  </div>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                    title="刪除"
                  >
                    刪
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
