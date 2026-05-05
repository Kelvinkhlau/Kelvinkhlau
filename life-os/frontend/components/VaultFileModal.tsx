"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type VaultCategory,
  type VaultFile,
  type VaultShare,
  type VaultTag,
} from "@/lib/api";
import { toast } from "./Toast";
import { useStepUpAuth } from "./useStepUpAuth";

type Props = {
  file: VaultFile;
  onClose: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(s: string | null): string {
  if (!s) return "";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("zh-HK");
  } catch {
    return s;
  }
}

export function VaultFileModal({ file: initialFile, onClose }: Props) {
  const queryClient = useQueryClient();
  const { runWithStepUp } = useStepUpAuth();

  // Re-fetch to get latest
  const { data: file = initialFile } = useQuery({
    queryKey: ["vault-file", initialFile.id],
    queryFn: () => api.getVaultFile(initialFile.id),
    initialData: initialFile,
  });

  const { data: categories = [] } = useQuery<VaultCategory[]>({
    queryKey: ["vault-categories"],
    queryFn: () => api.listVaultCategories(),
  });
  const { data: allTags = [] } = useQuery<VaultTag[]>({
    queryKey: ["vault-tags"],
    queryFn: () => api.listVaultTags(),
  });

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(file.title || "");
  const [filename, setFilename] = useState(file.filename);
  const [categoryId, setCategoryId] = useState<number | null>(file.category_id);
  const [notes, setNotes] = useState(file.notes);
  const [expiryDate, setExpiryDate] = useState(file.expiry_date || "");
  const [reminderDays, setReminderDays] = useState<string>(
    file.reminder_days_before != null ? String(file.reminder_days_before) : ""
  );
  const [tagIds, setTagIds] = useState<number[]>(file.tag_ids);
  const [newTagName, setNewTagName] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);

  useEffect(() => {
    setTitle(file.title || "");
    setFilename(file.filename);
    setCategoryId(file.category_id);
    setNotes(file.notes);
    setExpiryDate(file.expiry_date || "");
    setReminderDays(
      file.reminder_days_before != null ? String(file.reminder_days_before) : ""
    );
    setTagIds(file.tag_ids);
  }, [
    file.id,
    file.title,
    file.filename,
    file.category_id,
    file.notes,
    file.expiry_date,
    file.reminder_days_before,
    file.tag_ids,
  ]);

  const isImage = file.mime_type.startsWith("image/");
  const isPdf = file.mime_type === "application/pdf";
  const isText = file.mime_type.startsWith("text/") || file.mime_type === "application/json";

  const previewUrl = useMemo(() => api.vaultFilePreviewUrl(file.id), [file.id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const trimmedTitle = title.trim();
      const reminder =
        expiryDate && reminderDays.trim() !== ""
          ? Math.max(0, Math.min(365, Number(reminderDays) || 0))
          : undefined;
      return api.updateVaultFile(file.id, {
        title: trimmedTitle || undefined,
        clear_title: !trimmedTitle,
        filename: filename.trim() || undefined,
        category_id: categoryId,
        notes,
        expiry_date: expiryDate || undefined,
        clear_expiry: !expiryDate,
        reminder_days_before: reminder,
        clear_reminder: !expiryDate || reminderDays.trim() === "",
        tag_ids: tagIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-file", file.id] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vault-categories"] });
      toast.success("已更新");
      setEditing(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addTagMutation = useMutation({
    mutationFn: (name: string) => api.createVaultTag({ name }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["vault-tags"] });
      setTagIds((ids) => (ids.includes(t.id) ? ids : [...ids, t.id]));
      setNewTagName("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const trashMutation = useMutation({
    mutationFn: () => runWithStepUp(() => api.softDeleteVaultFile(file.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      toast.success("已移入回收筒");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const restoreMutation = useMutation({
    mutationFn: () => api.restoreVaultFile(file.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      toast.success("已還原");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: () => runWithStepUp(() => api.permanentDeleteVaultFile(file.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-files"] });
      queryClient.invalidateQueries({ queryKey: ["vault-summary"] });
      toast.success("已永久刪除");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleDownload = async () => {
    try {
      const blob = await runWithStepUp(() => api.downloadVaultFile(file.id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_filename || file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Native share sheet — iOS/Android/Mac 叫出系統分享（WhatsApp / Mail / AirDrop …）
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleNativeShare = async () => {
    try {
      const blob = await runWithStepUp(() => api.downloadVaultFile(file.id));
      const name = file.original_filename || file.filename;
      const sharedFile = new File([blob], name, {
        type: file.mime_type || "application/octet-stream",
      });
      const payload: ShareData = {
        title: file.title || name,
        text: file.title || name,
        files: [sharedFile],
      };
      // Safari 會用 canShare 檢查；部分桌面瀏覽器無呢個 API
      const navAny = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (navAny.canShare && !navAny.canShare(payload)) {
        toast.error("呢個瀏覽器唔支援直接分享檔案");
        return;
      }
      await navigator.share(payload);
    } catch (e) {
      const err = e as Error;
      // 用戶自己 cancel 咗，唔使報 error
      if (err.name === "AbortError") return;
      toast.error(err.message);
    }
  };

  const toggleTag = (id: number) => {
    setTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-3xl rounded-t-lg sm:rounded-lg max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between z-10">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">
              {file.category_icon} {file.title || file.filename}
            </h2>
            <div className="text-xs text-muted-foreground truncate">
              {formatBytes(file.size_bytes)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 text-muted-foreground hover:text-foreground text-xl"
          >
            ✕
          </button>
        </div>

        {/* Preview */}
        <div className="p-4 bg-muted border-b border-border">
          {isImage ? (
            <img
              src={previewUrl}
              alt={file.filename}
              className="max-w-full max-h-[60vh] mx-auto rounded"
            />
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title={file.filename}
              className="w-full h-[60vh] rounded bg-white"
            />
          ) : isText ? (
            <iframe
              src={previewUrl}
              title={file.filename}
              className="w-full h-[40vh] rounded bg-white"
            />
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <div className="text-5xl mb-3">📎</div>
              <div>呢個格式唔支援 preview</div>
              <div className="text-xs mt-1">{file.mime_type}</div>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="p-4 space-y-3">
          {editing ? (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  主題 <span className="text-muted-foreground">（例：Lau Kelvin Kai Hang 香港身份證）</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                  placeholder="描述呢份檔案係咩"
                  className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">檔名</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
                />
              </div>
              <div>
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
              <div>
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
                      onClick={() => {
                        setExpiryDate("");
                        setReminderDays("");
                      }}
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
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`text-xs px-2 py-1 rounded border ${
                        tagIds.includes(t.id)
                          ? "bg-foreground text-background border-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="新 tag 名"
                    className="flex-1 px-3 py-1.5 border border-border rounded bg-background text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => newTagName.trim() && addTagMutation.mutate(newTagName.trim())}
                    disabled={!newTagName.trim() || addTagMutation.isPending}
                    className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted disabled:opacity-50"
                  >
                    + 加
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted-foreground">備註</label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (!navigator.clipboard?.readText) {
                          toast.error("瀏覽器唔支援，請用鍵盤 ⌘V / Ctrl+V");
                          return;
                        }
                        const text = await navigator.clipboard.readText();
                        if (!text) {
                          toast.error("剪貼板冇文字");
                          return;
                        }
                        setNotes((prev) => (prev ? prev + text : text));
                        toast.success("已貼上備註");
                      } catch (e) {
                        toast.error(`貼上失敗：${(e as Error).message || "請授權剪貼板存取"}`);
                      }
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    📋 貼上
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded bg-background text-sm resize-y"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50 text-sm"
                >
                  {saveMutation.isPending ? "儲存中…" : "儲存"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-border rounded text-sm hover:bg-muted"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <>
              {file.title && (
                <div>
                  <div className="text-xs text-muted-foreground">主題</div>
                  <div className="font-medium text-base">{file.title}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">分類</div>
                  <div className="font-medium">
                    {file.category_icon ? `${file.category_icon} ` : ""}
                    {file.category_name || "（無）"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">上載日期</div>
                  <div className="font-medium">{formatDate(file.uploaded_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">檔案大小</div>
                  <div className="font-medium">{formatBytes(file.size_bytes)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">類型</div>
                  <div className="font-medium truncate">{file.mime_type}</div>
                </div>
                {file.expiry_date && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">到期日</div>
                    <div
                      className={`font-medium ${
                        file.days_until_expiry !== null && file.days_until_expiry < 0
                          ? "text-red-500"
                          : file.days_until_expiry !== null && file.days_until_expiry <= 30
                          ? "text-amber-600"
                          : ""
                      }`}
                    >
                      {formatDate(file.expiry_date)}
                      {file.days_until_expiry !== null && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({file.days_until_expiry >= 0
                            ? `還有 ${file.days_until_expiry} 日`
                            : `過期 ${-file.days_until_expiry} 日`})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      提醒：
                      {file.reminder_days_before != null
                        ? `到期前 ${file.reminder_days_before} 日 + 當日`
                        : "預設（7 日前、聽日、當日）"}
                    </div>
                  </div>
                )}
              </div>

              {file.tag_names.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {file.tag_names.map((n) => (
                      <span
                        key={n}
                        className="text-xs px-2 py-0.5 bg-muted rounded"
                      >
                        #{n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {file.notes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">備註</div>
                  <div className="text-sm whitespace-pre-wrap">{file.notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {file.deleted_at ? (
                  <>
                    <button
                      type="button"
                      onClick={() => restoreMutation.mutate()}
                      className="flex-1 py-2 bg-foreground text-background rounded text-sm font-medium"
                    >
                      ♻️ 還原
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("永久刪除？此操作不可復原。")) {
                          permanentDeleteMutation.mutate();
                        }
                      }}
                      className="px-3 py-2 border border-red-500/50 text-red-500 rounded text-sm"
                    >
                      🗑️ 永久刪除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="flex-1 py-2 bg-foreground text-background rounded text-sm font-medium"
                    >
                      📥 下載
                    </button>
                    {canNativeShare && (
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="px-3 py-2 border border-border rounded text-sm hover:bg-muted"
                        title="分享去其他 App（WhatsApp / Mail / AirDrop…）"
                      >
                        📤 分享去 App
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowShareDialog(true)}
                      className="px-3 py-2 border border-border rounded text-sm hover:bg-muted"
                      title="建立可分享 URL（長期有效）"
                    >
                      🔗 Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="px-3 py-2 border border-border rounded text-sm hover:bg-muted"
                    >
                      ✏️ 編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => trashMutation.mutate()}
                      className="px-3 py-2 border border-red-500/50 text-red-500 rounded text-sm"
                    >
                      🗑️ 刪除
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showShareDialog && (
        <ShareDialog
          file={file}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}


// ─── Share dialog ────────────────────────────────────────────────────────────

function ShareDialog({ file, onClose }: { file: VaultFile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { runWithStepUp } = useStepUpAuth();

  const [label, setLabel] = useState("");
  const [expiresIn, setExpiresIn] = useState<string>("168"); // 預設 7 日
  const [maxDownloads, setMaxDownloads] = useState<string>("");
  const [allowDownload, setAllowDownload] = useState(true);

  const { data: shares = [], refetch } = useQuery<VaultShare[]>({
    queryKey: ["vault-shares", file.id],
    queryFn: () => api.listVaultShares(file.id),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      runWithStepUp(() =>
        api.createVaultShare(file.id, {
          label: label.trim() || undefined,
          expires_in_hours: expiresIn.trim() === "" ? null : Number(expiresIn),
          max_downloads: maxDownloads.trim() === "" ? null : Number(maxDownloads),
          allow_download: allowDownload,
        })
      ),
    onSuccess: async (s) => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["vault-shares", file.id] });
      setLabel("");
      try {
        await navigator.clipboard.writeText(s.url);
        toast.success("已建立分享 link 並 copy 咗去 clipboard");
      } catch {
        toast.success("已建立分享 link");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => runWithStepUp(() => api.revokeVaultShare(id)),
    onSuccess: () => {
      refetch();
      toast.success("已停用");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已 copy");
    } catch {
      toast.error("Copy 失敗");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-lg rounded-t-lg sm:rounded-lg p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">分享「{file.title || file.filename}」</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            ✕
          </button>
        </div>

        <div className="text-xs text-muted-foreground mb-3 p-2 bg-muted rounded">
          ⚠️ 分享 link 任何人只要有 URL 都可以睇 / 下載檔案。
          建議設過期時間或下載次數上限，分享完就停用。
        </div>

        {/* Create new share */}
        <div className="space-y-2 mb-4 p-3 border border-border rounded">
          <div className="text-xs text-muted-foreground font-medium mb-1">新增分享 link</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="標籤 — 例：「畀律師」（自己睇，唔會顯示俾對方）"
            className="w-full px-3 py-2 border border-border rounded bg-background text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">過期（小時）</label>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full px-2 py-2 border border-border rounded bg-background text-sm"
              >
                <option value="1">1 小時</option>
                <option value="24">1 日</option>
                <option value="72">3 日</option>
                <option value="168">7 日</option>
                <option value="720">30 日</option>
                <option value="">永不過期</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">下載次數上限</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
                placeholder="無限"
                className="w-full px-2 py-2 border border-border rounded bg-background text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
            />
            <span>允許下載（取消 = 只可 inline 預覽）</span>
          </label>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full py-2 bg-foreground text-background rounded font-medium text-sm disabled:opacity-50"
          >
            {createMutation.isPending ? "建立中…" : "建立分享 link"}
          </button>
        </div>

        {/* Existing shares */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">現有 link</div>
          {shares.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              未有分享 link
            </div>
          ) : (
            shares.map((s) => {
              const active = !s.revoked_at
                && (!s.expires_at || new Date(s.expires_at) > new Date())
                && (s.max_downloads == null || s.download_count < s.max_downloads);
              return (
                <div
                  key={s.id}
                  className="p-2 border border-border rounded text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {s.label || "（未命名）"}
                      </div>
                      <div className="text-muted-foreground truncate font-mono text-[11px]">
                        {s.url}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copy(s.url)}
                        className="px-2 py-1 border border-border rounded hover:bg-muted"
                      >
                        Copy
                      </button>
                      {active && (
                        <button
                          type="button"
                          onClick={() => revokeMutation.mutate(s.id)}
                          className="px-2 py-1 border border-red-500/50 text-red-500 rounded"
                        >
                          停用
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-muted-foreground">
                    {s.revoked_at ? (
                      <span className="text-red-500">已停用</span>
                    ) : s.expires_at ? (
                      <>過期：{new Date(s.expires_at).toLocaleString("zh-HK")}</>
                    ) : (
                      <>永不過期</>
                    )}
                    {" · "}
                    下載 {s.download_count}
                    {s.max_downloads != null ? ` / ${s.max_downloads}` : ""} 次
                    {!s.allow_download && " · 只預覽"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
