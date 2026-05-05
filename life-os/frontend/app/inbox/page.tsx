"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getToken, getWsBase, type Email, type VaultFile } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { VaultFilePicker } from "@/components/VaultFilePicker";
import { useDebounce } from "@/lib/useDebounce";
import { useHotkey } from "@/lib/hotkeys";
import { usePaletteContext } from "@/components/command/paletteContext";
import { Swipeable } from "@/components/Swipeable";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

const PAGE_SIZE = 50;

const CATEGORY_LABEL: Record<string, string> = {
  important: "重要",
  normal: "一般",
  promotional: "廣告",
  unclassified: "未分類",
};

const CATEGORY_OPTIONS = [
  { value: "important", label: "重要", color: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900" },
  { value: "normal", label: "一般", color: "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
  { value: "promotional", label: "廣告", color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900" },
];

function ClassificationChip({
  email,
  editingId,
  setEditingId,
  onChangeCategory,
}: {
  email: Email;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  onChangeCategory: (emailId: number, category: string) => void;
}) {
  if (!email.classification) return null;
  const cat = email.classification.final_category;
  const conf = email.classification.ai_confidence;
  const userOverridden = !!email.classification.user_category;
  const isSuggestion = !userOverridden && conf < 0.85;

  const color =
    cat === "important"
      ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"
      : cat === "promotional"
        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900"
        : "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";

  if (editingId === email.id) {
    return (
      <div
        className="flex gap-1 ml-2"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChangeCategory(email.id, opt.value);
              setEditingId(null);
            }}
            className={`text-xs px-2 py-1 rounded border whitespace-nowrap ${opt.color} ${
              cat === opt.value ? "ring-2 ring-offset-1 ring-blue-400 font-bold" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingId(email.id);
      }}
      className={`ml-2 text-xs px-2 py-1 rounded border whitespace-nowrap ${color} ${
        isSuggestion ? "opacity-60 italic" : ""
      }`}
      title={
        isSuggestion
          ? `AI 建議（信心 ${(conf * 100).toFixed(0)}%）— 撳改分類`
          : userOverridden
            ? "用戶修正 — 撳改分類"
            : `AI 分類（信心 ${(conf * 100).toFixed(0)}%）— 撳改分類`
      }
      aria-label={`分類：${CATEGORY_LABEL[cat] ?? cat}，撳改分類`}
    >
      {isSuggestion ? "建議：" : ""}
      {CATEGORY_LABEL[cat] ?? cat}
    </button>
  );
}

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instructions, setInstructions] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [account, setAccount] = useState<string>("gmail"); // 寄件人帳號，default Gmail
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts } = useQuery({
    queryKey: ["mail-accounts"],
    queryFn: () => api.listMailAccounts(),
    enabled: open,
    staleTime: 60_000,
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const ext = mimeType === "audio/mp4" ? "recording.m4a" : "recording.webm";
          const file = new File([blob], ext, { type: mimeType });
          const text = await api.transcribe(file);
          setInstructions((prev) => (prev ? prev + " " + text : text));
        } catch {
          toast.error("語音轉文字失敗");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("無法取得麥克風權限");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const handleAiDraft = async () => {
    if (!instructions.trim()) {
      toast.error("請先輸入或語音說明你想寫嘅電郵內容");
      return;
    }
    setAiLoading(true);
    try {
      const result = await api.aiCompose(instructions.trim());
      if (result.to) setTo(result.to);
      setSubject(result.subject);
      setBody(result.body);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const vaultIds = vaultFiles.map((f) => f.id);

  const composeMutation = useMutation({
    mutationFn: () =>
      api.composeEmail(
        to,
        subject,
        body,
        files.length ? files : undefined,
        vaultIds.length ? vaultIds : undefined,
        account,
      ),
    onSuccess: () => {
      const label = accounts?.find((a) => a.id === account)?.label || account;
      toast.success(`已透過 ${label} 發送`);
      setTo("");
      setSubject("");
      setBody("");
      setInstructions("");
      setFiles([]);
      setVaultFiles([]);
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!open) return null;

  const canSend = to.trim() && subject.trim() && body.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-lg w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold">寫郵件</h2>
          <button onClick={onClose} aria-label="關閉" className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* AI 指示區域 */}
        <div className="px-4 pt-4 pb-2 border-b border-border bg-purple-50/50 dark:bg-purple-950/20">
          <label className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1 block">
            AI 寫電郵 — 語音或文字描述你想寫嘅內容
          </label>
          <div className="flex gap-2">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="例：寫封 email 俾 john@company.com，回覆話明天嘅會議改到下午3點，用英文寫…"
              rows={2}
              className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800 rounded-md bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
              className={`self-start px-3 py-2 rounded-full font-medium transition ${
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-muted hover:bg-muted/80"
              } disabled:opacity-40`}
              title={recording ? "停止錄音" : "語音輸入"}
            >
              {transcribing ? "..." : recording ? "⏹" : "🎙"}
            </button>
          </div>
          <button
            onClick={handleAiDraft}
            disabled={aiLoading || !instructions.trim()}
            className="mt-2 mb-1 text-sm px-4 py-1.5 font-medium border border-purple-300 text-purple-600 rounded hover:bg-purple-100 dark:hover:bg-purple-950 disabled:opacity-50"
          >
            {aiLoading ? "AI 生成中…" : "AI 生成電郵"}
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 寄件人帳號選擇 */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">寄件人</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              {(accounts ?? [{ id: "gmail", label: "Gmail", email: null, connected: true }]).map((a) => (
                <option key={a.id} value={a.id} disabled={!a.connected}>
                  {a.label}
                  {a.email ? ` · ${a.email}` : ""}
                  {!a.connected ? "（未連接）" : ""}
                </option>
              ))}
            </select>
          </div>
          <input
            type="email"
            placeholder="收件者"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          />
          <input
            type="text"
            placeholder="主題"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
          />
          <textarea
            placeholder="內容…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm resize-y"
          />
          {/* 附件 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm px-3 py-1.5 border border-border rounded-md hover:bg-muted"
              >
                📎 附加檔案
              </button>
              <button
                type="button"
                onClick={() => setShowVaultPicker(true)}
                className="text-sm px-3 py-1.5 border border-border rounded-md hover:bg-muted"
              >
                🗂 由資料庫揀
              </button>
            </div>
            {(files.length > 0 || vaultFiles.length > 0) && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={`u-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    <span className="text-[10px]">📎</span>
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-[10px] whitespace-nowrap">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`移除 ${f.name}`}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >✕</button>
                  </div>
                ))}
                {vaultFiles.map((f) => (
                  <div key={`v-${f.id}`} className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded px-2 py-1">
                    <span className="text-[10px]">🗂</span>
                    <span className="truncate flex-1">{f.title || f.filename}</span>
                    <span className="text-[10px] whitespace-nowrap">{(f.size_bytes / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={() => setVaultFiles((prev) => prev.filter((x) => x.id !== f.id))}
                      aria-label={`移除 ${f.title || f.filename}`}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >✕</button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  共 {files.length + vaultFiles.length} 個檔案（
                  {(
                    (files.reduce((s, f) => s + f.size, 0) +
                      vaultFiles.reduce((s, f) => s + f.size_bytes, 0)) /
                    1024 /
                    1024
                  ).toFixed(1)}{" "}
                  MB / 25 MB）
                </p>
              </div>
            )}
          </div>
          {showVaultPicker && (
            <VaultFilePicker
              selectedIds={vaultFiles.map((f) => f.id)}
              onClose={() => setShowVaultPicker(false)}
              onConfirm={(picked) => setVaultFiles(picked)}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 border border-border rounded-md hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={() => composeMutation.mutate()}
            disabled={!canSend || composeMutation.isPending}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {composeMutation.isPending ? "發送中…" : "發送"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { paletteOpen, captureOpen, helpOpen } = usePaletteContext();
  const folderParam = (searchParams.get("folder") === "sent" ? "sent" : searchParams.get("folder") === "icloud" ? "icloud" : "inbox") as "inbox" | "sent" | "icloud";
  const [folder, setFolder] = useState<"inbox" | "sent" | "icloud">(folderParam);

  // Sync folder from URL when sidebar navigation changes query param
  useEffect(() => {
    setFolder(folderParam);
  }, [folderParam]);
  // 預設 inbox filter：重要 + 未讀；每次手動改會記住（localStorage）
  // 第一次 render 用 default 避免 SSR/client hydration mismatch，之後 useEffect hydrate 舊設定
  const [category, setCategory] = useState("important");
  const [unreadOnly, setUnreadOnly] = useState(true);
  useEffect(() => {
    const savedCat = localStorage.getItem("inbox.category");
    const savedUnread = localStorage.getItem("inbox.unreadOnly");
    if (savedCat !== null) setCategory(savedCat);
    if (savedUnread !== null) setUnreadOnly(savedUnread === "true");
  }, []);
  const [showArchived, setShowArchived] = useState(false);
  const [showTrashed, setShowTrashed] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q.trim(), 300);
  const [page, setPage] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [syncingSent, setSyncingSent] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<number>(-1);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [folder, category, debouncedQ, unreadOnly, showArchived, showTrashed]);

  // Reset temporary filters when switching folder（但保留 category / unreadOnly 嘅用戶偏好）
  useEffect(() => {
    setShowArchived(false);
    setShowTrashed(false);
    setQ("");
  }, [folder]);

  // Persist filter preferences
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("inbox.category", category);
    }
  }, [category]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("inbox.unreadOnly", String(unreadOnly));
    }
  }, [unreadOnly]);

  const queryKey = ["emails", folder, category, debouncedQ, unreadOnly, showArchived, showTrashed, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.listEmails({
        ...(folder === "icloud"
          ? { source: "icloud" }
          : { folder }),
        category: category || undefined,
        q: debouncedQ || undefined,
        // 寄件備份永遠係「已讀」（自己寄出嘅），唔應用 unread filter
        unread_only: folder === "sent" ? undefined : (unreadOnly || undefined),
        archived: showArchived || undefined,
        trashed: showTrashed || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const emails = data?.items ?? [];
  const total = data?.total ?? 0;

  const categoryMutation = useMutation({
    mutationFn: ({ emailId, newCategory }: { emailId: number; newCategory: string }) =>
      api.updateCategory(emailId, newCategory),
    onSuccess: (res, { emailId, newCategory }) => {
      queryClient.setQueryData(queryKey, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((e: Email) =>
            e.id === emailId && e.classification
              ? {
                  ...e,
                  classification: {
                    ...e.classification,
                    user_category: newCategory,
                    final_category: res.final_category,
                  },
                }
              : e
          ),
        };
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: number; archive: boolean }) =>
      api.archiveEmail(id, archive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("已封存");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("已移到垃圾桶");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => api.restoreEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("已還原");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: number) => api.permanentDeleteEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("已永久刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => api.deleteEmail(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(`已刪除 ${selected.size} 封`);
      setSelected(new Set());
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean }) =>
      api.markRead(id, read),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const batchMarkReadMutation = useMutation({
    mutationFn: async ({ ids, read }: { ids: number[]; read: boolean }) => {
      await Promise.all(ids.map((id) => api.markRead(id, read)));
      return { count: ids.length, read };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(
        res.read ? `已標 ${res.count} 封為已讀` : `已標 ${res.count} 封為未讀`,
      );
      setSelected(new Set());
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ─── Keyboard navigation ───────────────────────────────────────────
  // Cursor reset when filter/page changes
  useEffect(() => {
    setCursor(-1);
  }, [folder, category, debouncedQ, unreadOnly, showArchived, showTrashed, page]);

  // Auto-scroll cursor row into view
  useEffect(() => {
    if (cursor < 0) return;
    const el = document.querySelector<HTMLElement>(
      `[data-email-cursor="${cursor}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [cursor]);

  const hotkeysActive =
    !paletteOpen &&
    !captureOpen &&
    !helpOpen &&
    !composeOpen &&
    deleteTarget === null &&
    editingCategoryId === null;

  const cursorEmail = cursor >= 0 ? emails[cursor] : undefined;
  const navSuffix = `${showArchived ? "&archived=1" : ""}${
    category ? `&category=${category}` : ""
  }${folder !== "inbox" ? `&folder=${folder}` : ""}`;

  useHotkey(
    "j",
    () => setCursor((c) => Math.min(emails.length - 1, c < 0 ? 0 : c + 1)),
    { when: hotkeysActive && emails.length > 0 },
  );
  useHotkey(
    "k",
    () => setCursor((c) => Math.max(0, c < 0 ? 0 : c - 1)),
    { when: hotkeysActive && emails.length > 0 },
  );
  useHotkey(
    "o",
    () => {
      if (cursorEmail)
        router.push(`/inbox/detail?id=${cursorEmail.id}${navSuffix}`);
    },
    { when: hotkeysActive && !!cursorEmail },
  );
  useHotkey(
    "enter",
    () => {
      if (cursorEmail)
        router.push(`/inbox/detail?id=${cursorEmail.id}${navSuffix}`);
    },
    { when: hotkeysActive && !!cursorEmail },
  );
  useHotkey(
    "e",
    () => {
      if (cursorEmail && !showTrashed)
        archiveMutation.mutate({ id: cursorEmail.id, archive: !showArchived });
    },
    { when: hotkeysActive && !!cursorEmail && folder !== "sent" },
  );
  useHotkey(
    "#",
    () => {
      if (!cursorEmail) return;
      const isPromo =
        cursorEmail.classification?.final_category === "promotional";
      if (isPromo || showTrashed) {
        if (showTrashed) {
          // 喺垃圾桶入面 # 改做永久刪除（需要 confirm）
          setDeleteTarget(cursorEmail.id);
        } else {
          deleteMutation.mutate(cursorEmail.id);
        }
      } else {
        setDeleteTarget(cursorEmail.id);
      }
    },
    { when: hotkeysActive && !!cursorEmail && folder !== "sent" },
  );
  useHotkey(
    "u",
    () => {
      if (cursorEmail && folder !== "sent")
        markReadMutation.mutate({
          id: cursorEmail.id,
          read: !cursorEmail.is_read,
        });
    },
    { when: hotkeysActive && !!cursorEmail && folder !== "sent" },
  );
  useHotkey(
    "r",
    () => {
      // 喺列表：r = 寫新郵件（detail page 嘅 r 係 reply）
      setComposeOpen(true);
    },
    { when: hotkeysActive },
  );

  // WebSocket real-time push
  useEffect(() => {
    const base = getWsBase();
    const token = getToken();
    if (!base || !token) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(
          `${base}/ws/emails?token=${encodeURIComponent(token)}`
        );
      } catch {
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "email.new" && msg.email && page === 0) {
            queryClient.setQueryData(queryKey, (old: typeof data) => {
              if (!old) return old;
              if (old.items.some((e: Email) => e.id === msg.email.id)) return old;
              return {
                items: [msg.email as Email, ...old.items],
                total: old.total + 1,
              };
            });
            setLiveCount((n) => n + 1);
          }
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [page, queryClient, queryKey]);

  const resultLabel = useMemo(() => {
    if (isLoading) return "載入中…";
    const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const to = Math.min((page + 1) * PAGE_SIZE, total);
    return `${from}-${to} / ${total}`;
  }, [isLoading, total, page]);

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <main className="min-h-full p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">
            {folder === "sent" ? "寄件備份" : folder === "icloud" ? "iCloud 郵件" : "Inbox"}
          </h1>
          {liveCount > 0 && folder !== "sent" && (
            <span className="text-xs text-green-600">
              {liveCount} 封新 email（實時）
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {folder === "sent" && (
            <button
              onClick={async () => {
                setSyncingSent(true);
                try {
                  const r = await api.syncSent(100);
                  queryClient.invalidateQueries({ queryKey: ["emails"] });
                  toast.success(`同步完成：${r.new} 封新寄件`);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setSyncingSent(false);
                }
              }}
              disabled={syncingSent}
              className="text-sm px-3 py-2 border border-border rounded-md hover:bg-muted disabled:opacity-50"
            >
              {syncingSent ? "同步中…" : "同步寄件"}
            </button>
          )}
          {folder === "icloud" && (
            <button
              onClick={async () => {
                setSyncingSent(true);
                try {
                  const r = await api.syncICloud(50);
                  queryClient.invalidateQueries({ queryKey: ["emails"] });
                  toast.success(`同步完成：${r.new} 封新 iCloud 郵件`);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setSyncingSent(false);
                }
              }}
              disabled={syncingSent}
              className="text-sm px-3 py-2 border border-border rounded-md hover:bg-muted disabled:opacity-50"
            >
              {syncingSent ? "同步中…" : "手動同步"}
            </button>
          )}
          <button
            onClick={() => setComposeOpen(true)}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            寫郵件
          </button>
        </div>
      </div>

      {/* Folder tabs */}
      <div className="flex gap-1 mb-3 border-b border-border">
        <button
          onClick={() => setFolder("inbox")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            folder === "inbox"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          📧 Gmail
        </button>
        <button
          onClick={() => setFolder("icloud")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            folder === "icloud"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          ☁️ iCloud
        </button>
        <button
          onClick={() => setFolder("sent")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            folder === "sent"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          寄件備份
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input
          type="search"
          placeholder={folder === "sent" ? "搜尋寄件備份…" : folder === "icloud" ? "搜尋 iCloud 郵件…" : "搜尋 subject / sender / 內文…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md bg-background"
          aria-label="搜尋 email"
        />
        {(folder === "inbox" || folder === "icloud") && (
          <div className="flex gap-2 items-center flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`text-sm px-3 py-1 rounded-full border ${
                  category === c.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`text-sm px-3 py-1 rounded-full border ${
                unreadOnly
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-border hover:bg-muted"
              }`}
            >
              只睇未讀
            </button>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`text-sm px-3 py-1 rounded-full border ${
                showArchived
                  ? "bg-amber-600 text-white border-amber-600"
                  : "border-border hover:bg-muted"
              }`}
            >
              已封存
            </button>
            <button
              onClick={() => { setShowTrashed((v) => !v); if (!showTrashed) { setShowArchived(false); setCategory(""); setUnreadOnly(false); } }}
              className={`text-sm px-3 py-1 rounded-full border ${
                showTrashed
                  ? "bg-red-600 text-white border-red-600"
                  : "border-border hover:bg-muted"
              }`}
            >
              垃圾桶
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground hidden md:inline">
            <kbd className="font-mono px-1 py-0.5 bg-muted border border-border rounded">j</kbd>
            /
            <kbd className="font-mono px-1 py-0.5 bg-muted border border-border rounded">k</kbd>{" "}
            導覽 ·{" "}
            <kbd className="font-mono px-1 py-0.5 bg-muted border border-border rounded">e</kbd>{" "}
            封存 ·{" "}
            <kbd className="font-mono px-1 py-0.5 bg-muted border border-border rounded">?</kbd>{" "}
            全部 shortcut
          </span>
          <span className="text-xs text-muted-foreground">
            {resultLabel}
          </span>
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : emails.length === 0 ? (
        <EmptyState
          message={
            debouncedQ || category || unreadOnly
              ? "冇符合條件嘅 email。"
              : "仲未有任何 email。連接 Gmail account 之後背景 sync 會自動填滿。"
          }
        />
      ) : (
        <>
          {/* Select-all + batch actions */}
          <div className="flex items-center gap-3 mb-2 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={emails.length > 0 && selected.size === emails.length}
                ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < emails.length; }}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelected(new Set(emails.map((em) => em.id)));
                  } else {
                    setSelected(new Set());
                  }
                }}
                className="w-4 h-4 rounded border-border accent-blue-600"
              />
              <span className="text-sm text-muted-foreground">全選</span>
            </label>
            {selected.size > 0 && (() => {
              const selectedEmails = emails.filter((e) => selected.has(e.id));
              const unreadIds = selectedEmails.filter((e) => !e.is_read).map((e) => e.id);
              const readIds = selectedEmails.filter((e) => e.is_read).map((e) => e.id);
              const busy =
                batchDeleteMutation.isPending || batchMarkReadMutation.isPending;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-blue-600 font-medium">
                    已選 {selected.size} 封
                  </span>
                  {unreadIds.length > 0 && (
                    <button
                      onClick={() =>
                        batchMarkReadMutation.mutate({ ids: unreadIds, read: true })
                      }
                      disabled={busy}
                      className="text-sm px-3 py-1 rounded border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
                    >
                      {batchMarkReadMutation.isPending
                        ? "處理中…"
                        : `📖 標已讀（${unreadIds.length}）`}
                    </button>
                  )}
                  {readIds.length > 0 && unreadIds.length === 0 && (
                    <button
                      onClick={() =>
                        batchMarkReadMutation.mutate({ ids: readIds, read: false })
                      }
                      disabled={busy}
                      className="text-sm px-3 py-1 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {batchMarkReadMutation.isPending
                        ? "處理中…"
                        : `📩 標未讀（${readIds.length}）`}
                    </button>
                  )}
                  <button
                    onClick={() => batchDeleteMutation.mutate([...selected])}
                    disabled={busy}
                    className="text-sm px-3 py-1 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {batchDeleteMutation.isPending ? "刪除中…" : "🗑 批量刪除"}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-sm px-2 py-1 text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </button>
                </div>
              );
            })()}
          </div>

          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {emails.map((email, idx) => (
              <li
                key={email.id}
                data-email-cursor={idx}
                onMouseEnter={() => setCursor(idx)}
                className={`group relative hover:bg-muted ${email.is_read ? "opacity-60" : ""} ${
                  idx === cursor
                    ? "bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-400"
                    : ""
                }`}
              >
                <Swipeable
                  onSwipeLeft={
                    showTrashed
                      ? undefined
                      : () => {
                          const isPromo = email.classification?.final_category === "promotional";
                          if (isPromo) {
                            deleteMutation.mutate(email.id);
                          } else {
                            setDeleteTarget(email.id);
                          }
                        }
                  }
                  onSwipeRight={
                    showTrashed
                      ? undefined
                      : () => archiveMutation.mutate({ id: email.id, archive: !showArchived })
                  }
                  leftAction={showTrashed ? undefined : { label: "🗑 刪除", color: "bg-red-500" }}
                  rightAction={showTrashed ? undefined : { label: showArchived ? "📤 取消封存" : "📥 封存", color: "bg-green-500" }}
                >
                <div className="flex items-start">
                  <label
                    className="flex items-center pl-3 pt-4 pr-1 cursor-pointer shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(email.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) {
                          next.add(email.id);
                        } else {
                          next.delete(email.id);
                        }
                        setSelected(next);
                      }}
                      className="w-4 h-4 rounded border-border accent-blue-600"
                    />
                  </label>
                <Link href={`/inbox/detail?id=${email.id}${showArchived ? "&archived=1" : ""}${category ? `&category=${category}` : ""}${folder !== "inbox" ? `&folder=${folder}` : ""}`} className="block flex-1 p-4 pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`truncate ${email.is_read ? "font-normal" : "font-semibold"}`}
                      >
                        {!email.is_read && (
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2 align-middle" />
                        )}
                        {email.subject || "(無主題)"}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {folder === "sent" ? `收件者：${email.recipients || email.sender_email}` : email.sender}
                      </div>
                      <div className="text-sm mt-1 line-clamp-2">
                        {email.snippet}
                      </div>
                    </div>
                    {folder === "inbox" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {email.smart_label && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                            style={{
                              backgroundColor: `${email.smart_label.color}18`,
                              borderColor: email.smart_label.color,
                              color: email.smart_label.color,
                            }}
                            title={`已歸檔至「${email.smart_label.name}」`}
                          >
                            {email.smart_label.name}
                          </span>
                        )}
                        <ClassificationChip
                          email={email}
                          editingId={editingCategoryId}
                          setEditingId={setEditingCategoryId}
                          onChangeCategory={(id, cat) =>
                            categoryMutation.mutate({ emailId: id, newCategory: cat })
                          }
                        />
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex gap-1 px-4 pb-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {folder === "sent" ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(email.received_at).toLocaleDateString("zh-HK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : showTrashed ? (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); restoreMutation.mutate(email.id); }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        還原
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(email.id); }}
                        className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                      >
                        永久刪除
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveMutation.mutate({ id: email.id, archive: !showArchived }); }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={showArchived ? "取消封存" : "封存"}
                      >
                        📥 {showArchived ? "取消封存" : "封存"}
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); markReadMutation.mutate({ id: email.id, read: !email.is_read }); }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={email.is_read ? "標為未讀" : "標為已讀"}
                      >
                        {email.is_read ? "📭 標為未讀" : "📬 標為已讀"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const isPromo = email.classification?.final_category === "promotional";
                          if (isPromo) {
                            deleteMutation.mutate(email.id);
                          } else {
                            setDeleteTarget(email.id);
                          }
                        }}
                        className="text-xs px-2 py-1 rounded border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                        title="刪除"
                      >
                        🗑 刪除
                      </button>
                    </>
                  )}
                </div>
                </div>
                </Swipeable>
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 border border-border rounded disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-muted-foreground">
                第 {page + 1} / {lastPage + 1} 頁
              </span>
              <button
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                className="px-3 py-1 border border-border rounded disabled:opacity-40"
              >
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={showTrashed ? "永久刪除 Email" : "刪除 Email"}
        message={showTrashed ? "確定要永久刪除呢封 email？刪除後無法還原。" : "確定要刪除呢封 email？會移到垃圾桶保留 7 日。"}
        confirmLabel={showTrashed ? "永久刪除" : "刪除"}
        cancelLabel="取消"
        onConfirm={() => {
          if (deleteTarget !== null) {
            if (showTrashed) {
              permanentDeleteMutation.mutate(deleteTarget);
            } else {
              deleteMutation.mutate(deleteTarget);
            }
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
