"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Project, type ProjectStatus, type Todo } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "進行中" },
  { value: "paused", label: "暫停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
];

function ProjectDetailContent() {
  const searchParams = useSearchParams();
  const id = Number(searchParams.get("id"));
  const queryClient = useQueryClient();
  const [newTodoTitle, setNewTodoTitle] = useState("");

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

  const createTodoMutation = useMutation({
    mutationFn: (payload: { title: string; project_id: number }) =>
      api.createTodo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-todos", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      setNewTodoTitle("");
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
    });
  };

  const isLoading = projectLoading || todosLoading;

  if (!validId) {
    return (
      <main className="p-8">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">
          ← 返回 Projects
        </Link>
        <div className="mt-4 text-red-600">無效 project id</div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="min-h-screen p-4 max-w-2xl mx-auto">
        <div className="mb-4">
          <Link href="/projects" className="text-sm text-blue-600 hover:underline">
            ← 返回 Projects
          </Link>
        </div>
        <Loading />
      </main>
    );
  }

  if (projectError || !project) {
    return (
      <main className="p-8">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">
          ← 返回 Projects
        </Link>
        <div className="mt-4 text-muted-foreground">找不到 project</div>
      </main>
    );
  }

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
              onClick={() => statusMutation.mutate(s.value)}
              className={`px-3 py-1 rounded-full border ${
                project.status === s.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
              aria-label={`狀態設為${s.label}`}
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
          disabled={createTodoMutation.isPending || !newTodoTitle.trim()}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加
        </button>
      </form>

      {todos.length === 0 ? (
        <EmptyState message="未有 todo — 加個先！" />
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
                onChange={() => toggleMutation.mutate(todo)}
                className="mt-1 h-4 w-4"
                aria-label={`標記 ${todo.title} 為${todo.done ? "未完成" : "已完成"}`}
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
    <Suspense fallback={<Loading />}>
      <ProjectDetailContent />
    </Suspense>
  );
}
