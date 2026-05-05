"use client";

/**
 * /today — 每日起跑點（Personal OS 首頁）
 *
 * 設計：
 *   - 揀幾件 todos pin 為「今日 focus」— 一眼睇晒最重要嘅嘢
 *   - 顯示今日行程 + 未讀重要 email + 小 metrics
 *   - 建議清單：overdue / due today 嘅 todos，一 click 加入 focus
 *   - Check ✓ focus todo → 同步 mark done（optimistic）
 *   - ⌘K 切換去 palette 跳任何地方；⌘N 加新 todo
 *
 * 無 drag-drop（MVP scope），但有 reorder API 可以之後加。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DailyFocus, type TodayResponse, type Todo } from "@/lib/api";
import { Loading } from "@/components/Loading";
import { Card, Badge, PageShell, PageHeader } from "@/components/ui";
import { toast } from "@/components/Toast";
import { usePaletteContext } from "@/components/command/paletteContext";
import {
  CheckSquare,
  Check,
  Circle,
  Plus,
  X,
  Calendar,
  Mail,
  Clock,
  Flame,
  AlertCircle,
  Sparkles,
  ArrowRight,
  iconProps,
  iconSize,
} from "@/components/icons";

function formatHeaderDate(): string {
  return new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}

export default function TodayPage() {
  const qc = useQueryClient();
  const { openCapture } = usePaletteContext();
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    setDateStr(formatHeaderDate());
  }, []);

  const { data, isLoading } = useQuery<TodayResponse>({
    queryKey: ["today"],
    queryFn: () => api.today(),
  });

  // ─── Mutations ─────────────────────────────────────────────

  const pinMutation = useMutation({
    mutationFn: (todoId: number) => api.addFocus(todoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today"] });
      toast("已 pin 到今日 focus", { type: "success" });
    },
    onError: (e) => {
      toast(e instanceof Error ? e.message : "加 focus 失敗");
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (focusId: number) => api.removeFocus(focusId),
    onMutate: async (focusId: number) => {
      await qc.cancelQueries({ queryKey: ["today"] });
      const prev = qc.getQueryData<TodayResponse>(["today"]);
      if (prev) {
        qc.setQueryData<TodayResponse>(["today"], {
          ...prev,
          focuses: prev.focuses.filter((f) => f.id !== focusId),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["today"], ctx.prev);
      toast("取消 focus 失敗");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["today"] }),
  });

  const toggleDoneMutation = useMutation({
    mutationFn: ({ todoId, done }: { todoId: number; done: boolean }) =>
      api.updateTodo(todoId, { done }),
    onMutate: async ({ todoId, done }) => {
      await qc.cancelQueries({ queryKey: ["today"] });
      const prev = qc.getQueryData<TodayResponse>(["today"]);
      if (prev) {
        qc.setQueryData<TodayResponse>(["today"], {
          ...prev,
          focuses: prev.focuses.map((f) =>
            f.todo && f.todo.id === todoId
              ? { ...f, todo: { ...f.todo, done } }
              : f,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["today"], ctx.prev);
      toast("更新失敗");
    },
    onSuccess: (_r, { done }) => {
      if (done) toast("做完嘅感覺真好 ✓", { type: "success" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const focuses = data?.focuses ?? [];
  const events = data?.events ?? [];
  const importantEmails = data?.important_emails ?? [];
  const suggested = data?.suggested_todos ?? [];
  const stats = data?.stats;

  const doneCount = useMemo(
    () => focuses.filter((f) => f.todo?.done).length,
    [focuses],
  );

  return (
    <PageShell>
      <PageHeader
        title="今日"
        subtitle={dateStr || "\u00a0"}
        actions={
          stats && stats.streak_days > 0 ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-warning-soft text-warning-strong text-caption font-medium">
              <Flame {...iconProps} size={iconSize.sm} />
              {stats.streak_days} 日連續
            </div>
          ) : undefined
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <>
          {/* ─── Focus section ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-subhead text-foreground">今日 Focus</h2>
                {focuses.length > 0 && (
                  <span className="text-caption text-foreground-subtle">
                    {doneCount} / {focuses.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => openCapture("todo")}
                className="text-caption text-accent hover:text-accent-strong inline-flex items-center gap-1"
              >
                <Plus {...iconProps} size={iconSize.sm} />
                新增 todo
              </button>
            </div>

            {focuses.length === 0 ? (
              <Card padding="lg" className="text-center">
                <Sparkles
                  {...iconProps}
                  size={iconSize["2xl"]}
                  className="mx-auto text-accent mb-2"
                />
                <div className="text-body text-foreground mb-1">
                  揀幾件今日要搞掂嘅嘢
                </div>
                <div className="text-caption text-foreground-muted">
                  {suggested.length > 0
                    ? "由下面「建議」揀幾個，或者新增 todo"
                    : "去 /todos 揀 todo 加入 focus"}
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {focuses.map((f) => (
                  <FocusRow
                    key={f.id}
                    focus={f}
                    onToggleDone={(done) => {
                      if (f.todo)
                        toggleDoneMutation.mutate({ todoId: f.todo.id, done });
                    }}
                    onUnpin={() => unpinMutation.mutate(f.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ─── Suggested (overdue + due today, not yet pinned) ─── */}
          {suggested.length > 0 && (
            <section>
              <SectionHeader title="建議加入 focus" />
              <div className="space-y-2">
                {suggested.slice(0, 5).map((t) => (
                  <SuggestedRow
                    key={t.id}
                    todo={t}
                    onPin={() => pinMutation.mutate(t.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── Today grid: events + emails ─────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <SectionHeader
                title="今日行程"
                href="/calendar"
                count={events.length}
              />
              {events.length === 0 ? (
                <EmptyBox message="今日冇行程" />
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 6).map((ev) => (
                    <Card
                      key={ev.id}
                      padding="sm"
                      className="flex items-center gap-3"
                    >
                      <div className="shrink-0 w-20 text-right text-caption text-foreground-muted text-numeric">
                        {ev.all_day
                          ? "全日"
                          : `${formatTime(ev.start_at)}-${formatTime(ev.end_at)}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-body font-medium truncate">
                          {ev.title}
                        </div>
                        {ev.location && (
                          <div className="text-caption text-foreground-subtle truncate">
                            {ev.location}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader
                title="未讀重要"
                href="/inbox?category=important"
                count={stats?.unread_important ?? 0}
              />
              {importantEmails.length === 0 ? (
                <EmptyBox message="冇未讀重要信件" />
              ) : (
                <div className="space-y-2">
                  {importantEmails.slice(0, 6).map((e) => (
                    <Link
                      key={e.id}
                      href={`/inbox/detail?id=${e.id}`}
                      className="block"
                    >
                      <Card interactive padding="sm">
                        <div className="text-body font-medium truncate">
                          {e.subject}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-caption text-foreground-subtle truncate max-w-[60%]">
                            {e.sender}
                          </span>
                          <span className="text-caption text-foreground-subtle shrink-0">
                            {timeAgo(e.received_at)}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ─── Stats strip ────────────────────────────────── */}
          {stats && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              <StatPill
                label="已完成"
                value={stats.todos_done_today}
                tone="success"
              />
              <StatPill
                label="未完 todos"
                value={stats.todos_open_total}
                tone="accent"
              />
              <StatPill
                label="Overdue"
                value={stats.todos_overdue}
                tone={stats.todos_overdue > 0 ? "danger" : "muted"}
              />
              <StatPill
                label="今日行程"
                value={stats.events_today}
                tone="info"
              />
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

/* ─── Sub-components ───────────────────────────────────────── */

function FocusRow({
  focus,
  onToggleDone,
  onUnpin,
}: {
  focus: DailyFocus;
  onToggleDone: (done: boolean) => void;
  onUnpin: () => void;
}) {
  const t = focus.todo;
  if (!t) return null;
  return (
    <Card
      padding="sm"
      className="flex items-center gap-3 group"
    >
      <button
        onClick={() => onToggleDone(!t.done)}
        aria-label={t.done ? "取消完成" : "標為完成"}
        className="shrink-0 w-6 h-6 rounded-full border-2 border-border flex items-center justify-center transition-colors hover:border-accent"
      >
        {t.done ? (
          <Check {...iconProps} size={iconSize.sm} className="text-accent" />
        ) : (
          <Circle
            {...iconProps}
            size={iconSize.md}
            className="opacity-0 group-hover:opacity-20 text-foreground-muted"
          />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-body font-medium truncate ${
            t.done ? "line-through text-foreground-subtle" : "text-foreground"
          }`}
        >
          {t.title}
        </div>
        {t.due_at && (
          <div className="text-caption text-foreground-subtle">
            <Clock
              {...iconProps}
              size={iconSize.xs}
              className="inline -mt-0.5 mr-0.5"
            />
            截止：{new Date(t.due_at).toLocaleDateString("zh-TW")}
          </div>
        )}
      </div>
      {t.priority === "high" && (
        <Badge variant="danger" size="sm">
          高
        </Badge>
      )}
      <button
        onClick={onUnpin}
        aria-label="取消 focus"
        className="shrink-0 w-8 h-8 rounded-sm opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-danger hover:bg-danger-soft transition-all flex items-center justify-center"
      >
        <X {...iconProps} size={iconSize.sm} />
      </button>
    </Card>
  );
}

function SuggestedRow({ todo, onPin }: { todo: Todo; onPin: () => void }) {
  const overdue =
    todo.due_at != null && new Date(todo.due_at).getTime() < Date.now();
  return (
    <Card
      padding="sm"
      className="flex items-center gap-3 group"
    >
      {overdue ? (
        <AlertCircle
          {...iconProps}
          size={iconSize.md}
          className="text-danger shrink-0"
        />
      ) : (
        <CheckSquare
          {...iconProps}
          size={iconSize.md}
          className="text-foreground-muted shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium truncate">{todo.title}</div>
        {todo.due_at && (
          <div
            className={`text-caption ${
              overdue ? "text-danger" : "text-foreground-subtle"
            }`}
          >
            {overdue ? "逾期：" : "今日截止："}
            {new Date(todo.due_at).toLocaleDateString("zh-TW")}
          </div>
        )}
      </div>
      <button
        onClick={onPin}
        className="shrink-0 h-8 px-3 text-caption font-medium text-accent hover:bg-accent-soft hover:text-accent-strong rounded-sm transition-colors inline-flex items-center gap-1"
      >
        <Plus {...iconProps} size={iconSize.sm} />
        Pin
      </button>
    </Card>
  );
}

function SectionHeader({
  title,
  href,
  count,
}: {
  title: string;
  href?: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-subhead text-foreground">{title}</h2>
        {count != null && count > 0 && (
          <span className="text-caption text-foreground-subtle">{count}</span>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="text-caption text-accent hover:text-accent-strong hover:underline inline-flex items-center gap-1 transition-colors"
        >
          查看全部
          <ArrowRight {...iconProps} size={iconSize.xs} />
        </Link>
      )}
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="text-center text-body text-foreground-muted p-6 border border-dashed border-border-subtle rounded-md">
      {message}
    </div>
  );
}

type StatTone = "accent" | "success" | "danger" | "info" | "muted";
const statPillCls: Record<StatTone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  muted: "bg-muted text-foreground-muted",
};

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: StatTone;
}) {
  return (
    <div className={`rounded-md p-3 ${statPillCls[tone]}`}>
      <div className="text-heading font-semibold text-numeric">{value}</div>
      <div className="text-caption opacity-80 mt-0.5">{label}</div>
    </div>
  );
}
