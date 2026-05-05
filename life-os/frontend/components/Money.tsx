"use client";

/**
 * Money — 渲染金額，支援 privacyMode 遮擋。
 *
 * 用法：
 *   <Money value={1234.5} />           → 1,235
 *   <Money value={1234.5} decimals={2} /> → 1,234.50
 *   <Money value={100} prefix="$" />   → $100
 *   <Money value={100} prefix="$" sign />→ +$100 或 -$100
 *
 * privacyMode=true 時顯示 "••••"。
 */

import { useAppStore } from "@/lib/store";

type MoneyProps = {
  value: number | null | undefined;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  sign?: boolean; // show + sign for positive
  mask?: string; // 自訂遮擋字串
  className?: string;
};

export function formatAmount(
  n: number,
  decimals = 0,
  sign = false
): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("zh-HK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (n < 0) return `-${formatted}`;
  if (sign && n > 0) return `+${formatted}`;
  return formatted;
}

export function Money({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  sign = false,
  mask = "••••",
  className = "",
}: MoneyProps) {
  const privacy = useAppStore((s) => s.privacyMode);
  if (privacy) {
    return <span className={className}>{prefix}{mask}{suffix}</span>;
  }
  const n = value ?? 0;
  return (
    <span className={className}>
      {prefix}
      {formatAmount(n, decimals, sign)}
      {suffix}
    </span>
  );
}

/** Hook — 拎 privacyMode-aware formatter。 */
export function useMoneyFmt() {
  const privacy = useAppStore((s) => s.privacyMode);
  return (
    value: number | null | undefined,
    opts?: { decimals?: number; prefix?: string; suffix?: string; sign?: boolean; mask?: string }
  ) => {
    const {
      decimals = 0,
      prefix = "",
      suffix = "",
      sign = false,
      mask = "••••",
    } = opts ?? {};
    if (privacy) return `${prefix}${mask}${suffix}`;
    return `${prefix}${formatAmount(value ?? 0, decimals, sign)}${suffix}`;
  };
}
