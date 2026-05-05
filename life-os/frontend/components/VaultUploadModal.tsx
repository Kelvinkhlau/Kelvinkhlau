"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type VaultCategory } from "@/lib/api";
import { toast } from "./Toast";

type Props = {
  defaultCategoryId?: number | null;
  onClose: () => void;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

type Mode = "file" | "text";

export function VaultUploadModal({ defaultCategoryId = null, onClose }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("file");
  const [files, setFiles] = useState<File[]>([]);
  // 單一檔案嘅時候先用 title / filename；多檔案用 file.name 做 filename
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [textContent, setTextContent] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(defaultCategoryId);
  const [notes, setNotes] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [reminderDays, setReminderDays] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: categories = [] } = useQuery<VaultCategory[]>({
    queryKey: ["vault-categories"],
    queryFn: () => api.listVaultCategories(),
  });

  const isMulti = files.length > 1;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const reminder =
        expiryDate && reminderDays.trim() !== ""
          ? Math.max(0, Math.min(365, Number(reminderDays) || 0))
          : undefined;

      // 冇上載檔案但備註有字 → 當作文字記錄儲存
      if (files.length === 0) {
        if (!notes.trim()) {
          throw new Error("請揀檔案，或者喺備註填內容");
        }
        const derivedTitle =
          title.trim() ||
          notes.trim().split("\n")[0].slice(0, 100) ||
          "純文字記錄";
        await api.createVaultTextEntry({
          title: derivedTitle,
          content: notes,
          category_id: categoryId,
          notes: undefined,
          expiry_date: expiryDate || undefined,
          reminder_days_before: reminder,
        });
        return { ok: 1, total: 1, errors: [] as string[] };
      }

      let ok = 0;
      const errors: string[] = [];
      setProgress({ done: 0, total: files.length });
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          await api.uploadVaultFile(f, {
            category_id: categoryId,
            // 單一檔案：用 title + filename；多檔案：兩者都唔用（每個用原檔名）
            title: !isMulti ? (title.trim() || undefined) : undefined,
            filename: !isMulti ? (filename.trim() || undefined) : undefined,
            notes: notes.trim() || undefined,
            expiry_date: expiryDate || undefined,
            reminder_days_before: reminder,
          });
          ok += 1;
        } catch (e) {
          errors.push(`${f.name}: ${(e as Error).message}`);
        }
        setProgress({ done: i + 1, total: files.length });
      }
      return { ok, total: files.length, errors };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vault-categories"] });
      setProgress(null);
      if (res.errors.length === 0) {
        const noFile = files.length === 0;
        toast.success(
          noFile
            ? "備註已保存"
            : res.total === 1
              ? "上載成功"
              : `全部 ${res.total} 個檔案上載成功`,
        );
        onClose();
      } else if (res.ok > 0) {
        toast.success(`${res.ok}/${res.total} 個上載成功`);
        res.errors.forEach((err) => toast.error(err));
      } else {
        res.errors.forEach((err) => toast.error(err));
      }
    },
    onError: (e) => {
      setProgress(null);
      toast.error((e as Error).message);
    },
  });

  const textMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("請填主題");
      if (!textContent.trim()) throw new Error("請填內容");
      const reminder =
        expiryDate && reminderDays.trim() !== ""
          ? Math.max(0, Math.min(365, Number(reminderDays) || 0))
          : undefined;
      return api.createVaultTextEntry({
        title: title.trim(),
        content: textContent,
        category_id: categoryId,
        notes: notes.trim() || undefined,
        expiry_date: expiryDate || undefined,
        reminder_days_before: reminder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vault-categories"] });
      toast.success("文字記錄已保存");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addFiles = (picked: File[] | FileList) => {
    const arr = Array.from(picked);
    const accepted: File[] = [];
    for (const f of arr) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} 太大（${(f.size / 1024 / 1024).toFixed(1)} MB）。上限 50 MB`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setFiles((prev) => {
      const next = [...prev, ...accepted];
      // 單檔 → 自動填 filename
      if (next.length === 1 && !filename) setFilename(next[0].name);
      if (next.length > 1) setFilename("");
      return next;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setFilename("");
      if (next.length === 1) setFilename(next[0].name);
      return next;
    });
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  /** 由剪貼板讀文字，append 到指定 setter — 解決 iOS PWA 長按 paste menu 唔出嘅問題。*/
  const pasteFromClipboard = async (
    setter: (updater: (prev: string) => string) => void,
    field: string,
  ) => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error("瀏覽器唔支援剪貼板讀取，請用鍵盤 ⌘V / Ctrl+V");
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error("剪貼板冇文字");
        return;
      }
      setter((prev) => (prev ? prev + text : text));
      toast.success(`已貼上${field}`);
    } catch (e) {
      toast.error(`貼上失敗：${(e as Error).message || "請授權剪貼板存取"}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {mode === "file"
              ? `上載檔案${files.length > 0 ? `（${files.length}）` : ""}`
              : "新增純文字記錄"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border border-border rounded overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`flex-1 py-2 text-sm font-medium ${
              mode === "file"
                ? "bg-foreground text-background"
                : "hover:bg-muted"
            }`}
          >
            📎 檔案
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`flex-1 py-2 text-sm font-medium border-l border-border ${
              mode === "text"
                ? "bg-foreground text-background"
                : "hover:bg-muted"
            }`}
          >
            📝 純文字
          </button>
        </div>

        {mode === "text" && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">
                主題 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：OpenAI API Key、銀行密碼提示"
                maxLength={300}
                className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
              />
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">
                  內容 <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => pasteFromClipboard(setTextContent, "內容")}
                  className="text-xs text-blue-600 hover:underline"
                >
                  📋 貼上
                </button>
              </div>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                placeholder="貼上 API key / 序號 / 文字內容…"
                className="w-full px-3 py-2 border border-border rounded bg-background text-sm font-mono resize-y"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                會以 .txt 形式加密存喺 vault，可隨時下載 / 預覽 / 編輯。
              </div>
            </div>
          </>
        )}

        {/* Dropzone — file mode only */}
        {mode === "file" && <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer border-2 border-dashed rounded-lg p-6 text-center mb-3 transition ${
            dragging ? "border-foreground bg-muted" : "border-border hover:bg-muted"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              <div className="text-3xl mb-2">📤</div>
              <div>拖放檔案到呢度，或 click 揀檔（可揀多個）</div>
              <div className="text-xs mt-1">PDF / JPG / PNG / DOC / XLSX / TXT · 每個最大 50 MB</div>
              <div className="text-[11px] mt-2 text-muted-foreground/80">
                💡 唔上載檔案都得 — 喺下面備註填文字（例：API key）一樣可以儲存
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              <div className="text-2xl mb-1">📄 × {files.length}</div>
              <div className="text-xs">
                合共 {(totalSize / 1024 / 1024).toFixed(2)} MB · click 加更多
              </div>
            </div>
          )}
        </div>}

        {/* File list */}
        {mode === "file" && files.length > 0 && (
          <div className="mb-3 space-y-1 max-h-40 overflow-y-auto">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1"
              >
                <span>📄</span>
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-red-500 hover:text-red-700 font-bold"
                  aria-label={`移除 ${f.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Title / filename — file mode 單檔至顯示（text mode 已經有自己嘅主題 input） */}
        {mode === "file" && !isMulti && (
          <>
            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">
                主題 <span className="text-muted-foreground">（建議填，例：Lau Kelvin Kai Hang 香港身份證）</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="描述呢份檔案係咩"
                maxLength={300}
                className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs text-muted-foreground mb-1">
                檔案名 <span className="text-muted-foreground">（可選，預設 = 原檔名）</span>
              </label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="例：2026 稅單.pdf"
                className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
              />
            </div>
          </>
        )}

        {mode === "file" && isMulti && (
          <div className="mb-3 text-xs text-muted-foreground bg-muted/40 rounded p-2">
            多檔案模式：每個檔案用原檔名，之後可以打開檔案改主題。下面嘅分類、到期、備註會套用到所有檔案。
          </div>
        )}

        {/* Category */}
        <div className="mb-3">
          <label className="block text-xs text-muted-foreground mb-1">分類</label>
          <select
            value={categoryId ?? ""}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
          >
            <option value="">（無分類）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Expiry */}
        <div className="mb-3">
          <label className="block text-xs text-muted-foreground mb-1">
            到期日 <span className="text-muted-foreground">（可選 — 冇就留空）</span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
            />
            {expiryDate && (
              <button
                type="button"
                onClick={() => setExpiryDate("")}
                className="text-xs text-muted-foreground hover:text-foreground px-2"
              >
                清除
              </button>
            )}
          </div>
          {expiryDate && (
            <div className="mt-2 pl-2 border-l-2 border-border">
              <label className="block text-xs text-muted-foreground mb-1">
                到期前幾多日提醒？
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  placeholder="留空 = 預設（7 日前 + 聽日 + 當日）"
                  className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">日前</span>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-muted-foreground">備註</label>
            <button
              type="button"
              onClick={() => pasteFromClipboard(setNotes, "備註")}
              className="text-xs text-blue-600 hover:underline"
            >
              📋 貼上
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="例如：IRD 寄嘅，第二期繳款"
            className="w-full px-3 py-2 border border-border rounded bg-background text-sm resize-y"
          />
        </div>

        <div className="flex gap-2">
          {mode === "file" ? (
            <button
              type="button"
              onClick={() => uploadMutation.mutate()}
              disabled={
                (files.length === 0 && !notes.trim()) ||
                uploadMutation.isPending
              }
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50 text-sm"
            >
              {uploadMutation.isPending
                ? progress
                  ? `上載中… ${progress.done}/${progress.total}`
                  : files.length === 0
                    ? "保存中…"
                    : "上載中…"
                : files.length === 0
                  ? "保存備註"
                  : files.length > 1
                    ? `上載 ${files.length} 個檔案`
                    : "上載"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => textMutation.mutate()}
              disabled={
                !title.trim() || !textContent.trim() || textMutation.isPending
              }
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50 text-sm"
            >
              {textMutation.isPending ? "保存中…" : "保存"}
            </button>
          )}
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
  );
}
