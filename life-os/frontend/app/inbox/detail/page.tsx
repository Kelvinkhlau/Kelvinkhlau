"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type EmailDetail,
  type EmailAttachment,
  type AiReplyDraft,
  type EmailTranslation,
  type EmailSummary,
  type VaultFile,
} from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { VaultFilePicker } from "@/components/VaultFilePicker";
import { useHotkey } from "@/lib/hotkeys";
import { usePaletteContext } from "@/components/command/paletteContext";
import { pushRecent } from "@/lib/recents";
import { getAutoMarkRead } from "@/lib/preferences";

/** 行動提醒 Banner — 需要用戶做嘢嘅 email 會顯示 */
function ActionBanner({ email }: { email: EmailDetail }) {
  const [creatingTodo, setCreatingTodo] = useState(false);
  const [creatingCal, setCreatingCal] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const cls = email.classification;
  if (!cls || !cls.action_required) return null;

  const handleCreate = async (type: "todo" | "calendar") => {
    const setter = type === "todo" ? setCreatingTodo : setCreatingCal;
    setter(true);
    try {
      const res = await api.createEmailAction(email.id, {
        action_type: type,
        title: cls.action_summary || undefined,
        due_at: cls.action_deadline || undefined,
      });
      if (res.ok) {
        setCreated(type);
        toast.success(
          type === "todo"
            ? "已加入待辦事項"
            : "已加入行事曆"
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setter(false);
    }
  };

  const deadlineStr = cls.action_deadline
    ? new Date(cls.action_deadline + "T00:00:00").toLocaleDateString("zh-HK", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // 計算剩餘日數
  let daysLeft: number | null = null;
  if (cls.action_deadline) {
    const deadline = new Date(cls.action_deadline + "T23:59:59");
    const now = new Date();
    daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const urgentClass =
    daysLeft !== null && daysLeft <= 3
      ? "border-red-400 bg-red-50 dark:bg-red-950/30"
      : daysLeft !== null && daysLeft <= 7
        ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
        : "border-blue-400 bg-blue-50 dark:bg-blue-950/30";

  return (
    <section className={`p-4 rounded-lg border-2 ${urgentClass}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚡</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm mb-1">需要行動</div>
          {cls.action_summary && (
            <p className="text-sm mb-2">{cls.action_summary}</p>
          )}
          {deadlineStr && (
            <div className="text-xs text-muted-foreground mb-3">
              截止日期：{deadlineStr}
              {daysLeft !== null && (
                <span
                  className={`ml-2 font-bold ${
                    daysLeft <= 3
                      ? "text-red-600"
                      : daysLeft <= 7
                        ? "text-amber-600"
                        : "text-blue-600"
                  }`}
                >
                  （{daysLeft <= 0 ? "已過期！" : `剩餘 ${daysLeft} 日`}）
                </span>
              )}
            </div>
          )}
          {created ? (
            <div className="text-sm text-green-600 font-medium">
              ✓ 已加入{created === "todo" ? "待辦事項" : "行事曆"}
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleCreate("todo")}
                disabled={creatingTodo}
                className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingTodo ? "建立中…" : "✅ 加入待辦事項"}
              </button>
              <button
                onClick={() => handleCreate("calendar")}
                disabled={creatingCal}
                className="px-3 py-1.5 text-sm font-medium border border-blue-400 text-blue-600 rounded hover:bg-blue-100 dark:hover:bg-blue-950 disabled:opacity-50"
              >
                {creatingCal ? "建立中…" : "📅 加入行事曆"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** AI 工具：翻譯 + 分析重點（按鈕觸發，結果 cache 喺 component state） */
function EmailAiTools({ email }: { email: EmailDetail }) {
  const [translation, setTranslation] = useState<EmailTranslation | null>(null);
  const [summary, setSummary] = useState<EmailSummary | null>(null);
  const [loadingTranslate, setLoadingTranslate] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // email 切換時重置
  useEffect(() => {
    setTranslation(null);
    setSummary(null);
    setShowTranslation(false);
    setShowSummary(false);
  }, [email.id]);

  const handleTranslate = async () => {
    if (translation) {
      setShowTranslation((v) => !v);
      return;
    }
    setLoadingTranslate(true);
    try {
      const res = await api.translateEmail(email.id);
      setTranslation(res);
      setShowTranslation(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingTranslate(false);
    }
  };

  const handleSummarize = async () => {
    if (summary) {
      setShowSummary((v) => !v);
      return;
    }
    setLoadingSummary(true);
    try {
      const res = await api.summarizeEmail(email.id);
      setSummary(res);
      setShowSummary(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loadingTranslate}
          className="px-3 py-1.5 text-sm font-medium border border-teal-300 text-teal-700 dark:text-teal-300 rounded-full hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:opacity-50"
          title="翻譯做繁體中文"
        >
          {loadingTranslate
            ? "翻譯中…"
            : translation
              ? showTranslation
                ? "🌐 收起翻譯"
                : "🌐 展開翻譯"
              : "🌐 翻譯"}
        </button>
        <button
          type="button"
          onClick={handleSummarize}
          disabled={loadingSummary}
          className="px-3 py-1.5 text-sm font-medium border border-indigo-300 text-indigo-700 dark:text-indigo-300 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50"
          title="AI 分析重點"
        >
          {loadingSummary
            ? "分析中…"
            : summary
              ? showSummary
                ? "💡 收起重點"
                : "💡 展開重點"
              : "💡 分析重點"}
        </button>
      </div>

      {showSummary && summary && (
        <div className="p-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 space-y-3">
          <div>
            <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
              一句話總結
            </div>
            <p className="text-sm font-medium">{summary.tldr || "（冇摘要）"}</p>
          </div>
          {summary.key_points.length > 0 && (
            <div>
              <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                重點
              </div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {summary.key_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.action_needed && (
            <div>
              <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                需要行動
              </div>
              <p className="text-sm">{summary.action_needed}</p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">by {summary.model}</p>
        </div>
      )}

      {showTranslation && translation && (
        <div className="p-4 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/30">
          <div className="text-xs font-medium text-teal-700 dark:text-teal-300 mb-2">
            繁體中文翻譯
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {translation.translation}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">by {translation.model}</p>
        </div>
      )}
    </section>
  );
}

/** Inline 回覆表單 */
function ReplyForm({
  email,
  openSignal,
}: {
  email: EmailDetail;
  openSignal: number;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      // Delay to allow textarea to mount
      setTimeout(() => bodyRef.current?.focus(), 50);
    }
  }, [openSignal]);
  const [body, setBody] = useState("");
  const [instructions, setInstructions] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [account, setAccount] = useState<string>("gmail");
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
      // Safari 唔支援 webm，要用 mp4；Chrome/Firefox 用 webm
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
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
          setShowInstructions(true);
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

  const vaultIds = vaultFiles.map((f) => f.id);

  const sendMutation = useMutation({
    mutationFn: () =>
      api.replyEmail(
        email.id,
        body,
        files.length ? files : undefined,
        vaultIds.length ? vaultIds : undefined,
        account,
      ),
    onSuccess: (res) => {
      if (res.ok) {
        const label = accounts?.find((a) => a.id === account)?.label || account;
        toast.success(`已透過 ${label} 發送回覆`);
        setBody("");
        setInstructions("");
        setFiles([]);
        setVaultFiles([]);
        setOpen(false);
      } else {
        toast.error(res.error || "發送失敗");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const draftMutation = useMutation({
    mutationFn: () =>
      api.saveReplyDraft(
        email.id,
        body,
        files.length ? files : undefined,
        vaultIds.length ? vaultIds : undefined,
      ),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("已儲存至 Gmail 草稿");
        setBody("");
        setInstructions("");
        setFiles([]);
        setVaultFiles([]);
        setOpen(false);
      } else {
        toast.error(res.error || "儲存草稿失敗");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleAiDraft = async () => {
    setAiLoading(true);
    try {
      const result: AiReplyDraft = await api.suggestReply(
        email.id,
        instructions.trim() || undefined,
      );
      setBody(result.draft);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="border-t border-border pt-4">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          回覆
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="text-sm text-muted-foreground">
        回覆：{email.sender} &lt;{email.sender_email}&gt;
      </div>
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
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="輸入回覆內容…"
        rows={6}
        className="w-full rounded border border-border bg-background p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {/* AI instructions */}
      {showInstructions ? (
        <div className="space-y-1">
          <label className="text-xs font-medium text-purple-600 dark:text-purple-400">
            AI 指示（想回覆嘅大意、語氣、要求）
          </label>
          <div className="flex gap-2">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="例：禮貌拒絕、回覆話已收到會跟進、用英文回覆…"
              rows={2}
              className="flex-1 rounded border border-purple-200 bg-background p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-400"
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
              title={recording ? "停止錄音" : "語音輸入指示"}
            >
              {transcribing ? "..." : recording ? "⏹" : "🎙"}
            </button>
          </div>
        </div>
      ) : null}
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
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending || draftMutation.isPending || !body.trim()}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {sendMutation.isPending ? "發送中…" : "發送"}
        </button>
        <button
          onClick={() => draftMutation.mutate()}
          disabled={draftMutation.isPending || sendMutation.isPending || !body.trim()}
          className="px-4 py-2 text-sm font-medium border border-amber-400 text-amber-600 rounded hover:bg-amber-50 disabled:opacity-50"
        >
          {draftMutation.isPending ? "儲存中…" : "保留草稿"}
        </button>
        <button
          onClick={() => {
            if (!showInstructions) {
              setShowInstructions(true);
            } else {
              handleAiDraft();
            }
          }}
          disabled={aiLoading}
          className="px-4 py-2 text-sm font-medium border border-purple-300 text-purple-600 rounded hover:bg-purple-50 disabled:opacity-50"
        >
          {aiLoading ? "AI 生成中…" : showInstructions ? "生成 AI 回覆" : "AI 建議回覆"}
        </button>
        {showInstructions && !aiLoading && (
          <button
            onClick={() => { setShowInstructions(false); setInstructions(""); }}
            className="px-3 py-2 text-xs text-muted-foreground hover:underline"
          >
            收起指示
          </button>
        )}
        <button
          onClick={() => { setOpen(false); setBody(""); setInstructions(""); setShowInstructions(false); setFiles([]); setVaultFiles([]); }}
          className="px-4 py-2 text-sm font-medium border border-border rounded hover:bg-muted"
        >
          取消
        </button>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:underline">顯示原文</summary>
        <div className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3">
          {email.body_text || email.snippet}
        </div>
      </details>
      {showVaultPicker && (
        <VaultFilePicker
          selectedIds={vaultFiles.map((f) => f.id)}
          onClose={() => setShowVaultPicker(false)}
          onConfirm={(picked) => setVaultFiles(picked)}
        />
      )}
    </div>
  );
}

const CATEGORIES = [
  { value: "important", label: "重要" },
  { value: "normal", label: "一般" },
  { value: "promotional", label: "廣告" },
];

/** 將純文字 URL 轉成可點擊 <a> 連結（跳過已經在 <a> 內嘅） */
function linkifyTextNodes(doc: Document) {
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 跳過已經在 <a> 標籤內嘅文字
      let parent = node.parentElement;
      while (parent) {
        if (parent.tagName === "A") return NodeFilter.FILTER_REJECT;
        if (parent.tagName === "BODY") break;
        parent = parent.parentElement;
      }
      return urlRe.test(node.textContent || "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) textNodes.push(n as Text);

  for (const tn of textNodes) {
    const text = tn.textContent || "";
    urlRe.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(text))) {
      if (m.index > lastIdx) {
        frag.appendChild(doc.createTextNode(text.slice(lastIdx, m.index)));
      }
      const a = doc.createElement("a");
      a.href = m[0];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = m[0];
      a.style.color = "#2563eb";
      a.style.wordBreak = "break-all";
      frag.appendChild(a);
      lastIdx = urlRe.lastIndex;
    }
    if (lastIdx < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
    }
    tn.parentNode?.replaceChild(frag, tn);
  }
}

/** 用 sandbox iframe 安全地顯示 HTML email（包括外部圖片）。 */
function EmailHtmlViewer({ html, fontSize = 14 }: { html: string; fontSize?: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height =
      iframe.contentDocument.body.scrollHeight + 16 + "px";
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // 安全清洗：防止 email 嘅 <meta http-equiv="refresh"> 觸發 iframe 自動跳轉
    // （iOS PWA 入面，iframe 跳去 taobao.com / tmall.com 等會觸發 Universal Link，自動開 app）
    const safeHtml = html
      .replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<script\b[^>]*\/?>/gi, "")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<iframe\b[^>]*\/?>/gi, "");

    doc.open();
    // Email HTML 係 sender 設計嘅（通常假設白底黑字），所以固定用 light mode 渲染
    // iframe — 即使 app 用緊 dark mode，email body 永遠白底，同 Gmail / Apple Mail 一致。
    doc.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<base target="_blank">
<style>
  html, body { background: #ffffff; color: #1f2937; color-scheme: light; }
  body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: ${fontSize}px; line-height: 1.6; word-break: break-word; overflow-wrap: break-word; }
  /* 只 fallback — 唔覆蓋 sender 自己嘅 color */
  img { max-width: 100%; height: auto; }
  /* 禁用任何 iframe / embed / object 嘗試 */
  iframe, embed, object, frame { display: none !important; }
  blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; margin-left: 0; color: #475569; }
  /* 防止 sender 用白字白底 / 透明底白字嘅情況 — 將明顯過淺嘅 inline color fallback 返黑字 */
  [style*="color:#fff"], [style*="color: #fff"],
  [style*="color:#FFF"], [style*="color: #FFF"],
  [style*="color:white"], [style*="color: white"],
  [style*="color:rgb(255,255,255)"], [style*="color: rgb(255, 255, 255)"] {
    color: #1f2937 !important;
  }
</style>
</head><body>${safeHtml}</body></html>`);
    doc.close();

    // 再掃一次 body，移除所有 meta refresh / base 跳轉（doc.write 後某啲 attack 會喺 DOM 裡面）
    doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach((el) => el.remove());
    doc.querySelectorAll('meta[http-equiv="Refresh"]').forEach((el) => el.remove());

    // 將純文字 URL 轉成可點擊連結
    linkifyTextNodes(doc);

    const images = doc.querySelectorAll("img");
    let loaded = 0;
    const total = images.length;
    if (total === 0) {
      adjustHeight();
    } else {
      images.forEach((img) => {
        const check = () => {
          loaded++;
          if (loaded >= total) adjustHeight();
        };
        if (img.complete) {
          check();
        } else {
          img.addEventListener("load", check);
          img.addEventListener("error", check);
        }
      });
    }

    const timer = setTimeout(adjustHeight, 1000);
    return () => clearTimeout(timer);
  }, [html, adjustHeight, fontSize]);

  // 外層加一個白色 rounded wrapper，令 dark mode 之下個 email「紙張感」clear，唔會似 bug。
  return (
    <div className="rounded-md overflow-hidden bg-white border border-border shadow-sm">
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="w-full border-0 bg-white"
        style={{ minHeight: 200 }}
        title="Email content"
      />
    </div>
  );
}

/** 格式化檔案大小 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 附件圖示（按 mime type） */
function attachmentIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("zip") || mime.includes("compress")) return "🗜";
  if (mime === "text/calendar") return "📅";
  return "📎";
}

function isPreviewable(mime: string): boolean {
  return mime === "application/pdf" || mime.startsWith("image/");
}

/** 附件列表 — 下載 + 預覽 */
function AttachmentList({
  emailId,
  attachments,
}: {
  emailId: number;
  attachments: EmailAttachment[];
}) {
  const [busy, setBusy] = useState<Record<number, "download" | "preview" | null>>({});

  if (!attachments.length) return null;

  const handleDownload = async (att: EmailAttachment) => {
    setBusy((s) => ({ ...s, [att.id]: "download" }));
    try {
      const url = await api.fetchEmailAttachmentBlobUrl(emailId, att.id, false);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename || `attachment-${att.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 延遲釋放 blob URL，等 browser 開始落檔先
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error((e as Error).message || "下載失敗");
    } finally {
      setBusy((s) => ({ ...s, [att.id]: null }));
    }
  };

  const handlePreview = async (att: EmailAttachment) => {
    setBusy((s) => ({ ...s, [att.id]: "preview" }));
    try {
      const url = await api.fetchEmailAttachmentBlobUrl(emailId, att.id, true);
      window.open(url, "_blank", "noopener,noreferrer");
      // 唔即刻 revoke，俾新 tab 有時間載入
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error((e as Error).message || "預覽失敗");
    } finally {
      setBusy((s) => ({ ...s, [att.id]: null }));
    }
  };

  return (
    <section className="border-t border-border pt-4">
      <div className="text-sm font-medium mb-2 flex items-center gap-2">
        📎 附件
        <span className="text-xs text-muted-foreground font-normal">
          ({attachments.length})
        </span>
      </div>
      <ul className="space-y-2">
        {attachments.map((att) => {
          const previewable = isPreviewable(att.mime_type);
          const isBusy = busy[att.id];
          return (
            <li
              key={att.id}
              className="flex items-center gap-3 p-2 border border-border rounded-md bg-muted/30"
            >
              <span className="text-xl shrink-0">{attachmentIcon(att.mime_type)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={att.filename}>
                  {att.filename || `(未命名附件 #${att.id})`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {att.mime_type} · {formatBytes(att.size_bytes)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {previewable && (
                  <button
                    onClick={() => handlePreview(att)}
                    disabled={!!isBusy}
                    className="px-2.5 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
                    title="喺新視窗預覽"
                  >
                    {isBusy === "preview" ? "…" : "👁 預覽"}
                  </button>
                )}
                <button
                  onClick={() => handleDownload(att)}
                  disabled={!!isBusy}
                  className="px-2.5 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50"
                  title="下載"
                >
                  {isBusy === "download" ? "…" : "⬇ 下載"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmailDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = Number(searchParams.get("id"));
  const archived = searchParams.get("archived") === "1";
  const filterCategory = searchParams.get("category") || "";
  const folderParam = searchParams.get("folder") || "";
  const filterFolder: "inbox" | "icloud" | "sent" | "" =
    folderParam === "icloud" || folderParam === "sent" || folderParam === "inbox"
      ? folderParam
      : "";
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [replyOpenSignal, setReplyOpenSignal] = useState(0);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return 14;
    const saved = localStorage.getItem("emailFontSize");
    return saved ? parseInt(saved, 10) : 14;
  });

  const changeFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(10, Math.min(24, prev + delta));
      localStorage.setItem("emailFontSize", String(next));
      return next;
    });
  };

  // 保留 filter context 喺導航 link 入面
  const navQs = [
    archived ? "archived=1" : "",
    filterCategory ? `category=${filterCategory}` : "",
    filterFolder ? `folder=${filterFolder}` : "",
  ].filter(Boolean).join("&");
  const navSuffix = navQs ? `&${navQs}` : "";

  const queryClient = useQueryClient();

  const { data: email, isLoading, error } = useQuery({
    queryKey: ["email", id, archived, filterCategory, filterFolder],
    queryFn: async () => {
      const e = await api.getEmail(id, {
        archived: archived || undefined,
        category: filterCategory || undefined,
        folder: filterFolder || undefined,
      });
      setCurrentCategory(e.classification?.final_category ?? null);
      // 只喺用戶設定咗「自動標已讀」先標。否則保留 unread 狀態。
      if (!e.is_read && getAutoMarkRead()) {
        api
          .markRead(id, true)
          .then(() => {
            // 通知其他頁 refetch（dashboard 未讀重要 / inbox 列表 / stats）
            queryClient.invalidateQueries({ queryKey: ["emails"] });
            queryClient.invalidateQueries({ queryKey: ["emailStats"] });
          })
          .catch((err) => {
            console.warn("[mark-read] failed for email", id, err);
          });
      }
      return e;
    },
    enabled: Number.isFinite(id) && id > 0,
  });

  // Track as recent for ⌘K palette
  useEffect(() => {
    if (email) {
      pushRecent({
        kind: "entity",
        href: `/inbox/detail?id=${email.id}`,
        title: email.subject || "(無主題)",
        subtitle: email.sender,
        entityType: "email",
      });
    }
  }, [email?.id]);

  const categoryMutation = useMutation({
    mutationFn: (category: string) => api.updateCategory(id, category),
    onSuccess: (res) => setCurrentCategory(res.final_category),
    onError: (e) => toast.error((e as Error).message),
  });

  const reclassifyMutation = useMutation({
    mutationFn: () => api.reclassifyEmail(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email", id] });
      toast.success("已重新分析");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const muteMutation = useMutation({
    mutationFn: () =>
      api.addMuted({
        email: email!.sender_email,
        name: email!.sender,
        reason: "從 inbox 封鎖",
      }),
    onSuccess: () => {
      toast.success("已封鎖寄件者");
      if (email?.next_id) {
        router.push(`/inbox/detail?id=${email.next_id}${navSuffix}`);
      } else {
        router.push("/inbox");
      }
    },
    onError: (e) => {
      const msg = (e as Error).message;
      toast.error(msg);
    },
  });

  /** 跳到下一封，冇就返回 inbox */
  const goNextOrInbox = () => {
    if (email?.next_id) {
      router.push(`/inbox/detail?id=${email.next_id}${navSuffix}`);
    } else if (email?.prev_id) {
      router.push(`/inbox/detail?id=${email.prev_id}${navSuffix}`);
    } else {
      router.push("/inbox");
    }
  };

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveEmail(id, !email!.is_archived),
    onSuccess: (res) => {
      toast.success(res.is_archived ? "已封存" : "已取消封存");
      goNextOrInbox();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteEmail(id),
    onSuccess: () => {
      toast.success("已刪除");
      goNextOrInbox();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const markUnreadMutation = useMutation({
    mutationFn: () => api.markRead(id, false),
    onSuccess: () => {
      toast.success("已標記為未讀");
      goNextOrInbox();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ─── Keyboard shortcuts (Superhuman-style triage) ────────────
  const { paletteOpen, captureOpen, helpOpen } = usePaletteContext();
  const hotkeysActive = !paletteOpen && !captureOpen && !helpOpen && !deleteConfirm && !!email;

  useHotkey("j", () => {
    if (email?.next_id) {
      router.push(`/inbox/detail?id=${email.next_id}${navSuffix}`);
    }
  }, { when: hotkeysActive });

  useHotkey("k", () => {
    if (email?.prev_id) {
      router.push(`/inbox/detail?id=${email.prev_id}${navSuffix}`);
    }
  }, { when: hotkeysActive });

  useHotkey("e", () => {
    if (!archiveMutation.isPending) archiveMutation.mutate();
  }, { when: hotkeysActive });

  useHotkey("#", () => {
    if (deleteMutation.isPending) return;
    if (currentCategory === "promotional") {
      deleteMutation.mutate();
    } else {
      setDeleteConfirm(true);
    }
  }, { when: hotkeysActive });

  useHotkey("u", () => {
    if (!markUnreadMutation.isPending) markUnreadMutation.mutate();
  }, { when: hotkeysActive });

  useHotkey("r", () => {
    setReplyOpenSignal((s) => s + 1);
  }, { when: hotkeysActive });

  useHotkey("esc", () => {
    router.push("/inbox");
  }, { when: hotkeysActive });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <main className="p-8">
        <div className="mt-4 text-red-600">無效 email id</div>
      </main>
    );
  }

  if (isLoading) return <Loading />;
  if (error) {
    return (
      <main className="p-8">
        <div className="mt-4 text-red-600">錯誤：{(error as Error).message}</div>
      </main>
    );
  }
  if (!email) return <main className="p-8">找不到 email</main>;

  const receivedAt = new Date(email.received_at);
  const isPromo = currentCategory === "promotional";

  return (
    <main className="min-h-full p-4 max-w-3xl mx-auto">
      {/* Toolbar: actions + navigation in one row */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
        <div className="flex gap-1.5">
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            {email.is_archived ? "📤 取消封存" : "📥 封存"}
          </button>
          <button
            onClick={() => markUnreadMutation.mutate()}
            disabled={markUnreadMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            📬 未讀
          </button>
          <button
            onClick={() => {
              if (currentCategory === "promotional") {
                deleteMutation.mutate();
              } else {
                setDeleteConfirm(true);
              }
            }}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-1 px-2.5 py-1 text-sm border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          >
            🗑 刪除
          </button>
        </div>
        <div className="flex gap-1.5">
          {email.prev_id ? (
            <Link
              href={`/inbox/detail?id=${email.prev_id}${navSuffix}`}
              className="px-2.5 py-1 text-sm font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
              title="上一封（較新）"
            >
              ← 上一封
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-sm border border-border rounded opacity-40 text-muted-foreground">
              ← 上一封
            </span>
          )}
          {email.next_id ? (
            <Link
              href={`/inbox/detail?id=${email.next_id}${navSuffix}`}
              className="px-2.5 py-1 text-sm font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
              title="下一封（較舊）"
            >
              下一封 →
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-sm border border-border rounded opacity-40 text-muted-foreground">
              下一封 →
            </span>
          )}
        </div>
      </div>

      <article className="space-y-4">
        <header className="border-b border-border pb-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h1 className="text-xl font-bold">
              {email.subject || "(無主題)"}
            </h1>
            {email.smart_label && (
              <Link
                href={`/smart-labels?label=${email.smart_label.id}`}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border hover:opacity-80"
                style={{
                  backgroundColor: `${email.smart_label.color}18`,
                  borderColor: email.smart_label.color,
                  color: email.smart_label.color,
                }}
                title={`已歸檔至「${email.smart_label.name}」`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: email.smart_label.color }} />
                {email.smart_label.name}
              </Link>
            )}
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">寄件者：</span>
              {email.sender} &lt;{email.sender_email}&gt;
            </div>
            <div>
              <span className="font-medium">收件者：</span>
              {email.recipients}
            </div>
            <div>
              <span className="font-medium">時間：</span>
              {receivedAt.toLocaleString("zh-HK")}
            </div>
          </div>
        </header>

        <section>
          <div className="text-sm font-medium mb-2">分類</div>
          <div className="flex gap-2 flex-wrap items-center">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                disabled={categoryMutation.isPending}
                onClick={() => categoryMutation.mutate(c.value)}
                className={`text-sm px-3 py-1 rounded-full border disabled:opacity-50 ${
                  currentCategory === c.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => !email.is_sender_muted && muteMutation.mutate()}
              disabled={muteMutation.isPending || email.is_sender_muted}
              className={`text-sm px-3 py-1 rounded-full border disabled:opacity-50 ml-2 ${
                email.is_sender_muted
                  ? "bg-red-600 text-white border-red-600"
                  : "border-red-300 text-red-600 hover:bg-red-50"
              }`}
              title={email.is_sender_muted ? "已封鎖此寄件者" : "封鎖此寄件者 — 以後嘅 email 自動 archive"}
            >
              {muteMutation.isPending ? "封鎖中…" : email.is_sender_muted ? "已封鎖" : "封鎖寄件者"}
            </button>
            <button
              onClick={() => reclassifyMutation.mutate()}
              disabled={reclassifyMutation.isPending}
              className="text-sm px-3 py-1 rounded-full border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-50 ml-1"
              title="重新用 AI 分析分類 + 行動偵測"
            >
              {reclassifyMutation.isPending ? "分析中…" : "🔍 重新分析"}
            </button>
          </div>
          {email.classification?.ai_reason && (
            <p className="text-xs text-muted-foreground mt-2">
              AI 原因：{email.classification.ai_reason}（信心{" "}
              {(email.classification.ai_confidence * 100).toFixed(0)}%）
            </p>
          )}
          {isPromo && (
            <p className="text-xs text-muted-foreground mt-1">
              如果想繼續收到呢個寄件者嘅 email，唔好撳「封鎖寄件者」。
            </p>
          )}
        </section>

        {/* Action banner — 需要行動嘅 email */}
        <ActionBanner email={email} />

        {/* AI 工具 — 翻譯 + 分析重點 */}
        <EmailAiTools email={email} />

        <section className="border-t border-border pt-4">
          <div className="flex items-center justify-end gap-1 mb-2">
            <button
              onClick={() => changeFontSize(-2)}
              className="w-8 h-8 flex items-center justify-center rounded border border-border text-sm hover:bg-muted"
              title="縮小字體"
            >A-</button>
            <span className="text-xs text-muted-foreground w-10 text-center">{fontSize}px</span>
            <button
              onClick={() => changeFontSize(2)}
              className="w-8 h-8 flex items-center justify-center rounded border border-border text-sm hover:bg-muted"
              title="放大字體"
            >A+</button>
          </div>
          {email.body_html ? (
            <EmailHtmlViewer html={email.body_html} fontSize={fontSize} />
          ) : (
            <div className="whitespace-pre-wrap leading-relaxed" style={{ fontSize }}>
              {email.body_text || email.snippet}
            </div>
          )}
        </section>

        {email.attachments && email.attachments.length > 0 && (
          <AttachmentList emailId={email.id} attachments={email.attachments} />
        )}

        <ReplyForm email={email} openSignal={replyOpenSignal} />
      </article>

      <ConfirmDialog
        open={deleteConfirm}
        title="刪除 Email"
        message="確定要刪除呢封 email？會移到垃圾桶保留 7 日。"
        confirmLabel="刪除"
        cancelLabel="取消"
        onConfirm={() => { deleteMutation.mutate(); setDeleteConfirm(false); }}
        onCancel={() => setDeleteConfirm(false)}
      />
    </main>
  );
}

export default function EmailDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EmailDetailContent />
    </Suspense>
  );
}
