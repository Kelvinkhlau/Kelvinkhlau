"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type VaultCategory, type VaultFile } from "@/lib/api";

type Props = {
  selectedIds: number[];
  onClose: () => void;
  onConfirm: (files: VaultFile[]) => void;
  /** 已經喺 email 入面嘅檔案（不可重選）— reserved for future */
  disabledIds?: number[];
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultFilePicker({ selectedIds, onClose, onConfirm }: Props) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [picked, setPicked] = useState<Set<number>>(new Set(selectedIds));

  const { data: categories = [] } = useQuery<VaultCategory[]>({
    queryKey: ["vault-categories"],
    queryFn: () => api.listVaultCategories(),
  });

  const { data: files = [], isLoading } = useQuery<VaultFile[]>({
    queryKey: ["vault-files", { q, categoryId, deleted: false }],
    queryFn: () =>
      api.listVaultFiles({
        q: q.trim() || undefined,
        category_id: categoryId === "all" ? undefined : categoryId,
        include_deleted: false,
      }),
  });

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickedFiles = useMemo(
    () => files.filter((f) => picked.has(f.id)),
    [files, picked],
  );

  const totalBytes = pickedFiles.reduce((s, f) => s + f.size_bytes, 0);
  const tooBig = totalBytes > 25 * 1024 * 1024;

  const handleConfirm = () => {
    // Pass through only files we've loaded; caller merges with prior selection
    onConfirm(pickedFiles);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-2xl rounded-t-lg sm:rounded-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">由資料庫揀檔案</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            ✕
          </button>
        </div>

        {/* Search + filter */}
        <div className="p-3 border-b border-border space-y-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋 主題 / 檔名 / 備註…"
            className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
          />
          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={`shrink-0 text-xs px-3 py-1 rounded border ${
                categoryId === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              全部
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 text-xs px-3 py-1 rounded border ${
                  categoryId === c.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">載入中…</div>
          ) : files.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {q ? "搵唔到" : "資料庫冇檔"}
            </div>
          ) : (
            <ul>
              {files.map((f) => {
                const on = picked.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      className={`w-full flex items-center gap-3 p-3 border-b border-border last:border-0 text-left hover:bg-muted ${
                        on ? "bg-blue-500/5" : ""
                      }`}
                    >
                      <span
                        className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center text-xs ${
                          on
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-border"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {f.title || f.filename}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {f.category_icon
                            ? `${f.category_icon} ${f.category_name || ""} · `
                            : ""}
                          {fmtBytes(f.size_bytes)}
                          {f.expiry_date ? ` · ⏰ ${f.expiry_date}` : ""}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="text-xs text-muted-foreground">
            揀咗 {picked.size} 個 · 共 {fmtBytes(totalBytes)}
            {tooBig && (
              <span className="text-red-500 ml-2">
                ⚠ 超過 25 MB，Gmail 唔收
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={tooBig}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium text-sm disabled:opacity-50"
            >
              加入附件（{picked.size}）
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded text-sm hover:bg-muted"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
