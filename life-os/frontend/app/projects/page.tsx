"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Project, type ProjectStatus } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "進行中" },
  { value: "paused", label: "暫停" },
  { value: "done", label: "完成" },
  { value: "archived", label: "封存" },
];

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<ProjectStatus | "all">("active");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", filter],
    queryFn: () =>
      api.listProjects(filter === "all" ? undefined : { status: filter }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string }) => api.createProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewName("");
      toast.success("已新增");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Project[]>(["projects", filter], (old) =>
        old?.filter((p) => p.id !== id)
      );
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() });
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
          disabled={!newName.trim() || createMutation.isPending}
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

      {isLoading ? (
        <Loading />
      ) : projects.length === 0 ? (
        <EmptyState message="仲未有 project — 加個先！" />
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
                    onClick={() => setDeleteTarget(project.id)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                    aria-label={`刪除 ${project.name}`}
                  >
                    刪
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除 Project"
        message="確定要刪除？佢下面嘅 todos 會變成無 project 嘅孤兒。"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
