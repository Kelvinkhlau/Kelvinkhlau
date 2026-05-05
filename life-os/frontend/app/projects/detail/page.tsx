"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Project, type ProjectStatus, type Todo, type TodoUpdate } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { pushRecent } from "@/lib/recents";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "進行中" },
  { value: "paused", label: "暫停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
];

const PRIORITY_LABELS: Record<"low" | "medium" | "high", string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_COLORS: Record<"low" | "medium" | "high", string> = {
  high: "text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300",
  medium: "text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300",
  low: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
};

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  // datetime-local 冇 timezone，new Date 會 parse 成 local time，toISOString 轉 UTC
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function ProjectDetailContent() {
  const searchParams = useSearchParams();
  const id = Number(searchParams.get("id"));
  const queryClient = useQueryClient();

  // 新增表單
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<"low" | "medium" | "high">("medium");
  const [newTodoDue, setNewTodoDue] = useState("");
  const [newFormExpanded, setNewFormExpanded] = useState(false);

  // 修改
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high">("medium");
  const [editDue, setEditDue] = useState("");

  // 刪除
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const validId = Number.isFinite(id) && id > 0;

  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
  } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.getProject(id),
    enabled: validId,
  });

  const { data: todos = [], isLoading: todosLoading } = useQuery({
    queryKey: ["project-todos", id],
    queryFn: () => api.listTodos({ project_id: id }),
    enabled: validId,
  });

  // Track project as recent for ⌘K palette
  useEffect(() => {
    if (project) {
      pushRecent({
        kind: "entity",
        href: `/projects/detail?id=${project.id}`,
        title: project.name || "(未命名)",
        entityType: "project",
      });
    }
  }, [project?.id]);

  const createTodoMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      project_id: number;
      priority?: "low" | "medium" | "high";
      due_at?: string | null;
    }) => api.createTodo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-todos", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTodoTitle("");
      setNewTodoDue("");
      setNewTodoPriority("medium");
      setNewFormExpanded(false);
      toast.success("已新增");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: (todo: Todo) => api.updateTodo(todo.id, { done: !todo.done }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Todo[]>(["project-todos", id], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      );
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ todoId, payload }: { todoId: number; payload: TodoUpdate }) =>
      api.updateTodo(todoId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<Todo[]>(["project-todos", id], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      );
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setEditId(null);
      toast.success("已更新");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (todoId: number) => api.deleteTodo(todoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-todos", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => api.updateProject(id, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Project>(["project", id], updated);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleCreateTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !project) return;
    createTodoMutation.mutate({
      title: newTodoTitle.trim(),
      project_id: project.id,
      priority: newTodoPriority,
      due_at: newTodoDue ? localInputToIso(newTodoDue) : null,
    });
  };

  function startEdit(t: Todo) {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description ?? "");
    setEditPriority(t.priority);
    setEditDue(isoToLocalInput(t.due_at));
  }

  function cancelEdit() {
    setEditId(null);
  }

  function submitEdit() {
    if (editId === null) return;
    if (!editTitle.trim()) {
      toast.error("標題唔可以空白");
      return;
    }
    updateMutation.mutate({
      todoId: editId,
      payload: {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        due_at: editDue ? localInputToIso(editDue) : null,
      },
    });
  }

  const isLoading = projectLoading || todosLoading;

  if (!validId) {
    return (
      <main className="p-8">
        <div className="mt-4 text-red-600">無效 project id</div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-full p-4 max-w-2xl mx-auto">
        <Loading />
      </main>
    );
  }

  if (projectError || !project) {
    return (
      <main className="p-8">
        <div className="mt-4 text-muted-foreground">找不到 project</div>
      </main>
    );
  }

  const progress =
    project.todo_count > 0
      ? Math.round((project.done_count / project.todo_count) * 100)
      : 0;

  return (
    <main className="min-h-full p-4 max-w-2xl mx-auto">
      <header className="border-b border-border pb-4 mb-4">
        <h1 className="text-xl font-bold mb-2">{project.name}</h1>
        {project.description && (
          <p className="text-sm text-muted-foreground mb-3">
            {project.description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-foreground-subtle shrink-0 mr-1">
            專案狀態
          </span>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => statusMutation.mutate(s.value)}
              className={`px-3 py-1 rounded-full border transition-colors ${
                project.status === s.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
              aria-label={`將專案狀態設為 ${s.label}`}
              title={`將呢個專案狀態設為「${s.label}」`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-foreground-subtle mt-1.5">
          揀一個按鈕去改變整個專案嘅狀態 —— 唔係 filter 下面嘅待辦。
        </p>

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

      {/* 新增表單 */}
      <form
        onSubmit={handleCreateTodo}
        className="mb-4 p-3 border border-border rounded-lg space-y-2"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            placeholder="加 todo 到呢個 project"
            className="flex-1 px-3 py-2 border border-border rounded-md bg-background"
          />
          <button
            type="button"
            onClick={() => setNewFormExpanded((v) => !v)}
            className="px-2 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-muted"
            aria-label="展開進階欄位"
            title="進階"
          >
            {newFormExpanded ? "▲" : "▾"}
          </button>
          <button
            type="submit"
            disabled={createTodoMutation.isPending || !newTodoTitle.trim()}
            className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
          >
            加
          </button>
        </div>
        {newFormExpanded && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="text-xs">
              <span className="text-muted-foreground">優先度</span>
              <select
                value={newTodoPriority}
                onChange={(e) => setNewTodoPriority(e.target.value as "low" | "medium" | "high")}
                className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-background"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">到期（可選）</span>
              <input
                type="datetime-local"
                value={newTodoDue}
                onChange={(e) => setNewTodoDue(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </label>
          </div>
        )}
      </form>

      {todos.length === 0 ? (
        <EmptyState message="未有 todo — 加個先！" />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {todos.map((todo) => {
            const isEditing = editId === todo.id;
            if (isEditing) {
              return (
                <li key={todo.id} className="p-3 bg-muted/30 space-y-3">
                  {/* 標題 */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      標題
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background"
                      placeholder="標題"
                      autoFocus
                    />
                  </div>

                  {/* 優先度 + 截止日期 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        優先度
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as "low" | "medium" | "high")}
                        className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm"
                      >
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        截止日期
                      </label>
                      <input
                        type="datetime-local"
                        value={editDue}
                        onChange={(e) => setEditDue(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm"
                      />
                    </div>
                  </div>

                  {/* 備註 */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      備註
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={8}
                      placeholder="記低其他資訊…（支援多行、表格可用空格或 tab 對齊）"
                      className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background resize-y font-mono whitespace-pre"
                      wrap="off"
                      style={{ minHeight: "10rem" }}
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-3 py-1 border border-border rounded-md text-sm hover:bg-muted"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitEdit}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1 bg-foreground text-background rounded-md text-sm disabled:opacity-50"
                    >
                      儲存
                    </button>
                  </div>
                </li>
              );
            }

            const due = formatDue(todo.due_at);
            const nowMs = Date.now();
            const dueMs = todo.due_at ? new Date(todo.due_at).getTime() : null;
            const overdue = !todo.done && dueMs !== null && dueMs < nowMs;
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
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[todo.priority]}`}
                    >
                      {PRIORITY_LABELS[todo.priority]}
                    </span>
                    <div className={todo.done ? "line-through break-words" : "break-words font-medium"}>
                      {todo.title}
                    </div>
                  </div>
                  {todo.description && (
                    <pre className="text-sm text-muted-foreground mt-1 font-mono whitespace-pre overflow-x-auto max-w-full">
                      {todo.description}
                    </pre>
                  )}
                  {due && (
                    <div
                      className={`text-xs mt-1 ${
                        overdue ? "text-red-600 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {overdue ? "⚠️ 已過期 · " : "⏰ "}
                      {due}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(todo)}
                    className="text-xs text-blue-500 hover:underline"
                    aria-label={`修改 ${todo.title}`}
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(todo.id)}
                    className="text-xs text-red-500 hover:underline"
                    aria-label={`刪除 ${todo.title}`}
                  >
                    刪除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除待辦"
        message="確定要刪除呢個待辦？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProjectDetailContent />
    </Suspense>
  );
}
