/**
 * PageShell — 統一 page 外框。
 *
 * 處理 max-width、padding、垂直間距，令每個 page 有一致 rhythm。
 *
 * 用例：
 *   <PageShell>
 *     <PageHeader title="待辦" />
 *     <section>...</section>
 *   </PageShell>
 */

import type { HTMLAttributes, ReactNode } from "react";

type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

type PageShellProps = HTMLAttributes<HTMLDivElement> & {
  /** 內容最大闊度，預設 lg = 896px */
  maxWidth?: MaxWidth;
  /** Padding size，預設 md */
  padding?: "none" | "sm" | "md" | "lg";
  children?: ReactNode;
};

const maxWidthMap: Record<MaxWidth, string> = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  full: "max-w-full",
};

const paddingMap = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
} as const;

export function PageShell({
  maxWidth = "lg",
  padding = "md",
  className = "",
  children,
  ...rest
}: PageShellProps) {
  return (
    <div
      className={`${maxWidthMap[maxWidth]} mx-auto w-full ${paddingMap[padding]} space-y-6 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
