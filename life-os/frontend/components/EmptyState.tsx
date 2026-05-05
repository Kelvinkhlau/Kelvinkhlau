"use client";

/**
 * 統一空狀態組件 — 取代「冇資料」純文字。
 *
 * <EmptyState icon="📭" title="冇任何 email" description="..." action={...} />
 */

import type { ReactNode } from "react";

export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}
      role="status"
    >
      <div className="text-5xl mb-3 opacity-60" aria-hidden>
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
