/**
 * ListItem — 統一 row UI（email row / todo row / note row / idea row）。
 *
 * 結構：[leading] [title + subtitle + meta] [trailing]
 * 完整 keyboard focusable，hover state 用 surface-interactive。
 *
 * 用例：
 *   <ListItem
 *     leading={<Mail {...iconProps} />}
 *     title="Subject"
 *     subtitle="From: alice@example.com"
 *     meta="14:32"
 *     trailing={<Badge variant="accent">重要</Badge>}
 *     onClick={() => router.push(`/inbox/detail?id=${id}`)}
 *   />
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type ListItemProps = HTMLAttributes<HTMLDivElement> & {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 右上 meta（通常係時間） */
  meta?: ReactNode;
  /** 右邊 slot（例如 badge 或 action menu） */
  trailing?: ReactNode;
  /** 粗體 title（通常 unread email 用） */
  bold?: boolean;
  /** Active state（selected row） */
  active?: boolean;
  /** 可互動（加 hover state） */
  interactive?: boolean;
  /** 左邊加 accent bar（通常 urgent / unread indicator 用） */
  indicator?: "accent" | "success" | "warning" | "danger" | "info" | null;
};

const indicatorMap = {
  accent: "before:bg-accent",
  success: "before:bg-success",
  warning: "before:bg-warning",
  danger: "before:bg-danger",
  info: "before:bg-info",
} as const;

export const ListItem = forwardRef<HTMLDivElement, ListItemProps>(function ListItem(
  {
    leading,
    title,
    subtitle,
    meta,
    trailing,
    bold = false,
    active = false,
    interactive = true,
    indicator = null,
    className = "",
    ...rest
  },
  ref,
) {
  const interact = interactive
    ? "cursor-pointer hover:bg-surface-elevated active:bg-surface-elevated/80"
    : "";
  const activeCls = active
    ? "bg-accent-soft/40 border-accent/30"
    : "border-border-subtle";
  const indicatorCls = indicator
    ? `relative pl-5 before:content-[''] before:absolute before:left-2 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-8 before:rounded-full ${indicatorMap[indicator]}`
    : "";

  return (
    <div
      ref={ref}
      role={interactive && rest.onClick ? "button" : undefined}
      tabIndex={interactive && rest.onClick ? 0 : undefined}
      className={`flex items-start gap-3 p-3 bg-surface border rounded-md transition-colors ${activeCls} ${interact} ${indicatorCls} ${className}`.trim()}
      {...rest}
    >
      {leading ? (
        <div className="flex-shrink-0 mt-0.5 text-foreground-muted">
          {leading}
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`min-w-0 flex-1 truncate text-body ${
              bold ? "font-semibold text-foreground" : "text-foreground"
            }`}
          >
            {title}
          </div>
          {meta ? (
            <div className="flex-shrink-0 text-caption text-foreground-subtle">
              {meta}
            </div>
          ) : null}
        </div>
        {subtitle ? (
          <div className="text-caption text-foreground-muted mt-0.5 truncate">
            {subtitle}
          </div>
        ) : null}
      </div>

      {trailing ? (
        <div className="flex-shrink-0 flex items-center gap-2">{trailing}</div>
      ) : null}
    </div>
  );
});
