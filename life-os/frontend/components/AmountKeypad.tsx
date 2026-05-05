"use client";

/**
 * AmountKeypad — 自訂數字小鍵盤，支援基本四則運算。
 *
 * 用法：
 *   const [open, setOpen] = useState(false);
 *   <AmountKeypad
 *     open={open}
 *     value={amount}
 *     onClose={() => setOpen(false)}
 *     onConfirm={(v) => { setAmount(v); setOpen(false); }}
 *   />
 *
 * - Mobile (< md)：固定喺屏幕底 (bottom sheet)
 * - Desktop：居中浮動 card
 * - 支援按鍵：0-9 . + - × ÷ C ⌫ =
 * - Enter 直接 confirm；表達式有運算子時 Enter 先 `=` 評估，再按一次先 confirm
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  open: boolean;
  value: string; // initial string value (can be "0", "12.34"，或 expression eg "100+20")
  onClose: () => void;
  onConfirm: (value: string) => void;
};

type Op = "+" | "-" | "×" | "÷";

function evaluateExpression(expr: string): number | null {
  // 支援：數字 + 小數 + 四則運算（含優先級）
  // 將 × ÷ 轉 * /，然後用簡易 shunting-yard
  const tokens: (number | Op)[] = [];
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/");
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      const n = parseFloat(src.slice(i, j));
      if (isNaN(n)) return null;
      tokens.push(n);
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      // 一元負號：expression 開頭或前一個係 operator
      const prev = tokens[tokens.length - 1];
      if (c === "-" && (prev === undefined || typeof prev === "string")) {
        // 合併落下個數字
        let j = i + 1;
        while (j < src.length && /[\d.]/.test(src[j])) j++;
        const n = parseFloat(src.slice(i, j));
        if (isNaN(n)) return null;
        tokens.push(n);
        i = j;
        continue;
      }
      const op: Op = c === "*" ? "×" : c === "/" ? "÷" : (c as Op);
      tokens.push(op);
      i++;
      continue;
    }
    return null; // 不認識嘅字符
  }
  if (tokens.length === 0) return null;

  // 先做 × ÷
  const pass1: (number | Op)[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t === "×" || t === "÷") {
      const left = pass1.pop();
      const right = tokens[k + 1];
      if (typeof left !== "number" || typeof right !== "number") return null;
      if (t === "÷" && right === 0) return null;
      pass1.push(t === "×" ? left * right : left / right);
      k++;
    } else {
      pass1.push(t);
    }
  }
  // 再做 + -
  let acc: number | null = null;
  let pendingOp: Op | null = null;
  for (const t of pass1) {
    if (typeof t === "number") {
      if (acc === null) acc = t;
      else if (pendingOp === "+") acc = acc + t;
      else if (pendingOp === "-") acc = acc - t;
    } else {
      pendingOp = t;
    }
  }
  return acc;
}

function formatResult(n: number): string {
  // 最多 2 位小數
  return (Math.round(n * 100) / 100).toString();
}

export function AmountKeypad({ open, value, onClose, onConfirm }: Props) {
  const [expr, setExpr] = useState(value || "");
  const sheetRef = useRef<HTMLDivElement>(null);

  // reset 當 reopens
  useEffect(() => {
    if (open) setExpr(value || "");
  }, [open, value]);

  // 計算預覽
  const preview = useMemo(() => {
    if (!expr) return null;
    // 冇運算子就唔顯示預覽
    if (!/[+\-×÷]/.test(expr.slice(1))) return null; // 跳開頭嘅負號
    const v = evaluateExpression(expr);
    return v === null ? null : formatResult(v);
  }, [expr]);

  const append = useCallback((ch: string) => {
    setExpr((prev) => {
      // 連續 operator → 取代上一個
      if (/[+\-×÷]/.test(ch)) {
        if (prev === "" && ch !== "-") return prev;
        if (/[+\-×÷]$/.test(prev)) return prev.slice(0, -1) + ch;
      }
      // 小數點：同一個 operand 只能有一個
      if (ch === ".") {
        const lastOpIdx = Math.max(
          prev.lastIndexOf("+"),
          prev.lastIndexOf("-"),
          prev.lastIndexOf("×"),
          prev.lastIndexOf("÷")
        );
        const currentSeg = prev.slice(lastOpIdx + 1);
        if (currentSeg.includes(".")) return prev;
        if (currentSeg === "") return prev + "0.";
      }
      return prev + ch;
    });
  }, []);

  const backspace = useCallback(() => {
    setExpr((p) => p.slice(0, -1));
  }, []);

  const clear = useCallback(() => setExpr(""), []);

  const equalsOrConfirm = useCallback(() => {
    // 冇 operator → 直接 confirm
    if (!/[+\-×÷]/.test(expr.slice(1))) {
      if (!expr) return;
      const n = parseFloat(expr);
      if (isNaN(n) || n <= 0) return;
      onConfirm(formatResult(n));
      return;
    }
    const v = evaluateExpression(expr);
    if (v === null) return;
    if (v <= 0) return;
    // 有 preview → confirm 時直接用 preview（一步到位）
    onConfirm(formatResult(v));
  }, [expr, onConfirm]);

  // keyboard
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        equalsOrConfirm();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        append(e.key);
        return;
      }
      if (e.key === "+" || e.key === "-") {
        e.preventDefault();
        append(e.key);
        return;
      }
      if (e.key === "*") {
        e.preventDefault();
        append("×");
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        append("÷");
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, append, backspace, equalsOrConfirm, onClose]);

  if (!open) return null;

  const Key = ({
    label,
    onClick,
    className = "",
  }: {
    label: string;
    onClick: () => void;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-14 text-lg font-medium rounded-md bg-surface hover:bg-muted active:bg-muted/60 border border-border-subtle transition-colors tabular-nums ${className}`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-label="金額鍵盤"
        className="fixed z-50 left-0 right-0 bottom-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-sm md:w-full bg-background rounded-t-2xl md:rounded-2xl shadow-2xl border-t border-border md:border pb-[env(safe-area-inset-bottom)]"
      >
        {/* Drag handle (mobile) */}
        <div className="md:hidden h-1 w-12 bg-border-subtle rounded-full mx-auto mt-2" />
        {/* Display */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-right text-3xl font-bold tabular-nums min-h-[2.5rem]">
            {expr || "0"}
          </div>
          {preview !== null && (
            <div className="text-right text-sm text-muted-foreground tabular-nums">
              = {preview}
            </div>
          )}
        </div>
        {/* Keys */}
        <div className="grid grid-cols-4 gap-2 p-3 pt-1">
          <Key label="C" onClick={clear} className="text-rose-500" />
          <Key label="⌫" onClick={backspace} />
          <Key label="÷" onClick={() => append("÷")} className="text-accent" />
          <Key label="×" onClick={() => append("×")} className="text-accent" />

          <Key label="7" onClick={() => append("7")} />
          <Key label="8" onClick={() => append("8")} />
          <Key label="9" onClick={() => append("9")} />
          <Key label="−" onClick={() => append("-")} className="text-accent" />

          <Key label="4" onClick={() => append("4")} />
          <Key label="5" onClick={() => append("5")} />
          <Key label="6" onClick={() => append("6")} />
          <Key label="+" onClick={() => append("+")} className="text-accent" />

          <Key label="1" onClick={() => append("1")} />
          <Key label="2" onClick={() => append("2")} />
          <Key label="3" onClick={() => append("3")} />
          <button
            type="button"
            onClick={equalsOrConfirm}
            className="row-span-2 h-auto text-lg font-semibold rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            {preview !== null ? "=" : "確認"}
          </button>

          <Key label="0" onClick={() => append("0")} className="col-span-2" />
          <Key label="." onClick={() => append(".")} />
        </div>
      </div>
    </>
  );
}
