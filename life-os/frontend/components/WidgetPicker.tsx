"use client";

/**
 * WidgetPicker — 主頁右上角齒輪，開 popover 俾用戶 toggle 顯示邊啲 widget。
 *
 * Parent 控制 `disabled` + `onChange`，picker 唔自己 load/save（方便 parent
 * 一次 render 所有 widget 而 state 統一）。
 */

import { useEffect, useRef, useState } from "react";
import { ALL_WIDGETS, type WidgetId } from "@/lib/widgets";
import { Settings, iconProps, iconSize } from "./icons";

type Props = {
  disabled: Set<WidgetId>;
  onChange: (next: Set<WidgetId>) => void;
};

export function WidgetPicker({ disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (id: WidgetId) => {
    const next = new Set(disabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded hover:bg-muted transition-colors"
        aria-label="自訂 widget"
        aria-expanded={open}
      >
        <Settings {...iconProps} size={iconSize.sm} />
        <span>自訂</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="自訂 widget"
          className="absolute right-0 top-full mt-2 w-72 bg-surface-elevated border border-border-subtle rounded-lg shadow-xl z-40 p-3 animate-fade-in"
        >
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
            主頁 widget
          </div>
          <div className="space-y-1">
            {ALL_WIDGETS.map((w) => {
              const enabled = !disabled.has(w.id);
              return (
                <label
                  key={w.id}
                  className="flex items-start gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggle(w.id)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{w.label}</div>
                    <div className="text-xs text-foreground-subtle">
                      {w.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-border-subtle flex justify-end">
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-xs text-accent hover:underline"
            >
              全部顯示
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
