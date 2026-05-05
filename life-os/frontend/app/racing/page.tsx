"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TABS = [
  { key: "predict", label: "賽事預測", path: "/" },
  { key: "overview", label: "全日總覽", path: "/overview" },
  { key: "report", label: "績效報告", path: "/report" },
  { key: "analysis", label: "模型分析", path: "/analysis" },
  { key: "betting", label: "投注記錄", path: "/betting" },
];

export default function RacingPage() {
  const [activeTab, setActiveTab] = useState("predict");
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPath = TABS.find((t) => t.key === activeTab)?.path ?? "/";
  const proxyBase = "/racing-proxy";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${proxyBase}${currentPath}`)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        // 重寫絕對路徑：/api/ → /racing-proxy/api/, /static/ → /racing-proxy/static/
        let rewritten = text
          // 核心：重寫 fetchAPI 函數，自動加 proxy prefix
          .replace(
            /async function fetchAPI\(url\)\s*\{/,
            `async function fetchAPI(url) { url = /^\\/api\\//.test(url) ? '${proxyBase}' + url : url;`
          )
          // static assets
          .replace(/(href|src)="\/static\//g, `$1="${proxyBase}/static/`)
          .replace(/(href|src)='\/static\//g, `$1='${proxyBase}/static/`)
          // direct fetch calls with string literal
          .replace(/fetch\('\/api\//g, `fetch('${proxyBase}/api/`)
          .replace(/fetch\("\/api\//g, `fetch("${proxyBase}/api/`)
          .replace(/fetch\(`\/api\//g, `fetch(\`${proxyBase}/api/`)
          // template literals referencing /api/ (backtick strings)
          .replace(/`\/api\//g, `\`${proxyBase}/api/`)
          // single/double quoted strings referencing /api/
          .replace(/'\/api\//g, `'${proxyBase}/api/`)
          .replace(/"\/api\//g, `"${proxyBase}/api/`)
          // navigation href links
          .replace(/href="\/overview"/g, `href="${proxyBase}/overview"`)
          .replace(/href='\/overview'/g, `href='${proxyBase}/overview'`)
          .replace(/href="\/report"/g, `href="${proxyBase}/report"`)
          .replace(/href='\/report'/g, `href='${proxyBase}/report'`)
          .replace(/href="\/analysis"/g, `href="${proxyBase}/analysis"`)
          .replace(/href='\/analysis'/g, `href='${proxyBase}/analysis'`)
          .replace(/href="\/betting"/g, `href="${proxyBase}/betting"`)
          .replace(/href='\/betting'/g, `href='${proxyBase}/betting'`)
          .replace(/href="\/status"/g, `href="${proxyBase}/status"`)
          .replace(/href='\/status'/g, `href='${proxyBase}/status'`)
          .replace(/href="\/"/g, `href="${proxyBase}/"`)
          .replace(/href='\/'/g, `href='${proxyBase}/'`)
          // window.location navigation
          .replace(/window\.location\.href\s*=\s*['"]\/(?!racing-proxy)/g, (match) => {
            const q = match.includes("'") ? "'" : '"';
            return `window.location.href=${q}${proxyBase}/`;
          });
        setHtml(rewritten);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setHtml(null); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [currentPath]);

  // iframe with srcdoc — same origin, all paths rewritten
  return (
    <main className="min-h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-border shrink-0">
        <h1 className="text-lg font-bold mr-4">賽馬預測</h1>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === tab.key
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1" ref={containerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">載入中…</div>
        ) : html ? (
          <iframe
            key={activeTab}
            srcDoc={html}
            className="w-full border-0"
            style={{ height: "calc(100dvh - 110px)" }}
            title={`賽馬 - ${TABS.find((t) => t.key === activeTab)?.label}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-red-500">無法載入賽馬系統（請確認 localhost:8000 運行中）</div>
        )}
      </div>
    </main>
  );
}
