"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Todo } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const PRIORITIES: { value: "low" | "medium" | "high"; label: string; color: string }[] =
  [
    { value: "low", label: "低", color: "text-slate-500" },
    { value: "medium", label: "中", color: "text-blue-600" },
    { value: "high", label: "高", color: "text-red-600" },
  ];

export default function TodosPage() {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [showDone, setShowDone] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => api.listTodos(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; priority: "low" | "medium" | "high" }) =>
      api.createTodo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTitle("");
      setNewPriority("medium");
      toast.success("已新增");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: (todo: Todo) => api.updateTodo(todo.id, { done: !todo.done }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTodo(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.filter((t) => t.id !== id)
      );
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim(), priority: newPriority });
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
          aria-label="新 todo 標題"
        />
        <select
          value={newPriority}
          onChange={(e) =>
            setNewPriority(e.target.value as "low" | "medium" | "high")
          }
          className="px-3 py-2 border border-border rounded-md bg-background text-sm"
          aria-label="優先級"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim() || createMutation.isPending}
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

      {isLoading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          message={todos.length === 0 ? "仲未有 todo — 加個先！" : "冇嘢要做"}
        />
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
                  onChange={() => toggleMutation.mutate(todo)}
                  className="mt-1 h-4 w-4"
                  aria-label={`標記 ${todo.title} 為${todo.done ? "未完成" : "已完成"}`}
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
                      {new Date(todo.due_at).toLocaleString("zh-HK")}
                    </div>
                  )}
                </div>
                <span className={`text-xs ${pri?.color ?? ""}`}>
                  {pri?.label}
                </span>
                <button
                  onClick={() => setDeleteTarget(todo.id)}
                  className="text-xs text-red-600 hover:underline"
                  aria-label={`刪除 ${todo.title}`}
                >
                  刪
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除 Todo"
        message="確定要刪除呢個 todo？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
