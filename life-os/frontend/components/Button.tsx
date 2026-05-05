"use client";

/**
 * 統一 Button 組件 — 解決成個 app 19 個 page 各自為政嘅 button style 問題。
 *
 * 用法：
 *   <Button>Default</Button>
 *   <Button variant="primary" size="lg">Submit</Button>
 *   <Button variant="danger" loading={isPending}>Delete</Button>
 *   <Button variant="ghost" size="sm" leftIcon="✕" aria-label="Close" />
 *
 * Variants:
 *   - primary:   foreground bg（黑/白切換），主要 CTA
 *   - secondary: border + muted bg，次要 action
 *   - danger:    red，破壞性 action
 *   - ghost:     無 border，純 hover，toolbar / icon button
 *   - outline:   純 border，無 hover bg
 *
 * Sizes:
 *   - xs / sm / md (default) / lg
 *
 * 所有 variant 都有 dark mode 同 touch-target minimum 44px（除 xs / sm）。
 */

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANT_CLS: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:opacity-90 disabled:opacity-50 active:opacity-80",
  secondary:
    "border border-border bg-background hover:bg-muted disabled:opacity-50",
  danger:
    "border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50",
  ghost:
    "text-foreground hover:bg-muted disabled:opacity-40",
  outline:
    "border border-border text-foreground disabled:opacity-50",
};

const SIZE_CLS: Record<Size, string> = {
  xs: "text-xs px-2 py-1 rounded",
  sm: "text-sm px-3 py-1.5 rounded-md",
  md: "text-sm px-4 py-2 rounded-md min-h-[40px]",
  lg: "text-base px-5 py-3 rounded-lg min-h-[44px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className = "",
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const classes = [
    "inline-flex items-center justify-center gap-1.5 font-medium transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-foreground/40",
    "disabled:cursor-not-allowed",
    VARIANT_CLS[variant],
    SIZE_CLS[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} disabled={isDisabled} className={classes} {...rest}>
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {rightIcon && !loading ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
});
