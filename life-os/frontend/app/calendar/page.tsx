"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CalendarEvent, type CalendarEventCreate } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateTimePicker } from "@/components/DateTimePicker";

/* ─── 分類 + 顏色 ─── */

const CATEGORIES = [
  { value: "personal", label: "私人", color: "#3b82f6" },
  { value: "work", label: "公司", color: "#ef4444" },
  { value: "family", label: "家庭", color: "#22c55e" },
  { value: "friends", label: "朋友", color: "#f59e0b" },
  { value: "other", label: "其他", color: "#8b5cf6" },
] as const;

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const RECURRENCE_OPTIONS = [
  { value: "", label: "不重複" },
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每星期" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
  { value: "weekdays", label: "平日（一至五）" },
];

const VISIBILITY_OPTIONS = [
  { value: "default", label: "預設" },
  { value: "public", label: "公開" },
  { value: "private", label: "私人" },
];

function getCategoryColor(ev: CalendarEvent): string {
  return CATEGORY_MAP[ev.category]?.color || ev.color || "#3b82f6";
}

/* ─── 日期工具 ─── */

type ViewMode = "month" | "week" | "day";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toLocalDatetime(d: Date): string {
  return `${toDateStr(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function nowLocal(): string {
  return toLocalDatetime(new Date());
}

function oneHourLater(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return toLocalDatetime(d);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 星期日為一週第一日
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function getRange(mode: ViewMode, anchor: Date): { from: Date; to: Date; label: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  if (mode === "month") {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startDay = first.getDay(); // 0 = Sunday
    const from = new Date(y, m, 1 - startDay);
    const endDay = last.getDay();
    const to = new Date(y, m + 1, 0 + (6 - endDay));
    return { from, to, label: `${y}年${m + 1}月` };
  }

  if (mode === "week") {
    const dow = anchor.getDay(); // 0 = Sunday
    const from = new Date(y, m, d - dow);
    const to = new Date(y, m, d - dow + 6);
    return {
      from,
      to,
      label: `${from.getMonth() + 1}月${from.getDate()}日 – ${to.getMonth() + 1}月${to.getDate()}日`,
    };
  }

  return {
    from: new Date(y, m, d),
    to: new Date(y, m, d),
    label: anchor.toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }),
  };
}

function navigate(mode: ViewMode, anchor: Date, delta: number): Date {
  const d = new Date(anchor);
  if (mode === "month") d.setMonth(d.getMonth() + delta);
  else if (mode === "week") d.setDate(d.getDate() + delta * 7);
  else d.setDate(d.getDate() + delta);
  return d;
}

/* ─── 頁面主體 ─── */

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(nowLocal());
  const [endAt, setEndAt] = useState(oneHourLater());
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("personal");
  const [recurrence, setRecurrence] = useState("");
  const [visibility, setVisibility] = useState("default");
  const [busy, setBusy] = useState(true);
  const [reminders, setReminders] = useState("10");

  const range = useMemo(() => getRange(viewMode, anchor), [viewMode, anchor]);
  const fromStr = toDateStr(range.from);
  const toStr = toDateStr(range.to);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events", fromStr, toStr],
    queryFn: () => api.listCalendarEvents({ date_from: fromStr, date_to: toStr }),
  });

  // Filter by category
  const filteredEvents = useMemo(() => {
    if (!filterCategory) return events;
    return events.filter((ev) => ev.category === filterCategory);
  }, [events, filterCategory]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((ev) => {
      const key = toDateStr(new Date(ev.start_at));
      (map[key] = map[key] || []).push(ev);
    });
    return map;
  }, [filteredEvents]);

  const syncMutation = useMutation({
    mutationFn: () => api.syncCalendar({ days: 60 }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success(`已同步：${r.new} 新 / ${r.updated} 更新`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CalendarEventCreate) => api.createCalendarEvent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("已新增");
      resetForm();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CalendarEventCreate> }) =>
      api.updateCalendarEvent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("已更新");
      resetForm();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCalendarEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditEvent(null);
    setTitle("");
    setStartAt(nowLocal());
    setEndAt(oneHourLater());
    setAllDay(false);
    setLocation("");
    setDescription("");
    setCategory("personal");
    setRecurrence("");
    setVisibility("default");
    setBusy(true);
    setReminders("10");
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditEvent(ev);
    setTitle(ev.title);
    setStartAt(toLocalDatetime(new Date(ev.start_at)));
    setEndAt(toLocalDatetime(new Date(ev.end_at)));
    setAllDay(ev.all_day);
    setLocation(ev.location || "");
    setDescription(ev.description || "");
    setCategory(ev.category || "personal");
    setRecurrence(ev.recurrence || "");
    setVisibility(ev.visibility || "default");
    setBusy(ev.busy);
    setReminders(ev.reminders || "10");
    setShowForm(true);
  };

  const openCreateOnDate = (dateStr: string) => {
    const d = new Date(dateStr + "T09:00");
    resetForm();
    setStartAt(toLocalDatetime(d));
    d.setHours(d.getHours() + 1);
    setEndAt(toLocalDatetime(d));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const catColor = CATEGORY_MAP[category]?.color || "#3b82f6";
    const payload: CalendarEventCreate = {
      title: title.trim(),
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      all_day: allDay,
      description: description || null,
      location: location || null,
      category,
      color: catColor,
      recurrence: recurrence || null,
      visibility,
      busy,
      reminders: reminders || null,
    };
    if (editEvent) {
      updateMutation.mutate({ id: editEvent.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const todayStr = toDateStr(new Date());

  return (
    <main className="min-h-full p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-auto">行事曆</h1>
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="text-sm px-3 py-1.5 bg-foreground text-background rounded font-medium disabled:opacity-50"
        >
          {syncMutation.isPending ? "同步中…" : "Sync"}
        </button>
      </div>

      {/* View mode + navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex border border-border rounded overflow-hidden text-sm">
          {(["month", "week", "day"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 ${
                viewMode === mode
                  ? "bg-foreground text-background font-medium"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {mode === "month" ? "月" : mode === "week" ? "週" : "日"}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => setAnchor(navigate(viewMode, anchor, -1))} className="px-2.5 py-1 border border-border rounded hover:bg-muted text-lg leading-none">‹</button>
        <button type="button" onClick={() => setAnchor(new Date())} className="px-3 py-1 border border-border rounded hover:bg-muted text-sm">今日</button>
        <button type="button" onClick={() => setAnchor(navigate(viewMode, anchor, 1))} className="px-2.5 py-1 border border-border rounded hover:bg-muted text-lg leading-none">›</button>

        <span className="text-base font-semibold ml-2">{range.label}</span>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          onClick={() => setFilterCategory("")}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            filterCategory === "" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
          }`}
        >
          全部
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(filterCategory === cat.value ? "" : cat.value)}
            className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
              filterCategory === cat.value ? "ring-2 ring-offset-1 font-medium" : "hover:bg-muted"
            }`}
            style={{
              borderColor: cat.color,
              color: filterCategory === cat.value ? "white" : cat.color,
              backgroundColor: filterCategory === cat.value ? cat.color : "transparent",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: filterCategory === cat.value ? "white" : cat.color }} />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Add event */}
      {!showForm && (
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="w-full mb-4 p-2.5 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition text-sm"
        >
          + 新增事項
        </button>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">{editEvent ? "編輯事項" : "新增事項"}</h3>
            <button type="button" onClick={resetForm} aria-label="關閉" className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題" className="w-full px-3 py-2 border border-border rounded bg-background" autoFocus required />

          {/* 日期時間 — 自訂大尺寸 picker */}
          <div className="flex gap-2 items-end flex-wrap lg:flex-nowrap">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs text-muted-foreground">開始</label>
              <DateTimePicker
                value={allDay ? startAt.slice(0, 10) : startAt}
                dateOnly={allDay}
                onChange={(v) => {
                  const val = allDay ? v + "T00:00" : v;
                  setStartAt(val);
                  const d = new Date(val);
                  if (!isNaN(d.getTime())) {
                    d.setHours(d.getHours() + 1);
                    setEndAt(allDay ? v + "T23:59" : toLocalDatetime(d));
                  }
                }}
                className="mt-1"
              />
            </div>
            <span className="text-sm text-muted-foreground pb-3.5 hidden lg:block">至</span>
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs text-muted-foreground">結束</label>
              <DateTimePicker
                value={allDay ? endAt.slice(0, 10) : endAt}
                dateOnly={allDay}
                onChange={(v) => setEndAt(allDay ? v + "T23:59" : v)}
                className="mt-1"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-3.5 whitespace-nowrap">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="rounded" />
              全日
            </label>
          </div>

          {/* 分類 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">分類</label>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition ${
                    category === cat.value ? "text-white font-medium" : "hover:opacity-80"
                  }`}
                  style={{
                    borderColor: cat.color,
                    backgroundColor: category === cat.value ? cat.color : "transparent",
                    color: category === cat.value ? "white" : cat.color,
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category === cat.value ? "white" : cat.color }} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 重複 + 可見度 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">重複</label>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">可見度</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">狀態</label>
              <select value={busy ? "busy" : "free"} onChange={(e) => setBusy(e.target.value === "busy")} className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm">
                <option value="busy">忙碌</option>
                <option value="free">有空</option>
              </select>
            </div>
          </div>

          {/* 地點 + 提醒 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地點（選填）" className="w-full px-3 py-2 border border-border rounded bg-background text-sm" />
            </div>
            <div className="w-32">
              <input type="text" value={reminders} onChange={(e) => setReminders(e.target.value)} placeholder="提醒（分鐘）" className="w-full px-3 py-2 border border-border rounded bg-background text-sm" title="提醒時間（分鐘），多個用逗號分隔" />
            </div>
          </div>

          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="備註（選填）" rows={2} className="w-full px-3 py-2 border border-border rounded bg-background text-sm" />

          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 py-2 bg-foreground text-background rounded font-medium text-sm disabled:opacity-50">
              {(createMutation.isPending || updateMutation.isPending) ? "儲存中…" : editEvent ? "更新" : "建立"}
            </button>
            {editEvent && (
              <button type="button" onClick={() => setDeleteTarget(editEvent.id)} className="px-4 py-2 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-sm">刪除</button>
            )}
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-border rounded hover:bg-muted text-sm">取消</button>
          </div>
        </form>
      )}

      {isLoading && <Loading />}

      {!isLoading && viewMode === "month" && (
        <MonthGrid anchor={anchor} eventsByDate={eventsByDate} todayStr={todayStr} onClickDate={(ds) => { setViewMode("day"); setAnchor(new Date(ds)); }} onClickEvent={openEdit} />
      )}

      {!isLoading && viewMode === "week" && (
        <WeekGrid range={range} eventsByDate={eventsByDate} todayStr={todayStr} onClickDate={openCreateOnDate} onClickEvent={openEdit} />
      )}

      {!isLoading && viewMode === "day" && (
        <DayList dateStr={toDateStr(anchor)} events={eventsByDate[toDateStr(anchor)] || []} onClickEvent={openEdit} onAdd={() => openCreateOnDate(toDateStr(anchor))} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除事項"
        message="確定要刪除呢個行事曆事項？會同步刪除 Google Calendar。"
        onConfirm={() => {
          if (deleteTarget !== null) { deleteMutation.mutate(deleteTarget); if (editEvent?.id === deleteTarget) resetForm(); }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

/* ─── Month Grid ─── */

function MonthGrid({ anchor, eventsByDate, todayStr, onClickDate, onClickEvent }: {
  anchor: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  todayStr: string;
  onClickDate: (ds: string) => void;
  onClickEvent: (ev: CalendarEvent) => void;
}) {
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  // 星期日 = 0 → first day of week
  const startPad = first.getDay();
  const endPad = 6 - last.getDay();

  const days: Date[] = [];
  for (let i = -startPad; i <= last.getDate() - 1 + endPad; i++) {
    days.push(new Date(y, m, 1 + i));
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted text-xs text-center font-medium">
        {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-border">
          {week.map((day) => {
            const ds = toDateStr(day);
            const isToday = ds === todayStr;
            const isMonth = day.getMonth() === m;
            const evs = eventsByDate[ds] || [];
            return (
              <div key={ds} onClick={() => onClickDate(ds)} className={`min-h-[80px] p-1 border-r border-border last:border-r-0 cursor-pointer hover:bg-muted/50 transition ${!isMonth ? "opacity-35" : ""}`}>
                <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5 ${isToday ? "bg-blue-600 text-white" : ""}`}>{day.getDate()}</div>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((ev) => {
                    const color = getCategoryColor(ev);
                    return (
                      <button key={ev.id} type="button" onClick={(e) => { e.stopPropagation(); onClickEvent(ev); }}
                        className="w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded truncate hover:opacity-80"
                        style={{ backgroundColor: color + "20", color, borderLeft: `3px solid ${color}` }}
                      >
                        {ev.all_day ? "" : formatTime(ev.start_at) + " "}{ev.title}
                      </button>
                    );
                  })}
                  {evs.length > 3 && <div className="text-[10px] text-muted-foreground text-center">+{evs.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── Week Grid ─── */

function WeekGrid({ range, eventsByDate, todayStr, onClickDate, onClickEvent }: {
  range: ReturnType<typeof getRange>;
  eventsByDate: Record<string, CalendarEvent[]>;
  todayStr: string;
  onClickDate: (ds: string) => void;
  onClickEvent: (ev: CalendarEvent) => void;
}) {
  const days: Date[] = [];
  const c = new Date(range.from);
  while (c <= range.to) { days.push(new Date(c)); c.setDate(c.getDate() + 1); }

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const ds = toDateStr(day);
        const isToday = ds === todayStr;
        const evs = eventsByDate[ds] || [];
        return (
          <div key={ds} className={`border border-border rounded-lg overflow-hidden ${isToday ? "ring-2 ring-blue-500" : ""}`}>
            <div className={`px-2 py-1.5 text-center text-sm font-medium ${isToday ? "bg-blue-600 text-white" : "bg-muted"}`}>
              <div className="text-xs opacity-70">{WEEKDAYS[day.getDay()]}</div>
              <div>{day.getDate()}</div>
            </div>
            <div className="p-1 min-h-[120px] space-y-1">
              {evs.length === 0 ? (
                <button type="button" onClick={() => onClickDate(ds)} className="w-full h-full min-h-[100px] text-muted-foreground text-xs hover:bg-muted rounded transition">+</button>
              ) : evs.map((ev) => {
                const color = getCategoryColor(ev);
                return (
                  <button key={ev.id} type="button" onClick={() => onClickEvent(ev)}
                    className="w-full text-left p-1.5 rounded hover:opacity-80 transition"
                    style={{ backgroundColor: color + "15", borderLeft: `3px solid ${color}` }}
                  >
                    <div className="text-[11px]" style={{ color }}>{ev.all_day ? "全日" : formatTime(ev.start_at)}</div>
                    <div className="text-xs font-medium truncate">{ev.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Day List ─── */

function DayList({ dateStr, events, onClickEvent, onAdd }: {
  dateStr: string;
  events: CalendarEvent[];
  onClickEvent: (ev: CalendarEvent) => void;
  onAdd: () => void;
}) {
  const dayLabel = new Date(dateStr).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">{dayLabel}</h2>
      {events.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground mb-3">今日冇行程</p>
          <button type="button" onClick={onAdd} className="text-sm px-4 py-2 bg-foreground text-background rounded">+ 新增</button>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const color = getCategoryColor(ev);
            const catLabel = CATEGORY_MAP[ev.category]?.label || ev.category;
            return (
              <button key={ev.id} type="button" onClick={() => onClickEvent(ev)} className="w-full text-left p-4 border border-border rounded-lg hover:bg-muted transition">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-16 text-right">
                    {ev.all_day ? <span className="text-sm font-medium" style={{ color }}>全日</span> : (
                      <div><div className="text-sm font-medium">{formatTime(ev.start_at)}</div><div className="text-xs text-muted-foreground">{formatTime(ev.end_at)}</div></div>
                    )}
                  </div>
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ev.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: color + "20", color }}>{catLabel}</span>
                      {ev.recurrence && <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">重複</span>}
                      {!ev.busy && <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">有空</span>}
                    </div>
                    {ev.location && <div className="text-sm text-muted-foreground mt-0.5">{ev.location}</div>}
                    {ev.conference_url && <a href={ev.conference_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-blue-600 hover:underline mt-0.5 block">加入視像會議</a>}
                    {ev.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{ev.description}</div>}
                    {ev.status === "tentative" && <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 rounded">暫定</span>}
                  </div>
                </div>
              </button>
            );
          })}
          <button type="button" onClick={onAdd} className="w-full p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition text-sm">+ 新增事項</button>
        </div>
      )}
    </div>
  );
}
