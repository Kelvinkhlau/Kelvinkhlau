"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Todo, type EmailDetail, type DecomposeResult, type Project } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Swipeable } from "@/components/Swipeable";

/** 郵件預覽 Modal */
function EmailPreviewModal({ emailId, onClose }: { emailId: number; onClose: () => void }) {
  const { data: email, isLoading, error } = useQuery({
    queryKey: ["email-preview", emailId],
    queryFn: () => api.getEmail(emailId),
    enabled: emailId > 0,
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height = Math.min(iframe.contentDocument.body.scrollHeight + 16, 500) + "px";
  }, []);

  useEffect(() => {
    if (!email?.body_html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    // 同 inbox/detail 一致：清洗 meta-refresh / script / iframe，防止 Taobao 等 Universal Link auto-open
    const safeHtml = email.body_html
      .replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<script\b[^>]*\/?>/gi, "")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<iframe\b[^>]*\/?>/gi, "");
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:8px;font-family:-apple-system,sans-serif;font-size:13px;line-height:1.5;word-break:break-word}img{max-width:100%;height:auto}iframe,embed,object,frame{display:none!important}a{color:#2563eb}</style></head><body>${safeHtml}</body></html>`);
    doc.close();
    doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach((el) => el.remove());
    const timer = setTimeout(adjustHeight, 300);
    return () => clearTimeout(timer);
  }, [email?.body_html, adjustHeight]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="font-bold text-sm truncate">原始郵件</h2>
          <div className="flex items-center gap-2">
            <Link href={`/inbox/detail?id=${emailId}`} className="text-xs text-blue-600 hover:underline">
              完整頁面 ↗
            </Link>
            <button onClick={onClose} aria-label="關閉" className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">載入中…</div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">載入失敗</div>
          ) : email ? (
            <div className="space-y-3">
              <h3 className="text-lg font-bold">{email.subject || "(無主題)"}</h3>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div><span className="font-medium">寄件者：</span>{email.sender}</div>
                <div><span className="font-medium">收件者：</span>{email.recipients}</div>
                <div><span className="font-medium">時間：</span>{new Date(email.received_at).toLocaleString("zh-HK")}</div>
              </div>
              <div className="border-t border-border pt-3">
                {email.body_html ? (
                  <iframe
                    ref={iframeRef}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                    className="w-full border-0"
                    style={{ minHeight: 150 }}
                    title="Email content"
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm">{email.body_text || email.snippet}</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PRIORITIES: { value: "low" | "medium" | "high"; label: string; color: string }[] =
  [
    { value: "low", label: "低", color: "text-slate-500" },
    { value: "medium", label: "中", color: "text-blue-600" },
    { value: "high", label: "高", color: "text-red-600" },
  ];

/** 單個 Todo 項目 — 可展開編輯 */
function TodoItem({
  todo,
  onToggle,
  onDelete,
  onDecompose,
  decomposing,
  projectName,
  projects,
}: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onDecompose: () => void;
  decomposing: boolean;
  projectName?: string;
  projects: Project[];
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [previewEmailId, setPreviewEmailId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState(todo.description || "");
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDueAt, setEditDueAt] = useState(
    todo.due_at ? todo.due_at.slice(0, 10) : ""
  );
  const [editProjectId, setEditProjectId] = useState<string>(
    todo.project_id !== null && todo.project_id !== undefined ? String(todo.project_id) : ""
  );

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.updateTodo(todo.id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      );
      toast.success("已更新");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = {};
    if (editTitle.trim() !== todo.title) payload.title = editTitle.trim();
    if (editDesc !== (todo.description || "")) payload.description = editDesc || null;
    const newDue = editDueAt || null;
    const oldDue = todo.due_at ? todo.due_at.slice(0, 10) : null;
    if (newDue !== oldDue) payload.due_at = editDueAt ? editDueAt + "T23:59:00" : null;
    const newProjectId = editProjectId ? Number(editProjectId) : null;
    const oldProjectId = todo.project_id ?? null;
    if (newProjectId !== oldProjectId) payload.project_id = newProjectId;
    if (Object.keys(payload).length > 0) {
      updateMutation.mutate(payload);
    }
  };

  const pri = PRIORITIES.find((p) => p.value === todo.priority);

  // 計算到期狀態
  let dueLabel = "";
  let dueColor = "text-muted-foreground";
  if (todo.due_at && !todo.done) {
    const due = new Date(todo.due_at);
    const now = new Date();
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      dueLabel = `已過期 ${Math.abs(daysLeft)} 日`;
      dueColor = "text-red-600 font-bold";
    } else if (daysLeft === 0) {
      dueLabel = "今日到期";
      dueColor = "text-red-600 font-bold";
    } else if (daysLeft <= 3) {
      dueLabel = `${daysLeft} 日後到期`;
      dueColor = "text-amber-600 font-medium";
    } else {
      dueLabel = `${daysLeft} 日後到期`;
    }
  }

  return (
    <li
      className={`border-b border-border last:border-b-0 ${
        todo.done ? "opacity-50" : ""
      }`}
    >
      <Swipeable
        onSwipeRight={onToggle}
        onSwipeLeft={onDelete}
        leftAction={{ label: "🗑 刪除", color: "bg-red-500" }}
        rightAction={{
          label: todo.done ? "↩ 未完成" : "✓ 完成",
          color: todo.done ? "bg-slate-500" : "bg-green-500",
        }}
      >
      {/* Main row */}
      <div className="flex items-start gap-3 p-3 hover:bg-muted">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0"
          aria-label={`標記 ${todo.title} 為${todo.done ? "未完成" : "已完成"}`}
        />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className={`${todo.done ? "line-through" : ""} break-words`}>
            {todo.title}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {todo.due_at && (
              <span className={`text-xs ${dueColor}`}>
                📅 {new Date(todo.due_at).toLocaleDateString("zh-HK")}
                {dueLabel && ` · ${dueLabel}`}
              </span>
            )}
            {todo.source_email_id && (
              <span className="text-xs text-purple-600">📧 來自郵件</span>
            )}
            {todo.project_id && (
              <Link
                href={`/projects/detail?id=${todo.project_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-600 hover:underline bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded"
                aria-label="查看所屬專案"
              >
                📁 {projectName || "專案"}
              </Link>
            )}
            {todo.description && !expanded && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                💬 {todo.description.split("\n")[0]}
              </span>
            )}
          </div>
        </button>
        <span className={`text-xs shrink-0 ${pri?.color ?? ""}`}>
          {pri?.label}
        </span>
        {!todo.done && (
          <button
            onClick={onDecompose}
            disabled={decomposing}
            className="text-xs text-purple-600 hover:underline disabled:opacity-40 shrink-0"
          >
            {decomposing ? "拆解中…" : "拆解"}
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline shrink-0"
        >
          刪
        </button>
      </div>
      </Swipeable>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-3 pb-3 pl-10 space-y-3 bg-muted/30">
          {/* Source email preview */}
          {todo.source_email_id && (
            <button
              onClick={() => setPreviewEmailId(todo.source_email_id!)}
              className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:underline bg-purple-50 dark:bg-purple-950/30 px-3 py-1.5 rounded"
            >
              📧 查看原始郵件
            </button>
          )}

          {/* Editable title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              標題
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background"
            />
          </div>

          {/* Due date + Project */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                截止日期
              </label>
              <input
                type="date"
                value={editDueAt}
                onChange={(e) => setEditDueAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                所屬專案
              </label>
              <select
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background"
              >
                <option value="">（無專案）</option>
                {projects
                  .filter((p) => p.status !== "archived")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Editable description / notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              備註
            </label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="記低其他資訊…（支援多行、表格可用空格或 tab 對齊）"
              rows={8}
              wrap="off"
              style={{ minHeight: "10rem" }}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded bg-background resize-y font-mono whitespace-pre"
            />
          </div>

          {/* Save button */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-1.5 text-sm bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? "儲存中…" : "儲存"}
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="px-4 py-1.5 text-sm border border-border rounded hover:bg-muted"
            >
              收起
            </button>
          </div>
        </div>
      )}
      {previewEmailId !== null && (
        <EmailPreviewModal emailId={previewEmailId} onClose={() => setPreviewEmailId(null)} />
      )}
    </li>
  );
}

export default function TodosPage() {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [showDone, setShowDone] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string>("");

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => api.listTodos(),
  });

  // 提前拎 projects 為 todo 顯示專案名 badge
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
  });
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      priority: "low" | "medium" | "high";
      project_id?: number | null;
    }) => api.createTodo(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewTitle("");
      setNewPriority("medium");
      // 保留 newProjectId 方便連續加多個 todo 去同一 project
      toast.success("已新增");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: (todo: Todo) => api.updateTodo(todo.id, { done: !todo.done }),
    // Optimistic: flip done instantly, rollback on error
    onMutate: async (todo) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const prev = queryClient.getQueryData<Todo[]>(["todos"]);
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["todos"], ctx.prev);
      toast.error((e as Error).message);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTodo(id),
    // Optimistic: remove instantly, rollback on error
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const prev = queryClient.getQueryData<Todo[]>(["todos"]);
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.filter((t) => t.id !== id)
      );
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["todos"], ctx.prev);
      toast.error((e as Error).message);
    },
    onSuccess: () => {
      toast.success("已刪除");
    },
  });

  const decomposeMutation = useMutation({
    mutationFn: (id: number) => api.decomposeTodo(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success(`已拆解為 ${result.subtasks.length} 個子任務`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      priority: newPriority,
      project_id: newProjectId ? Number(newProjectId) : null,
    });
  };

  const activeProjects = projects.filter((p) => p.status !== "archived");

  const visible = todos
    .filter((t) => (showDone ? true : !t.done))
    .filter((t) => {
      if (!filterProjectId) return true;
      if (filterProjectId === "none") return t.project_id == null;
      return t.project_id === Number(filterProjectId);
    });
  const pendingCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - pendingCount;

  return (
    <main className="min-h-full p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Todos</h1>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleCreate}
        className="mb-4 p-3 border border-border rounded-lg space-y-2"
      >
        <div className="flex gap-2">
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
        </div>
        <select
          value={newProjectId}
          onChange={(e) => setNewProjectId(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          aria-label="所屬專案"
        >
          <option value="">📂 （無專案）</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              📁 {p.name}
            </option>
          ))}
        </select>
      </form>

      {/* Filter toggle */}
      <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
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
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="px-3 py-1 rounded-full border border-border bg-background text-xs"
          aria-label="以專案篩選"
        >
          <option value="">全部專案</option>
          <option value="none">📂 無專案</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              📁 {p.name}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-xs ml-auto">
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
        <ul className="border border-border rounded-lg overflow-hidden">
          {visible.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={() => toggleMutation.mutate(todo)}
              onDelete={() => setDeleteTarget(todo.id)}
              onDecompose={() => decomposeMutation.mutate(todo.id)}
              decomposing={
                decomposeMutation.isPending &&
                decomposeMutation.variables === todo.id
              }
              projectName={todo.project_id ? projectNameById.get(todo.project_id) : undefined}
              projects={projects}
            />
          ))}
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
