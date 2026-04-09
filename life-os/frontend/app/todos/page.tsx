"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Todo } from "@/lib/api";

const PRIORITIES: { value: "low" | "medium" | "high"; label: string; color: string }[] =
  [
    { value: "low", label: "低", color: "text-slate-500" },
    { value: "medium", label: "中", color: "text-blue-600" },
    { value: "high", label: "高", color: "text-red-600" },
  ];

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [showDone, setShowDone] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listTodos()
      .then(setTodos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await api.createTodo({ title: newTitle.trim(), priority: newPriority });
      setNewTitle("");
      setNewPriority("medium");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggle = async (todo: Todo) => {
    try {
      const updated = await api.updateTodo(todo.id, { done: !todo.done });
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定要刪除？")) return;
    try {
      await api.deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const visible = todos.filter((t) => (showDone ? true : !t.done));
  const pendingCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - pendingCount;

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Todos</h1>
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
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="要做咩？"
          className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
        />
        <select
          value={newPriority}
          onChange={(e) =>
            setNewPriority(e.target.value as "low" | "medium" | "high")
          }
          className="px-3 py-2 border border-border rounded-md bg-background text-sm"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加
        </button>
      </form>

      {/* Filter toggle */}
      <div className="flex items-center gap-3 mb-3 text-sm">
        <button
          onClick={() => setShowDone((v) => !v)}
          className={`px-3 py-1 rounded-full border ${
            showDone
              ? "bg-foreground text-background border-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          {showDone ? "隱藏已完成" : "顯示已完成"}
        </button>
        <span className="text-muted-foreground text-xs">
          未完 {pendingCount} · 已完 {doneCount}
        </span>
      </div>

      {error && (
        <div className="p-3 mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground p-8">載入中…</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
          {todos.length === 0 ? "仲未有 todo — 加個先！" : "冇嘢要做 🎉"}
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {visible.map((todo) => {
            const pri = PRIORITIES.find((p) => p.value === todo.priority);
            return (
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
                  <div
                    className={`${todo.done ? "line-through" : ""} break-words`}
                  >
                    {todo.title}
                  </div>
                  {todo.description && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {todo.description}
                    </div>
                  )}
                  {todo.due_at && (
                    <div className="text-xs text-muted-foreground mt-1">
                      📅 {new Date(todo.due_at).toLocaleString("zh-HK")}
                    </div>
                  )}
                </div>
                <span className={`text-xs ${pri?.color ?? ""}`}>
                  {pri?.label}
                </span>
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="text-xs text-red-600 hover:underline"
                  title="刪除"
                >
                  刪
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
