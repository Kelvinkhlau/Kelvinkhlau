"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Project, type ProjectStatus, type Todo } from "@/lib/api";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "進行中" },
  { value: "paused", label: "暫停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
];

function ProjectDetailContent() {
  const searchParams = useSearchParams();
  const id = Number(searchParams.get("id"));

  const [project, setProject] = useState<Project | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("無效 project id");
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([api.getProject(id), api.listTodos({ project_id: id })])
      .then(([p, ts]) => {
        setProject(p);
        setTodos(ts);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !project) return;
    setSaving(true);
    try {
      const t = await api.createTodo({
        title: newTodoTitle.trim(),
        project_id: project.id,
      });
      setTodos((prev) => [t, ...prev]);
      setNewTodoTitle("");
      // refresh counts
      const updated = await api.getProject(project.id);
      setProject(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (todo: Todo) => {
    try {
      const updated = await api.updateTodo(todo.id, { done: !todo.done });
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
      if (project) {
        const p = await api.getProject(project.id);
        setProject(p);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStatusChange = async (status: ProjectStatus) => {
    if (!project) return;
    try {
      const updated = await api.updateProject(project.id, { status });
      setProject(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <main className="p-8">載入中…</main>;
  if (error)
    return (
      <main className="p-8">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">
          ← 返回 Projects
        </Link>
        <div className="mt-4 text-red-600">錯誤：{error}</div>
      </main>
    );
  if (!project) return <main className="p-8">找不到 project</main>;

  const progress =
    project.todo_count > 0
      ? Math.round((project.done_count / project.todo_count) * 100)
      : 0;

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">
          ← 返回 Projects
        </Link>
      </div>

      <header className="border-b border-border pb-4 mb-4">
        <h1 className="text-xl font-bold mb-2">{project.name}</h1>
        {project.description && (
          <p className="text-sm text-muted-foreground mb-3">
            {project.description}
          </p>
        )}

        <div className="flex gap-2 flex-wrap text-sm">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`px-3 py-1 rounded-full border ${
                project.status === s.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground mt-3">
          {project.done_count}/{project.todo_count} 完成 ({progress}%)
        </div>
        {project.todo_count > 0 && (
          <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </header>

      <form
        onSubmit={handleCreateTodo}
        className="flex gap-2 mb-4 p-3 border border-border rounded-lg"
      >
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          placeholder="加 todo 到呢個 project"
          className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
        />
        <button
          type="submit"
          disabled={saving || !newTodoTitle.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加
        </button>
      </form>

      {todos.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          未有 todo — 加個先！
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`flex items-start gap-3 p-3 hover:bg-muted ${
                todo.done ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => handleToggle(todo)}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1 min-w-0">
                <div className={todo.done ? "line-through break-words" : "break-words"}>
                  {todo.title}
                </div>
                {todo.description && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {todo.description}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<main className="p-8">載入中…</main>}>
      <ProjectDetailContent />
    </Suspense>
  );
}
