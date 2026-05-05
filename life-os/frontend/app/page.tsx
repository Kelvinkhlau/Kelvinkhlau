"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type Todo,
  type CalendarEvent,
  type Email,
  type ExpenseStats,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { Card, Badge, PageShell } from "@/components/ui";
import {
  ArrowRight,
  iconProps,
  iconSize,
} from "@/components/icons";
import { WidgetPicker } from "@/components/WidgetPicker";
import {
  loadDisabledWidgets,
  saveDisabledWidgets,
  isWidgetEnabled,
  type WidgetId,
} from "@/lib/widgets";
import {
  getDisplayName,
  getWeatherLocation,
  type WeatherLocation,
} from "@/lib/preferences";
import { fetchWeather, type WeatherSummary } from "@/lib/weather";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDateHeader(d: Date): string {
  return d.toLocaleDateString("zh-TW", {
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

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

type PriorityVariant = "danger" | "info" | "neutral";
function priorityBadge(p: string): { text: string; variant: PriorityVariant } {
  switch (p) {
    case "high":
      return { text: "高", variant: "danger" };
    case "medium":
      return { text: "中", variant: "info" };
    default:
      return { text: "低", variant: "neutral" };
  }
}

function greetingWord(h: number): string {
  // 早上: 5-12 → 早晨
  // 下午: 12-18 → 午安
  // 晚上: 其餘時間 → 晚上好
  if (h >= 5 && h < 12) return "早晨";
  if (h >= 12 && h < 18) return "午安";
  return "晚上好";
}

type TodoFilter = "all" | "today" | "upcoming" | "high";
type EventFilter = "today" | "week" | "month";

function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  // ─── Clock tick (every 30s)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ─── User prefs (displayName + weatherLocation)
  const [displayName, setDisplayNameState] = useState<string>("");
  const [weatherLoc, setWeatherLocState] = useState<WeatherLocation | null>(null);
  useEffect(() => {
    setDisplayNameState(getDisplayName());
    setWeatherLocState(getWeatherLocation());
  }, []);

  // ─── Widget picker
  const [disabledWidgets, setDisabledWidgets] = useState<Set<WidgetId>>(new Set());
  useEffect(() => {
    setDisabledWidgets(loadDisabledWidgets());
  }, []);
  const handleWidgetChange = (next: Set<WidgetId>) => {
    setDisabledWidgets(next);
    saveDisabledWidgets(next);
  };
  const show = (id: WidgetId) => isWidgetEnabled(id, disabledWidgets);

  // ─── Todo + Event pill filters
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("today");

  // ═══ Queries ═══
  const { data: weather } = useQuery<WeatherSummary>({
    queryKey: ["weather", weatherLoc?.lat, weatherLoc?.lng],
    queryFn: () => fetchWeather(weatherLoc!.lat, weatherLoc!.lng),
    enabled: !!weatherLoc,
    staleTime: 15 * 60 * 1000, // 15min
    retry: 1,
  });

  const { data: emailStats, isLoading: statsLoading } = useQuery({
    queryKey: ["emailStats"],
    queryFn: () => api.emailStats(),
  });

  const { data: todos, isLoading: todosLoading } = useQuery({
    queryKey: ["todos", { done: false }],
    queryFn: () => api.listTodos({ done: false }),
  });

  // 一次過 query 返呢個月嘅所有 event，再喺 client side 分 今天/本週/本月
  const monthRange = useMemo(() => {
    const today = new Date();
    const from = localDateStr(today);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from, to: localDateStr(endOfMonth) };
  }, []);
  const { data: monthEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events-month", monthRange.from, monthRange.to],
    queryFn: () =>
      api.listCalendarEvents({
        date_from: monthRange.from,
        date_to: monthRange.to,
      }),
  });

  const { data: importantEmails, isLoading: emailsLoading } = useQuery({
    queryKey: ["emails", "important-unread", "all"],
    queryFn: () =>
      api.listEmails({
        source: "all", // 包埋 iCloud + Gmail
        category: "important",
        unread_only: true,
        limit: 5,
      }),
  });

  // Expense: MTD 開支
  const { data: expenseStats } = useQuery<ExpenseStats>({
    queryKey: ["expenses-stats-month", "expense"],
    queryFn: () =>
      api.expenseStats({
        txn_type: "expense",
        date_from: monthStartStr(),
        date_to: todayDateStr(),
      }),
  });

  // Expense: MTD 收入
  const { data: incomeStats } = useQuery<ExpenseStats>({
    queryKey: ["expenses-stats-month", "income"],
    queryFn: () =>
      api.expenseStats({
        txn_type: "income",
        date_from: monthStartStr(),
        date_to: todayDateStr(),
      }),
  });

  const pendingTodos = useMemo(
    () =>
      (todos ?? [])
        .filter((t: Todo) => !t.done)
        .sort((a: Todo, b: Todo) => {
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.priority] - order[b.priority];
        }),
    [todos],
  );

  const filteredTodos = useMemo(() => {
    if (todoFilter === "high") {
      return pendingTodos.filter((t) => t.priority === "high");
    }
    if (todoFilter === "today") {
      return pendingTodos.filter((t) => t.due_at && daysUntil(t.due_at) <= 0);
    }
    if (todoFilter === "upcoming") {
      return pendingTodos.filter(
        (t) => t.due_at && daysUntil(t.due_at) > 0 && daysUntil(t.due_at) <= 7,
      );
    }
    return pendingTodos;
  }, [pendingTodos, todoFilter]);

  const highPriCount = pendingTodos.filter((t) => t.priority === "high").length;
  const todoCount = pendingTodos.length;

  // Event filter buckets
  const todayKey = localDateStr();
  const weekEndKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return localDateStr(d);
  }, []);
  const eventsToday = monthEvents.filter(
    (e) => e.start_at.slice(0, 10) === todayKey,
  );
  const eventsWeek = monthEvents.filter((e) => {
    const k = e.start_at.slice(0, 10);
    return k >= todayKey && k <= weekEndKey;
  });
  const eventsMonth = monthEvents.filter(
    (e) => e.start_at.slice(0, 10) >= todayKey,
  );
  const filteredEvents =
    eventFilter === "today"
      ? eventsToday
      : eventFilter === "week"
      ? eventsWeek
      : eventsMonth;

  const isInitialLoading =
    statsLoading && todosLoading && eventsLoading && !emailStats && !todos;

  // Greeting construction
  const greet = now ? greetingWord(now.getHours()) : "";
  const heroLine =
    greet && displayName
      ? `${greet} ${displayName}`
      : greet
      ? greet
      : "\u00a0";

  const todoSection = show("todos") ? (
    <div>
      <div className="flex items-center justify-between mb-3 pl-1">
        <h2 className="text-label-caps">待辦事項</h2>
        <Link
          href="/todos"
          className="text-caption text-foreground-muted hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          全部
          <ArrowRight {...iconProps} size={iconSize.xs} />
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PillFilter
          active={todoFilter === "all"}
          label="全部"
          count={pendingTodos.length}
          onClick={() => setTodoFilter("all")}
        />
        <PillFilter
          active={todoFilter === "today"}
          label="今日"
          count={
            pendingTodos.filter((t) => t.due_at && daysUntil(t.due_at) <= 0).length
          }
          onClick={() => setTodoFilter("today")}
        />
        <PillFilter
          active={todoFilter === "upcoming"}
          label="即將"
          count={
            pendingTodos.filter(
              (t) => t.due_at && daysUntil(t.due_at) > 0 && daysUntil(t.due_at) <= 7,
            ).length
          }
          onClick={() => setTodoFilter("upcoming")}
        />
        <PillFilter
          active={todoFilter === "high"}
          label="要緊"
          count={highPriCount}
          onClick={() => setTodoFilter("high")}
        />
      </div>

      {todosLoading ? (
        <Loading />
      ) : !filteredTodos.length ? (
        <EmptyBox message="冇項目" />
      ) : (
        <div className="space-y-1.5">
          {filteredTodos.slice(0, 8).map((todo: Todo) => {
            const p = priorityBadge(todo.priority);
            return (
              <Link key={todo.id} href="/todos" className="block">
                <Card
                  interactive
                  padding="sm"
                  className="flex items-center gap-3"
                >
                  <div className="w-5 h-5 rounded-full border-2 border-border-strong shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-body font-medium truncate">
                      {todo.title}
                    </div>
                    {todo.due_at && (
                      <div className="text-caption text-foreground-subtle">
                        {new Date(todo.due_at).toLocaleDateString("zh-TW", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    )}
                  </div>
                  <Badge variant={p.variant} size="sm">
                    {p.text}
                  </Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  const calendarSection = show("events") ? (
    <div>
      <div className="flex items-center justify-between mb-3 pl-1">
        <h2 className="text-label-caps">行事曆</h2>
        <Link
          href="/calendar"
          className="text-caption text-foreground-muted hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          全部
          <ArrowRight {...iconProps} size={iconSize.xs} />
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PillFilter
          active={eventFilter === "today"}
          label="今天"
          count={eventsToday.length}
          onClick={() => setEventFilter("today")}
        />
        <PillFilter
          active={eventFilter === "week"}
          label="本週"
          count={eventsWeek.length}
          onClick={() => setEventFilter("week")}
        />
        <PillFilter
          active={eventFilter === "month"}
          label="本月"
          count={eventsMonth.length}
          onClick={() => setEventFilter("month")}
        />
      </div>

      {eventsLoading ? (
        <Loading />
      ) : filteredEvents.length === 0 ? (
        <EmptyBox
          message={
            eventFilter === "today"
              ? "今日冇行程"
              : eventFilter === "week"
              ? "本週冇行程"
              : "本月冇行程"
          }
        />
      ) : (
        <div className="space-y-1.5">
          {filteredEvents.slice(0, 8).map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <PageShell maxWidth="xl">
      {/* ═════════════ Hero: greeting on left (always), clock + mini cal on right (md+) ═════════════ */}
      <section className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6 pt-0">
        {/* Greeting + weather pill + subtitle — always full-width on mobile, flex-1 on desktop */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h1 className="m-0 text-3xl md:text-4xl font-semibold leading-none tracking-tight text-foreground">
              {heroLine}
            </h1>
            {weatherLoc && (
              <WeatherPill weather={weather} location={weatherLoc.label} />
            )}
          </div>

          <p className="text-body text-foreground-muted mt-3">
            <span className="text-foreground-subtle">
              {now ? formatDateHeader(now) : ""}
            </span>
            {now && " · "}
            {highPriCount > 0
              ? `${highPriCount} 件要緊事、${todoCount} 件總計`
              : todoCount > 0
              ? `${todoCount} 件事排住隊、冇急`
              : "今日好平靜"}
          </p>

        </div>

        {/* Clock + mini calendar — stacks below greeting on mobile, side-by-side on md+ */}
        <div className="flex items-start gap-3 shrink-0 self-start justify-center md:justify-start w-full md:w-auto">
          <RoundClock time={now} />
          <div className="flex flex-col gap-2 items-end">
            <MiniMonthCalendar
              today={now ?? new Date()}
              eventDates={new Set(
                monthEvents.map((e) => e.start_at.slice(0, 10)),
              )}
            />
            <WidgetPicker disabled={disabledWidgets} onChange={handleWidgetChange} />
          </div>
        </div>
      </section>

      {isInitialLoading && <Loading />}

      {/* ═════════════ 1) Calendar + Todos — two-column on md+ ═════════════ */}
      {(calendarSection || todoSection) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {calendarSection}
          {todoSection}
        </section>
      )}

      {/* ═════════════ 2) Emails — important unread ═════════════ */}
      {show("emails") && (
        <section>
          <SectionHeader title="未讀重要郵件" href="/inbox?category=important" />
          {emailsLoading ? (
            <Loading />
          ) : !importantEmails?.items?.length ? (
            <EmptyBox message="冇未讀重要信件" />
          ) : (
            <div className="space-y-1.5">
              {importantEmails.items.map((email: Email) => (
                <Link
                  key={email.id}
                  href={`/inbox/detail?id=${email.id}`}
                  className="block"
                >
                  <Card interactive padding="sm">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-ice-strong mt-2 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-body font-medium truncate">
                          {email.subject}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-caption text-foreground-subtle truncate max-w-[60%]">
                            {email.sender}
                          </span>
                          <span className="text-caption text-foreground-subtle shrink-0">
                            {timeAgo(email.received_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═════════════ 3) Expenses — MTD expense + income (side-by-side) + category chart ═════════════ */}
      {(show("expenses_trend") || show("expenses_category")) && (
        <section>
          <SectionHeader title="本月財務" href="/finance" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 開支 */}
            <Card padding="md" className="flex flex-col gap-2">
              <div className="text-label-caps text-foreground-subtle">本月開支</div>
              <div className="text-2xl font-semibold text-numeric tracking-tight text-foreground">
                $
                {(expenseStats?.total ?? 0).toLocaleString("zh-HK", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-caption text-foreground-muted">
                {expenseStats?.count ?? 0} 筆交易
              </div>
            </Card>

            {/* 收入 */}
            <Card padding="md" className="flex flex-col gap-2">
              <div className="text-label-caps text-foreground-subtle">本月收入</div>
              <div className="text-2xl font-semibold text-numeric tracking-tight text-success-strong">
                +$
                {(incomeStats?.total ?? 0).toLocaleString("zh-HK", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div className="text-caption text-foreground-muted">
                {incomeStats?.count ?? 0} 筆交易
              </div>
            </Card>
          </div>

          {/* Category chart */}
          {expenseStats && Object.keys(expenseStats.by_category).length > 0 && (
            <div className="mt-3">
              <Card padding="md">
                <div className="text-label-caps mb-3 text-foreground-subtle">
                  消費分類
                </div>
                <CategoryChart
                  data={expenseStats.by_category}
                  total={expenseStats.total}
                />
              </Card>
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════════════════════ */

/** Weather inline pill —— 放喺 greeting 旁邊嘅 compact pill */
function WeatherPill({
  weather,
  location,
}: {
  weather: WeatherSummary | undefined;
  location: string;
}) {
  return (
    <Link
      href="/settings"
      title={`${location} · 按一下改地區`}
      className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-ice-soft text-ice-strong shadow-raised-sm hover:shadow-raised transition-all"
    >
      <span className="text-base" aria-hidden>
        {weather?.icon ?? "🌡️"}
      </span>
      {weather ? (
        <>
          <span className="text-sm font-semibold text-numeric text-foreground">
            {Math.round(weather.tempC)}°
          </span>
          <span className="text-caption text-ice-strong/90">
            {weather.label}
          </span>
          <span className="text-caption text-foreground-muted">· {location}</span>
        </>
      ) : (
        <span className="text-caption text-ice-strong">{location} · 讀取中</span>
      )}
    </Link>
  );
}

/** Round analog clock —— matches mini calendar vertical footprint, placed to LEFT of it */
function RoundClock({ time }: { time: Date | null }) {
  const size = 160;
  if (!time) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-surface shadow-raised-sm"
        aria-hidden
      />
    );
  }
  const h = time.getHours() % 12;
  const m = time.getMinutes();
  const s = time.getSeconds();
  const hourAngle = (h + m / 60) * 30;
  const minAngle = (m + s / 60) * 6;
  const secAngle = s * 6;

  const timeLabel = time.toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-surface shadow-raised flex items-center justify-center relative shrink-0"
      role="img"
      aria-label={`現時 ${timeLabel}`}
    >
      <div className="absolute inset-2 rounded-full bg-background shadow-inset" />
      <svg viewBox="0 0 72 72" className="w-[88%] h-[88%] relative">
        {/* 12 tick marks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const outer = 30;
          const inner = i % 3 === 0 ? 25 : 27;
          const x1 = 36 + Math.sin(angle) * inner;
          const y1 = 36 - Math.cos(angle) * inner;
          const x2 = 36 + Math.sin(angle) * outer;
          const y2 = 36 - Math.cos(angle) * outer;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={
                i % 3 === 0
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--foreground-subtle))"
              }
              strokeWidth={i % 3 === 0 ? "1.5" : "0.75"}
              strokeLinecap="round"
            />
          );
        })}
        {/* hour hand */}
        <line
          x1="36"
          y1="36"
          x2={36 + Math.sin((hourAngle * Math.PI) / 180) * 14}
          y2={36 - Math.cos((hourAngle * Math.PI) / 180) * 14}
          stroke="hsl(var(--foreground))"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        {/* minute hand */}
        <line
          x1="36"
          y1="36"
          x2={36 + Math.sin((minAngle * Math.PI) / 180) * 22}
          y2={36 - Math.cos((minAngle * Math.PI) / 180) * 22}
          stroke="hsl(var(--foreground))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* second hand */}
        <line
          x1="36"
          y1="36"
          x2={36 + Math.sin((secAngle * Math.PI) / 180) * 24}
          y2={36 - Math.cos((secAngle * Math.PI) / 180) * 24}
          stroke="hsl(var(--ice-strong))"
          strokeWidth="0.75"
          strokeLinecap="round"
        />
        <circle
          cx="36"
          cy="36"
          r="2.25"
          fill="hsl(var(--foreground))"
          stroke="hsl(var(--surface))"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

/** Compact month calendar — Sunday-first, today highlighted, event dots */
function MiniMonthCalendar({
  today,
  eventDates,
}: {
  today: Date;
  eventDates: Set<string>;
}) {
  const [viewDate, setViewDate] = useState(today);
  useEffect(() => {
    setViewDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.toDateString()]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Sunday-first: first.getDay() 本身 Sunday=0
  const firstWeekday = first.getDay();
  const daysInMonth = last.getDate();
  const todayKey = today.toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = viewDate.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
  });

  return (
    <Card
      padding="none"
      className="w-[200px] shrink-0 p-2"
    >
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[11px] font-semibold tracking-tight">{monthLabel}</span>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="上一月"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-5 h-5 rounded-sm hover:bg-muted flex items-center justify-center text-foreground-muted transition-colors text-[11px]"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="今日"
            onClick={() => setViewDate(new Date())}
            className="text-[9px] px-1 h-5 rounded-sm hover:bg-muted text-foreground-muted transition-colors"
          >
            今
          </button>
          <button
            type="button"
            aria-label="下一月"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-5 h-5 rounded-sm hover:bg-muted flex items-center justify-center text-foreground-muted transition-colors text-[11px]"
          >
            ›
          </button>
        </div>
      </div>

      {/* Sunday-first weekday row */}
      <div className="grid grid-cols-7">
        {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
          <div
            key={d}
            className={`text-[9px] font-semibold text-center py-0.5 ${
              i === 0 ? "text-danger-strong" : "text-foreground-subtle"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (d === null) {
            return <div key={`e-${i}`} className="aspect-square" />;
          }
          const cellDate = new Date(year, month, d);
          const key = cellDate.toISOString().slice(0, 10);
          const isToday = key === todayKey;
          const isSunday = cellDate.getDay() === 0;
          const hasEvent = eventDates.has(key);
          return (
            <div
              key={d}
              className={`aspect-square flex items-center justify-center rounded-[3px] relative text-[9px] transition-colors ${
                isToday
                  ? "bg-foreground text-background font-semibold"
                  : isSunday
                  ? "hover:bg-muted text-danger-strong"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              <span className="text-numeric">{d}</span>
              {hasEvent && (
                <span
                  className={`absolute bottom-[1px] left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full ${
                    isToday ? "bg-background" : "bg-foreground"
                  }`}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Single event row — mirror of a todo row, so calendar list aligns visually with todos */
function EventRow({ event }: { event: CalendarEvent }) {
  const dateKey = event.start_at.slice(0, 10);
  const today = localDateStr();
  const isToday = dateKey === today;
  const dayLabel = isToday
    ? "今日"
    : new Date(event.start_at).toLocaleDateString("zh-TW", {
        month: "short",
        day: "numeric",
        weekday: "short",
      });
  const timeLabel = event.all_day
    ? "全日"
    : `${formatTime(event.start_at)}–${formatTime(event.end_at)}`;

  return (
    <Link href="/calendar" className="block">
      <Card interactive padding="sm" className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-md bg-deepblue/10 text-deepblue shrink-0 flex items-center justify-center">
          <span className="text-[9px] font-semibold">
            {new Date(event.start_at).getDate()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-body font-medium truncate">{event.title}</div>
          <div className="text-caption text-foreground-subtle truncate text-numeric">
            {dayLabel} · {timeLabel}
            {event.location ? ` · ${event.location}` : ""}
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** Pill filter */
function PillFilter({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all ${
        active
          ? "bg-foreground text-background shadow-raised-sm"
          : "bg-surface text-foreground-muted shadow-flat hover:text-foreground hover:shadow-raised-sm"
      }`}
    >
      {label}
      <span
        className={`text-[10px] tabular-nums ${
          active ? "text-background/70" : "text-foreground-subtle"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** Category bar chart — horizontal bars with tonal variety */
function CategoryChart({
  data,
  total,
}: {
  data: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const colors = [
    "bg-foreground",
    "bg-deepblue",
    "bg-ice-strong",
    "bg-khaki",
    "bg-foreground-muted",
    "bg-foreground-subtle",
  ];
  return (
    <div className="space-y-2">
      {entries.map(([cat, amt], i) => {
        const pct = total ? (amt / total) * 100 : 0;
        return (
          <div key={cat} className="flex items-center text-sm gap-2">
            <span className="w-16 text-foreground-muted truncate text-caption">
              {cat}
            </span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden shadow-inset">
              <div
                className={`h-full rounded-full ${colors[i % colors.length]}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="text-caption w-20 text-right text-numeric text-foreground">
              ${amt.toLocaleString("zh-HK", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-foreground-subtle w-10 text-right text-numeric">
              {pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3 pl-1">
      <h2 className="text-label-caps">{title}</h2>
      <Link
        href={href}
        className="text-caption text-foreground-muted hover:text-foreground inline-flex items-center gap-1 transition-colors"
      >
        全部
        <ArrowRight {...iconProps} size={iconSize.xs} />
      </Link>
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="text-center text-body text-foreground-muted py-6 px-6 shadow-inset bg-background rounded-lg">
      {message}
    </div>
  );
}
