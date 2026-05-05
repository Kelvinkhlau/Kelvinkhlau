"use client";

import { useSyncExternalStore } from "react";

type ToastType = "error" | "success" | "info" | "warning";

interface ToastOptions {
  /** Toast 種類 */
  type?: ToastType;
  /** 顯示時間（ms），預設 4000。undo toast 預設 6000 畀用戶時間撤銷 */
  duration?: number;
  /** 撤銷 callback — 出 "撤銷" 按鈕，click 時 call 呢個 fn + 關 toast */
  undo?: () => void | Promise<void>;
  /** 撤銷按鈕 label，預設「撤銷」 */
  undoLabel?: string;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  undo?: () => void | Promise<void>;
  undoLabel: string;
}

let nextId = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l());
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit();
}

/**
 * 顯示 toast。
 *
 * 基本：
 *   toast("已儲存")
 *   toast.success("已儲存")
 *
 * 帶撤銷：
 *   toast("已刪除 1 項", { type: "success", undo: () => restore() })
 */
export function toast(
  message: string,
  options: ToastOptions | ToastType = {},
) {
  const opts: ToastOptions =
    typeof options === "string" ? { type: options } : options;
  const type = opts.type ?? "error";
  const duration = opts.duration ?? (opts.undo ? 6000 : 4000);

  const id = ++nextId;
  const item: ToastItem = {
    id,
    message,
    type,
    undo: opts.undo,
    undoLabel: opts.undoLabel ?? "撤銷",
  };
  toasts = [...toasts, item];
  emit();

  const timer = setTimeout(() => dismiss(id), duration);
  timers.set(id, timer);

  return id;
}

toast.error = (msg: string, options: Omit<ToastOptions, "type"> = {}) =>
  toast(msg, { ...options, type: "error" });
toast.success = (msg: string, options: Omit<ToastOptions, "type"> = {}) =>
  toast(msg, { ...options, type: "success" });
toast.info = (msg: string, options: Omit<ToastOptions, "type"> = {}) =>
  toast(msg, { ...options, type: "info" });
toast.warning = (msg: string, options: Omit<ToastOptions, "type"> = {}) =>
  toast(msg, { ...options, type: "warning" });
toast.dismiss = dismiss;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => toasts;
const getServerSnapshot = () => toasts;

const TYPE_STYLES: Record<ToastType, string> = {
  error: "bg-danger text-danger-foreground border border-danger-strong/50",
  success: "bg-success text-success-foreground border border-success-strong/50",
  info: "bg-info text-info-foreground border border-info-strong/50",
  warning: "bg-warning text-warning-foreground border border-warning-strong/50",
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pt-[env(safe-area-inset-top)]"
      role="region"
      aria-label="通知"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          aria-live={t.type === "error" ? "assertive" : "polite"}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm animate-slide-in ${TYPE_STYLES[t.type]}`}
        >
          <span className="flex-1">{t.message}</span>
          {t.undo ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await t.undo?.();
                } finally {
                  dismiss(t.id);
                }
              }}
              className="flex-shrink-0 px-2.5 py-1 rounded-sm text-xs font-semibold bg-white/15 hover:bg-white/25 active:bg-white/35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {t.undoLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="關閉"
            className="flex-shrink-0 text-white/70 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
