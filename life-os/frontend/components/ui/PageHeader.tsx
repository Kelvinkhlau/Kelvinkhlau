/**
 * PageHeader — 每個 page 頂部統一 header。
 *
 * 包含 icon（optional）、title、subtitle、actions（右邊 slot）、breadcrumb（頂部 slot）。
 * 用 text-title / text-subhead 字體層級，確保全系統一致。
 *
 * 用例：
 *   <PageHeader
 *     icon={<CheckSquare {...iconProps} />}
 *     title="待辦"
 *     subtitle="4 件未完成"
 *     actions={<button>...</button>}
 *   />
 */

import type { HTMLAttributes, ReactNode } from "react";

type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
};

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
  breadcrumb,
  className = "",
  ...rest
}: PageHeaderProps) {
  return (
    <header className={`space-y-2 ${className}`.trim()} {...rest}>
      {breadcrumb ? (
        <div className="text-caption text-foreground-subtle">{breadcrumb}</div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon ? (
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-surface-elevated border border-border-subtle flex items-center justify-center text-foreground">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-title text-foreground truncate">{title}</h1>
            {subtitle ? (
              <p className="text-caption text-foreground-muted mt-0.5">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
