"use client";

import { LineChart, iconProps } from "./icons";

// SignalTech 投資系統 — 同一個 Cloudflare Access SSO 門口下嘅另一個 app。
// 跨 subdomain 全頁跳轉（唔係 SPA 內部路由），所以用原生 <a>。
const SIGNALTECH_URL = "https://signal.talent-state.com";

export function SystemSwitcher() {
  return (
    <a
      href={SIGNALTECH_URL}
      className="flex items-center justify-center w-8 h-8 border border-border rounded hover:bg-muted text-foreground-muted hover:text-foreground transition-colors"
      title="切換去 SignalTech 投資系統"
      aria-label="切換去 SignalTech 投資系統"
    >
      <LineChart {...iconProps} size={16} />
    </a>
  );
}
