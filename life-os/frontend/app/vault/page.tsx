"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type VaultCategory,
  type VaultFile,
  type VaultSummaryData,
  type VaultTag,
} from "@/lib/api";
import { Loading, EmptyState } from "@/components/Loading";
import { VaultUploadModal } from "@/components/VaultUploadModal";
import { VaultFileModal } from "@/components/VaultFileModal";

type FilterMode = "all" | "category" | "tag" | "expiring" | "trash";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.startsWith("text/")) return "📝";
  if (mime.includes("word")) return "📘";
  if (mime.includes("sheet") || mime.includes("excel")) return "📗";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📙";
  if (mime.includes("zip")) return "🗜️";
  return "📄";
}

export default function VaultPage() {
  const [mode, setMode] = useState<FilterMode>("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<VaultFile | null>(null);

  const { data: summary } = useQuery<VaultSummaryData>({
    queryKey: ["vault-summary"],
    queryFn: () => api.vaultSummary(),
  });
  const { data: categories = [] } = useQuery<VaultCategory[]>({
    queryKey: ["vault-categories"],
    queryFn: () => api.listVaultCategories(),
  });
  const { data: tags = [] } = useQuery<VaultTag[]>({
    queryKey: ["vault-tags"],
    queryFn: () => api.listVaultTags(),
  });

  const filesParams = useMemo(() => {
    const p: Parameters<typeof api.listVaultFiles>[0] = {};
    if (q.trim()) p.q = q.trim();
    if (mode === "category" && categoryId !== null) p.category_id = categoryId;
    if (mode === "tag" && tagId !== null) p.tag_id = tagId;
    if (mode === "expiring") p.expiring_within_days = 30;
    if (mode === "trash") p.include_deleted = true;
    return p;
  }, [mode, categoryId, tagId, q]);

  const { data: files = [], isLoading } = useQuery<VaultFile[]>({
    queryKey: ["vault-files", filesParams],
    queryFn: () => api.listVaultFiles(filesParams),
  });

  const selectAll = () => {
    setMode("all");
    setCategoryId(null);
    setTagId(null);
  };

  return (
    <main className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🔒 個人資料庫
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            稅單、合同、體檢報告、證件 — 集中加密儲存
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="px-4 py-2 bg-foreground text-background rounded text-sm font-medium"
        >
          + 上載檔案
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-surface border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">總檔案</div>
            <div className="text-xl font-semibold">{summary.total_files}</div>
          </div>
          <div className="bg-surface border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">總容量</div>
            <div className="text-xl font-semibold">
              {formatBytes(summary.total_size_bytes)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode("expiring");
              setCategoryId(null);
              setTagId(null);
            }}
            className={`border rounded p-3 text-left ${
              mode === "expiring"
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-500"
                : "bg-surface border-border hover:bg-muted"
            }`}
          >
            <div className="text-xs text-muted-foreground">30 日內到期</div>
            <div
              className={`text-xl font-semibold ${
                summary.expiring_soon > 0 ? "text-amber-600" : ""
              }`}
            >
              {summary.expiring_soon}
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("trash");
              setCategoryId(null);
              setTagId(null);
            }}
            className={`border rounded p-3 text-left ${
              mode === "trash"
                ? "bg-red-50 dark:bg-red-950/30 border-red-500"
                : "bg-surface border-border hover:bg-muted"
            }`}
          >
            <div className="text-xs text-muted-foreground">回收筒</div>
            <div className="text-xl font-semibold">{summary.trashed}</div>
          </button>
        </div>
      )}

      {/* Search + view toggle */}
      <div className="flex gap-2 mb-3 items-center">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 搜尋檔名 / 備註…"
          className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
        />
        <div className="hidden sm:flex border border-border rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-3 py-2 text-xs ${view === "grid" ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            ▦ Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 py-2 text-xs ${view === "list" ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            ☰ List
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="space-y-3">
          {/* Categories */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 px-2">
              分類
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={selectAll}
                className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center justify-between ${
                  mode === "all" ? "bg-muted font-medium" : "hover:bg-muted"
                }`}
              >
                <span>📁 全部</span>
                <span className="text-xs text-muted-foreground">
                  {summary?.total_files ?? 0}
                </span>
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMode("category");
                    setCategoryId(c.id);
                    setTagId(null);
                  }}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center justify-between ${
                    mode === "category" && categoryId === c.id
                      ? "bg-muted font-medium"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">
                    {c.icon} {c.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{c.file_count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 px-2">
                Tags
              </div>
              <div className="space-y-0.5">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMode("tag");
                      setTagId(t.id);
                      setCategoryId(null);
                    }}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center justify-between ${
                      mode === "tag" && tagId === t.id
                        ? "bg-muted font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">#{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.file_count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <section>
          {isLoading ? (
            <Loading />
          ) : files.length === 0 ? (
            <EmptyState message="呢度未有檔案 — 撳「上載檔案」開始" />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {files.map((f) => (
                <FileCard key={f.id} file={f} onClick={() => setSelected(f)} />
              ))}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded overflow-hidden">
              {files.map((f) => (
                <FileRow key={f.id} file={f} onClick={() => setSelected(f)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {uploadOpen && (
        <VaultUploadModal
          defaultCategoryId={mode === "category" ? categoryId : null}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {selected && (
        <VaultFileModal file={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

function FileCard({ file, onClick }: { file: VaultFile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface border border-border rounded p-3 text-left hover:border-foreground/40 transition min-w-0"
    >
      <div className="text-3xl mb-2">{fileIcon(file.mime_type)}</div>
      <div className="text-sm font-medium truncate" title={file.title || file.filename}>
        {file.title || file.filename}
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5">
        {file.category_icon ? `${file.category_icon} ${file.category_name || ""}` : "（無分類）"}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {formatBytes(file.size_bytes)}
      </div>
      {file.expiry_date && (
        <div
          className={`text-[10px] mt-1 px-1.5 py-0.5 rounded inline-block ${
            file.days_until_expiry !== null && file.days_until_expiry < 0
              ? "bg-red-500/10 text-red-600"
              : file.days_until_expiry !== null && file.days_until_expiry <= 30
              ? "bg-amber-500/10 text-amber-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          ⏰ {file.expiry_date}
        </div>
      )}
      {file.tag_names.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {file.tag_names.slice(0, 3).map((n) => (
            <span
              key={n}
              className="text-[10px] px-1.5 py-0.5 bg-muted rounded truncate max-w-[80px]"
            >
              #{n}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function FileRow({ file, onClick }: { file: VaultFile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center p-3 border-b border-border last:border-0 hover:bg-muted text-left"
    >
      <span className="text-xl mr-3 shrink-0">{fileIcon(file.mime_type)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {file.title || file.filename}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {file.category_icon ? `${file.category_icon} ${file.category_name || ""} · ` : ""}
          {formatBytes(file.size_bytes)}
          {file.expiry_date && (
            <span
              className={`ml-2 ${
                file.days_until_expiry !== null && file.days_until_expiry < 0
                  ? "text-red-500"
                  : file.days_until_expiry !== null && file.days_until_expiry <= 30
                  ? "text-amber-600"
                  : ""
              }`}
            >
              ⏰ {file.expiry_date}
            </span>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground shrink-0 ml-2">
        {file.uploaded_at.slice(0, 10)}
      </div>
    </button>
  );
}
