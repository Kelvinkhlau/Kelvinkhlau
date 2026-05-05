"use client";

/**
 * MerchantAutocomplete — 商家自動補全 input。
 *
 * - 輸入 >= 1 字後 debounce 300ms call suggestMerchants
 * - 揀到 suggestion 時 optional 回傳 hints (category / payment_account_id)
 *   畀 caller 自動填表
 */

import { useEffect, useRef, useState } from "react";
import { api, type MerchantSuggestion } from "@/lib/api";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onPick?: (s: MerchantSuggestion) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function MerchantAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "例：麥當勞",
  className = "",
  inputClassName = "",
}: Props) {
  const [suggestions, setSuggestions] = useState<MerchantSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await api.suggestMerchants(q, 8);
        setSuggestions(res);
        setHighlight(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value]);

  // 點 outside 關閉
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(s: MerchantSuggestion) {
    onChange(s.merchant);
    onPick?.(s);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={inputClassName || "w-full mt-1 px-3 py-2 border border-border rounded bg-background"}
        autoComplete="off"
      />
      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">搜尋中…</div>
          )}
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s.merchant}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                i === highlight ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <span className="truncate flex-1">{s.merchant}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {s.last_category ?? ""} · {s.count}次
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
