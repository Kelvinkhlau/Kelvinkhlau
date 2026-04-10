"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AuditLogEntry } from "@/lib/api";
import { Loading } from "@/components/Loading";

const ACTION_COLORS: Record<string, string> = {
  login: "text-green-600 bg-green-100",
  create: "text-blue-600 bg-blue-100",
  update: "text-yellow-600 bg-yellow-100",
  delete: "text-red-600 bg-red-100",
};

export default function AuditPage() {
  const [filterAction, setFilterAction] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit", filterAction],
    queryFn: () =>
      api.listAuditLogs({
        limit: 200,
        ...(filterAction ? { action: filterAction } : {}),
      }),
  });

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">審計記錄</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-2">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="px-2 py-1 text-sm border border-border rounded bg-background"
          aria-label="篩選動作類型"
        >
          <option value="">全部動作</option>
          <option value="login">登入</option>
          <option value="create">建立</option>
          <option value="update">更新</option>
          <option value="delete">刪除</option>
        </select>
        {isLoading && (
          <span className="text-sm text-muted-foreground">載入中…</span>
        )}
      </div>

      {/* Log list */}
      <section className="space-y-2">
        {logs.length === 0 && !isLoading && (
          <p className="text-center text-muted-foreground py-8">
            暫時冇審計記錄
          </p>
        )}
        {logs.map((entry) => (
          <div
            key={entry.id}
            className="p-3 border border-border rounded-lg text-sm"
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ACTION_COLORS[entry.action] || "bg-muted"
                }`}
              >
                {entry.action}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString("zh-HK")}
              </span>
            </div>
            {entry.resource_type && (
              <div className="text-muted-foreground">
                {entry.resource_type}
                {entry.resource_id && ` #${entry.resource_id}`}
              </div>
            )}
            {entry.detail && (
              <div className="text-muted-foreground mt-1">{entry.detail}</div>
            )}
            {entry.ip_address && (
              <div className="text-xs text-muted-foreground mt-1">
                IP: {entry.ip_address}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
