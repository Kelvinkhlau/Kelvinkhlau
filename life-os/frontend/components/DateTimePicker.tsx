"use client";

import { useState, useRef, useEffect } from "react";

/**
 * 自訂大尺寸 date(+time) picker
 *
 * Value format: "YYYY-MM-DDTHH:mm"（同 <input type=datetime-local> 一致）
 * dateOnly=true → "YYYY-MM-DD"
 */
export function DateTimePicker({
  value,
  onChange,
  dateOnly = false,
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  dateOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Parse current value
  const parsed = parseValue(value, dateOnly);
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);

  useEffect(() => {
    setViewYear(parsed.year);
    setViewMonth(parsed.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const display = formatDisplay(value, dateOnly);

  const updateDate = (y: number, m: number, d: number) => {
    const datePart = `${y}-${pad(m + 1)}-${pad(d)}`;
    if (dateOnly) {
      onChange(datePart);
    } else {
      const timePart = value.includes("T") ? value.split("T")[1].slice(0, 5) : "09:00";
      onChange(`${datePart}T${timePart}`);
    }
  };

  const updateTime = (h: number, mi: number) => {
    const datePart = value.includes("T") ? value.split("T")[0] : `${parsed.year}-${pad(parsed.month + 1)}-${pad(parsed.day)}`;
    onChange(`${datePart}T${pad(h)}:${pad(mi)}`);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 border border-border rounded bg-background text-base lg:text-lg font-medium text-left hover:border-foreground transition"
      >
        {display}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 bg-background border border-border rounded-lg shadow-2xl p-4 w-[360px]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 0) {
                  setViewYear(viewYear - 1);
                  setViewMonth(11);
                } else setViewMonth(viewMonth - 1);
              }}
              className="px-3 py-1 hover:bg-muted rounded text-lg leading-none"
            >
              ‹
            </button>
            <div className="font-semibold text-base">
              {viewYear}年{viewMonth + 1}月
            </div>
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 11) {
                  setViewYear(viewYear + 1);
                  setViewMonth(0);
                } else setViewMonth(viewMonth + 1);
              }}
              className="px-3 py-1 hover:bg-muted rounded text-lg leading-none"
            >
              ›
            </button>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {buildDays(viewYear, viewMonth).map((d, i) => {
              const isCurrent = d.month === viewMonth;
              const isSelected =
                d.year === parsed.year && d.month === parsed.month && d.day === parsed.day;
              const today = new Date();
              const isToday =
                d.year === today.getFullYear() &&
                d.month === today.getMonth() &&
                d.day === today.getDate();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    updateDate(d.year, d.month, d.day);
                    if (dateOnly) setOpen(false);
                  }}
                  className={`h-10 rounded text-sm transition ${
                    isSelected
                      ? "bg-foreground text-background font-semibold"
                      : isToday
                      ? "bg-blue-100 dark:bg-blue-900/40 font-medium"
                      : isCurrent
                      ? "hover:bg-muted"
                      : "text-muted-foreground/40 hover:bg-muted/50"
                  }`}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {/* Time picker */}
          {!dateOnly && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 justify-center">
                <select
                  value={parsed.hour}
                  onChange={(e) => updateTime(Number(e.target.value), parsed.minute)}
                  className="px-3 py-2 border border-border rounded bg-background text-base font-medium"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {pad(h)}
                    </option>
                  ))}
                </select>
                <span className="text-base font-medium">:</span>
                <select
                  value={parsed.minute}
                  onChange={(e) => updateTime(parsed.hour, Number(e.target.value))}
                  className="px-3 py-2 border border-border rounded bg-background text-base font-medium"
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <option key={m} value={m}>
                      {pad(m)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-3 px-4 py-2 bg-foreground text-background rounded text-sm font-medium"
                >
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string, dateOnly: boolean) {
  const now = new Date();
  if (!value) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: 9,
      minute: 0,
    };
  }
  const [datePart, timePart = "09:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.slice(0, 5).split(":").map(Number);
  return {
    year: y || now.getFullYear(),
    month: (m || 1) - 1,
    day: d || 1,
    hour: dateOnly ? 0 : h || 0,
    minute: dateOnly ? 0 : mi || 0,
  };
}

function formatDisplay(value: string, dateOnly: boolean): string {
  if (!value) return dateOnly ? "選擇日期" : "選擇日期時間";
  const p = parseValue(value, dateOnly);
  const datePart = `${p.year}年${p.month + 1}月${p.day}日`;
  if (dateOnly) return datePart;
  const ampm = p.hour >= 12 ? "下午" : "上午";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${datePart} ${ampm} ${pad(h12)}:${pad(p.minute)}`;
}

function buildDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 = Sunday
  const start = new Date(year, month, 1 - startDay);
  const days: { year: number; month: number; day: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
  }
  return days;
}
