/**
 * Badge — 統一 chip / tag / pill 顯示。
 *
 * 用 semantic soft token 做 background，accent/success/warning/danger/info 全部支援。
 *
 * 用例：
 *   <Badge>預設 neutral</Badge>
 *   <Badge variant="success">已完成</Badge>
 *   <Badge variant="warning" size="sm">提醒</Badge>
 *   <Badge variant="accent" shape="rect" leading={<Star {...iconSize.xs} />}>VIP</Badge>
 */

import type { HTMLAttributes, ReactNode } from "react";

type Variant = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
type Size = "sm" | "md";
type Shape = "pill" | "rect";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** 前面 icon slot */
  leading?: ReactNode;
  /** 後面 icon slot（例如 ✕ 關閉） */
  trailing?: ReactNode;
  children?: ReactNode;
};

const variantMap: Record<Variant, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
};

const sizeMap: Record<Size, string> = {
  sm: "text-[11px] h-5 px-2 gap-1",
  md: "text-xs h-6 px-2.5 gap-1.5",
};

const shapeMap: Record<Shape, string> = {
  pill: "rounded-full",
  rect: "rounded-sm",
};

export function Badge({
  variant = "neutral",
  size = "md",
  shape = "pill",
  leading,
  trailing,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-medium ${variantMap[variant]} ${sizeMap[size]} ${shapeMap[shape]} ${className}`.trim()}
      {...rest}
    >
      {leading ? <span className="flex items-center">{leading}</span> : null}
      {children}
      {trailing ? <span className="flex items-center">{trailing}</span> : null}
    </span>
  );
}
