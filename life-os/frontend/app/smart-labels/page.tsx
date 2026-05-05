"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SmartLabel, type Email } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const LABEL_COLORS = [
  { name: "blue", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", border: "border-blue-200 dark:border-blue-800" },
  { name: "red", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", dot: "bg-red-500", border: "border-red-200 dark:border-red-800" },
  { name: "green", bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", dot: "bg-green-500", border: "border-green-200 dark:border-green-800" },
  { name: "amber", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800" },
  { name: "purple", bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", border: "border-purple-200 dark:border-purple-800" },
  { name: "pink", bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500", border: "border-pink-200 dark:border-pink-800" },
  { name: "cyan", bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500", border: "border-cyan-200 dark:border-cyan-800" },
  { name: "orange", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500", border: "border-orange-200 dark:border-orange-800" },
];

function getColorStyle(color: string) {
  return LABEL_COLORS.find((c) => c.name === color) || LABEL_COLORS[0];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分鐘前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(iso).toLocaleDateString("zh-HK");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-HK", { month: "short", day: "numeric" });
}

export default function SmartLabelsPage() {
  const queryClient = useQueryClient();

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [patterns, setPatterns] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // 資料夾瀏覽
  const [activeLabel, setActiveLabel] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [emailLimit, setEmailLimit] = useState(30);

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ["smart-labels"],
    queryFn: () => api.listSmartLabels(),
  });

  const { data: labelEmails = [], isLoading: emailsLoading } = useQuery({
    queryKey: ["smart-label-emails", activeLabel, searchQuery, emailLimit],
    queryFn: () =>
      activeLabel
        ? api.emailsByLabel(activeLabel, {
            q: searchQuery || undefined,
            limit: emailLimit,
          })
        : Promise.resolve([]),
    enabled: activeLabel !== null,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color: string; match_patterns: string }) =>
      editId ? api.updateSmartLabel(editId, data) : api.createSmartLabel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart-labels"] });
      toast.success(editId ? "已更新標籤" : "已建立標籤");
      resetForm();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteSmartLabel(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["smart-labels"] });
      if (activeLabel === id) setActiveLabel(null);
      toast.success("已刪除標籤");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const matchMutation = useMutation({
    mutationFn: () => api.matchAllLabels(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smart-labels"] });
      queryClient.invalidateQueries({ queryKey: ["smart-label-emails"] });
      toast.success(`已歸檔 ${data.matched} 封郵件`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setName("");
    setColor("blue");
    setPatterns("");
  };

  const startEdit = (label: SmartLabel) => {
    setEditId(label.id);
    setName(label.name);
    setColor(label.color);
    setPatterns(label.match_patterns);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !patterns.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      color,
      match_patterns: patterns.trim(),
    });
  };

  const activeLabelObj = labels.find((l) => l.id === activeLabel);

  return (
    <main className="min-h-full max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">🏷️ 智能標籤</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            郵件自動歸檔 — 睇完即分類，搵嘢直接揾
          </p>
        </div>
        <button
          type="button"
          onClick={() => matchMutation.mutate()}
          disabled={matchMutation.isPending}
          className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-muted disabled:opacity-50"
        >
          {matchMutation.isPending ? "歸檔中…" : "🔄 批量歸檔"}
        </button>
      </div>

      <div className="flex gap-4">
        {/* ── 左側：標籤列表 ── */}
        <div className="w-56 shrink-0 space-y-2">
          {/* 新增按鈕 */}
          <button
            type="button"
            onClick={() => { setShowForm(!showForm); setEditId(null); }}
            className="w-full p-2 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground transition"
          >
            + 新增標籤
          </button>

          {isLoading ? (
            <Loading />
          ) : labels.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              未建立標籤
            </div>
          ) : (
            labels.map((label) => {
              const cs = getColorStyle(label.color);
              const isActive = activeLabel === label.id;
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => {
                    setActiveLabel(isActive ? null : label.id);
                    setSearchQuery("");
                    setEmailLimit(30);
                  }}
                  className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-left transition text-sm ${
                    isActive
                      ? `${cs.bg} ${cs.text} border ${cs.border}`
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full shrink-0 ${cs.dot}`} />
                  <span className="flex-1 truncate font-medium">{label.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/30" : "bg-muted"}`}>
                    {label.email_count}
                  </span>
                </button>
              );
            })
          )}

          {/* 建議標籤（空 state） */}
          {labels.length === 0 && !showForm && (
            <div className="mt-4 space-y-1.5">
              <div className="text-xs text-muted-foreground font-medium">建議</div>
              {[
                { name: "DBS 銀行", patterns: "dbs.com", color: "red" },
                { name: "AIA 保險", patterns: "aia.com.hk", color: "purple" },
                { name: "政府", patterns: "gov.hk", color: "blue" },
                { name: "MTR", patterns: "mtr.com.hk", color: "amber" },
                { name: "WeLab", patterns: "welab.bank", color: "green" },
              ].map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setName(s.name);
                    setColor(s.color);
                    setPatterns(s.patterns);
                    setShowForm(true);
                  }}
                  className="w-full flex items-center gap-2 p-2 text-xs rounded hover:bg-muted"
                >
                  <span className={`w-2 h-2 rounded-full ${getColorStyle(s.color).dot}`} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 右側：表單 or 郵件列表 ── */}
        <div className="flex-1 min-w-0">
          {/* 新增/編輯表單 */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-4 p-4 border border-border rounded-lg space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">名稱</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例：DBS 銀行"
                    className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">顏色</label>
                  <div className="flex gap-1 mt-1 py-2">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => setColor(c.name)}
                        className={`w-6 h-6 rounded-full ${c.dot} ${
                          color === c.name ? "ring-2 ring-offset-2 ring-foreground" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  匹配規則（每行一個，匹配寄件者 email）
                </label>
                <textarea
                  value={patterns}
                  onChange={(e) => setPatterns(e.target.value)}
                  placeholder={"dbs.com\n@dbs.com.hk"}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background text-sm font-mono"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
                >
                  {createMutation.isPending ? "儲存中…" : editId ? "更新" : "建立"}
                </button>
                <button type="button" onClick={resetForm} className="px-4 py-2 border border-border rounded hover:bg-muted">
                  取消
                </button>
              </div>
            </form>
          )}

          {/* 郵件列表 */}
          {activeLabel && activeLabelObj ? (
            <div>
              {/* 標籤 header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full ${getColorStyle(activeLabelObj.color).dot}`} />
                  <h2 className="font-bold text-lg">{activeLabelObj.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {activeLabelObj.email_count} 封
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(activeLabelObj)}
                    className="text-xs px-2 py-1 border border-border rounded hover:bg-muted"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(activeLabelObj.id)}
                    className="text-xs px-2 py-1 text-red-500 border border-border rounded hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    刪除
                  </button>
                </div>
              </div>

              {/* 搜尋 */}
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋主旨、寄件者⋯"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>

              {/* Pattern 預覽 */}
              <div className="mb-3 flex flex-wrap gap-1">
                {activeLabelObj.match_patterns
                  .split("\n")
                  .filter(Boolean)
                  .map((p) => (
                    <span key={p} className="text-[11px] px-2 py-0.5 bg-muted rounded font-mono">
                      {p}
                    </span>
                  ))}
              </div>

              {/* 郵件列表 */}
              {emailsLoading ? (
                <Loading />
              ) : labelEmails.length === 0 ? (
                <EmptyState
                  message={
                    searchQuery
                      ? "搵唔到匹配郵件"
                      : "暫時冇已歸檔嘅郵件，試下撳「批量歸檔」"
                  }
                />
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {labelEmails.map((email: Email) => (
                    <Link
                      key={email.id}
                      href={`/inbox/detail?id=${email.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm truncate ${!email.is_read ? "font-semibold" : ""}`}>
                          {email.subject || "(無主旨)"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {email.sender}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {email.snippet}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">
                          {formatDate(email.received_at)}
                        </div>
                        {!email.is_read && (
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-1" />
                        )}
                      </div>
                    </Link>
                  ))}
                  {labelEmails.length >= emailLimit && (
                    <button
                      type="button"
                      onClick={() => setEmailLimit((l) => l + 30)}
                      className="w-full py-3 text-sm text-blue-600 hover:bg-muted transition"
                    >
                      載入更多
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : !showForm ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <span className="text-4xl mb-3">📂</span>
              <p className="text-sm">選擇左邊嘅標籤查看已歸檔郵件</p>
              <p className="text-xs mt-1">
                郵件睇完後會自動歸入匹配嘅標籤
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除標籤"
        message="確定要刪除呢個智能標籤？（唔會影響郵件本身）"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
