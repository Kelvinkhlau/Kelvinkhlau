"use client";

/**
 * Note detail page — 全頁筆記檢視 / 編輯。
 *
 * URL: /notes/detail?id=123  （編輯已有筆記）
 *       /notes/detail         （新增筆記）
 *
 * 用 Suspense 包裝 useSearchParams（Next.js static export 需要）。
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Note,
  type NoteAttachment,
  type NoteContentFormat,
} from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EncryptionLockModal } from "@/components/EncryptionLockModal";
import { pushRecent } from "@/lib/recents";

// TipTap editor is ~140 kB — lazy-load so the initial notes/detail bundle stays light
const NoteEditor = dynamic(
  () => import("@/components/NoteEditor").then((m) => m.NoteEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">
        載入編輯器…
      </div>
    ),
  }
);
import { useEncryptionStore } from "@/lib/encryption-store";
import {
  decryptNotePayload,
  encryptNotePayload,
  type NotePlaintext,
} from "@/lib/crypto";

const ENCRYPTED_TITLE_PLACEHOLDER = "🔒 加密筆記";
const EMPTY_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── 附件 ─────────────────────────────── */
function AttachmentImage({ noteId, att }: { noteId: number; att: NoteAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    api.fetchNoteAttachmentBlobUrl(noteId, att.id).then((u) => {
      if (cancelled) { URL.revokeObjectURL(u); } else { objectUrl = u; setUrl(u); }
    }).catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [noteId, att.id]);
  if (!url) return <div className="aspect-video bg-muted animate-pulse rounded w-40" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={att.filename} className="max-w-full max-h-96 rounded border border-border" />;
}

function AttachmentDownloadButton({ noteId, att }: { noteId: number; att: NoteAttachment }) {
  const onClick = async () => {
    try {
      const url = await api.fetchNoteAttachmentBlobUrl(noteId, att.id);
      const a = document.createElement("a");
      a.href = url; a.download = att.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <button type="button" onClick={onClick} className="text-sm underline text-blue-600 hover:text-blue-800">
      📎 {att.filename}
      <span className="ml-2 text-xs text-muted-foreground">{formatBytes(att.size_bytes)}</span>
    </button>
  );
}

/* ── Main ─────────────────────────────── */
export default function NoteDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NoteDetailInner />
    </Suspense>
  );
}

function NoteDetailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const noteId = searchParams.get("id") ? Number(searchParams.get("id")) : null;
  const queryClient = useQueryClient();

  // Editor state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(EMPTY_DOC);
  const [contentFormat, setContentFormat] = useState<NoteContentFormat>("blocks");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [savedNote, setSavedNote] = useState<Note | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Encryption
  const masterKey = useEncryptionStore((s) => s.masterKey);
  const refreshEncryptionInfo = useEncryptionStore((s) => s.refreshInfo);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [pendingUnlockAction, setPendingUnlockAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    refreshEncryptionInfo().catch(() => {});
  }, [refreshEncryptionInfo]);

  // Fetch note data
  const { data: note, isLoading } = useQuery<Note>({
    queryKey: ["note", noteId],
    queryFn: () => api.getNote(noteId!),
    enabled: noteId !== null,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["noteFolders"],
    queryFn: () => api.listNoteFolders(),
  });

  // Track note as recent for ⌘K palette
  useEffect(() => {
    if (note) {
      pushRecent({
        kind: "entity",
        href: `/notes/detail?id=${note.id}`,
        title: note.title || "(無標題)",
        entityType: "note",
      });
    }
  }, [note?.id]);

  // Initialize form when note loads
  useEffect(() => {
    if (!note || initialized) return;

    if (note.is_encrypted && note.encrypted_payload && note.encryption_iv) {
      if (!masterKey) {
        // Need to unlock first
        setSavedNote(note);
        setFolder(note.folder);
        setIsEncrypted(true);
        setInitialized(true);
        // Prompt unlock
        setPendingUnlockAction(() => () => {
          // Will re-trigger via masterKey change
        });
        setLockModalOpen(true);
        return;
      }
      decryptNotePayload(note.encrypted_payload, note.encryption_iv, masterKey)
        .then((plain) => {
          setTitle(plain.title);
          setContent(plain.content || EMPTY_DOC);
          setContentFormat(plain.content_format || "blocks");
          setTags(plain.tags);
          setFolder(note.folder);
          setIsEncrypted(true);
          setSavedNote(note);
          setInitialized(true);
        })
        .catch((e) => toast.error(`解密失敗：${(e as Error).message}`));
      return;
    }

    setTitle(note.title);
    setContent(note.content || EMPTY_DOC);
    setContentFormat(note.content_format || "markdown");
    setFolder(note.folder);
    setTags(note.tags);
    setIsEncrypted(note.is_encrypted);
    setSavedNote(note);
    setInitialized(true);
  }, [note, initialized, masterKey]);

  // Re-decrypt when masterKey becomes available
  useEffect(() => {
    if (!masterKey || !note || !note.is_encrypted) return;
    if (title && title !== ENCRYPTED_TITLE_PLACEHOLDER) return; // already decrypted
    if (!note.encrypted_payload || !note.encryption_iv) return;
    decryptNotePayload(note.encrypted_payload, note.encryption_iv, masterKey)
      .then((plain) => {
        setTitle(plain.title);
        setContent(plain.content || EMPTY_DOC);
        setContentFormat(plain.content_format || "blocks");
        setTags(plain.tags);
      })
      .catch((e) => toast.error(`解密失敗：${(e as Error).message}`));
  }, [masterKey, note, title]);

  // For new notes, mark initialized immediately
  useEffect(() => {
    if (noteId === null && !initialized) setInitialized(true);
  }, [noteId, initialized]);

  // Save mutation
  type SavePayload = {
    title: string;
    content: string;
    content_format: NoteContentFormat;
    folder: string;
    tags: string;
    is_encrypted?: boolean;
    encrypted_payload?: string | null;
    encryption_iv?: string | null;
  };

  const saveMutation = useMutation({
    mutationFn: (payload: SavePayload) =>
      savedNote ? api.updateNote(savedNote.id, payload) : api.createNote(payload),
    onSuccess: (saved) => {
      setSavedNote(saved);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["noteFolders"] });
      queryClient.invalidateQueries({ queryKey: ["note", saved.id] });
      toast.success(noteId ? "已更新" : "已儲存");
      // If was a new note, update URL to include id
      if (!noteId) {
        router.replace(`/notes/detail?id=${saved.id}`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("已刪除");
      router.push("/notes");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast.info("請輸入標題");
      return;
    }

    if (!isEncrypted) {
      saveMutation.mutate({
        title, content, content_format: "blocks", folder, tags,
        is_encrypted: savedNote?.is_encrypted ? false : undefined,
        encrypted_payload: savedNote?.is_encrypted ? null : undefined,
        encryption_iv: savedNote?.is_encrypted ? null : undefined,
      });
      return;
    }

    if (!masterKey) {
      setPendingUnlockAction(() => () => void handleSave());
      setLockModalOpen(true);
      return;
    }

    try {
      const plain: NotePlaintext = { title, content, content_format: "blocks", tags };
      const { encrypted_payload, encryption_iv } = await encryptNotePayload(plain, masterKey);
      saveMutation.mutate({
        title: ENCRYPTED_TITLE_PLACEHOLDER,
        content: "", content_format: "blocks",
        folder, tags: "",
        is_encrypted: true, encrypted_payload, encryption_iv,
      });
    } catch (e) {
      toast.error(`加密失敗：${(e as Error).message}`);
    }
  };

  // Ensure draft for attachments
  const ensureDraftNote = useCallback(async (): Promise<Note | null> => {
    if (savedNote) return savedNote;
    if (!title.trim()) { toast.info("請先輸入標題再加附件"); return null; }
    try {
      const draft = await api.createNote({
        title, content, content_format: "blocks", folder, tags,
      });
      setSavedNote(draft);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      router.replace(`/notes/detail?id=${draft.id}`);
      return draft;
    } catch (e) { toast.error((e as Error).message); return null; }
  }, [savedNote, title, content, folder, tags, queryClient, router]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    const target = await ensureDraftNote();
    if (!target) return;
    setUploading(true);
    try {
      const uploaded: NoteAttachment[] = [];
      for (const file of Array.from(files)) {
        const att = await api.uploadNoteAttachment(target.id, file);
        uploaded.push(att);
      }
      const newAtts = [...(target.attachments ?? []), ...uploaded];
      const updated = { ...target, attachments: newAtts };
      setSavedNote(updated);
      toast.success(`已加入 ${uploaded.length} 個附件`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const handleDeleteAttachment = async (attId: number) => {
    if (!savedNote) return;
    try {
      await api.deleteNoteAttachment(savedNote.id, attId);
      const newAtts = (savedNote.attachments ?? []).filter((a) => a.id !== attId);
      setSavedNote({ ...savedNote, attachments: newAtts });
      toast.success("已刪除附件");
    } catch (e) { toast.error((e as Error).message); }
  };

  // Loading state
  if (noteId !== null && isLoading) {
    return (
      <main className="min-h-full max-w-3xl mx-auto p-4">
        <Loading />
      </main>
    );
  }

  // Encrypted but not unlocked
  const needsUnlock = isEncrypted && !masterKey && noteId !== null && !title;

  return (
    <main className="min-h-full max-w-3xl mx-auto p-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/notes"
          className="text-sm px-3 py-1.5 border border-border rounded hover:bg-muted shrink-0"
        >
          ← 返回
        </Link>
        <div className="flex-1" />
        {savedNote && (
          <button
            type="button"
            onClick={() => setDeleteTarget(true)}
            className="text-xs text-red-500 hover:underline"
          >
            刪除
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending || needsUnlock}
          className="px-4 py-1.5 bg-foreground text-background rounded font-medium text-sm disabled:opacity-50"
        >
          {saveMutation.isPending ? "儲存中…" : "儲存"}
        </button>
      </div>

      {needsUnlock ? (
        /* Encrypted note — prompt unlock */
        <div className="py-16 text-center space-y-4">
          <p className="text-2xl">🔒</p>
          <p className="text-muted-foreground">呢篇筆記已加密</p>
          <button
            type="button"
            onClick={() => {
              setPendingUnlockAction(() => () => {});
              setLockModalOpen(true);
            }}
            className="px-4 py-2 border border-border rounded hover:bg-muted"
          >
            輸入密碼解鎖
          </button>
        </div>
      ) : (
        <>
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="筆記標題"
            className="w-full text-2xl font-bold bg-transparent border-none outline-none mb-4 placeholder:text-muted-foreground/50"
            autoFocus={!noteId}
          />

          {/* Editor */}
          {initialized && (
            <NoteEditor
              key={savedNote ? `edit-${savedNote.id}` : "new"}
              noteId={savedNote?.id ?? null}
              ensureNoteId={async () => {
                const n = await ensureDraftNote();
                return n?.id ?? null;
              }}
              initialContent={content}
              initialFormat={contentFormat}
              onChange={(json) => setContent(json)}
              onAttachmentAdded={(att) => {
                if (!savedNote) return;
                const updated = { ...savedNote, attachments: [...(savedNote.attachments ?? []), att] };
                setSavedNote(updated);
              }}
            />
          )}

          {/* Metadata */}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Folder（例：技術）"
              className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
              list="folder-opts"
            />
            <datalist id="folder-opts">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags（逗號分隔）"
              className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm"
            />
          </div>

          {/* Encryption toggle */}
          <label className="flex items-center gap-2 text-sm select-none cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={isEncrypted}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked && !masterKey) {
                  setPendingUnlockAction(() => () => setIsEncrypted(true));
                  setLockModalOpen(true);
                  return;
                }
                setIsEncrypted(checked);
              }}
            />
            <span>🔒 加密此筆記</span>
          </label>

          {/* Attachments */}
          <div
            className={`mt-4 p-3 border-2 border-dashed rounded transition ${
              isDragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setIsDragOver(false);
              if (e.dataTransfer.files.length > 0) handleUploadFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground gap-2">
              <span>拖放檔案到此處，或</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1 border border-border rounded hover:bg-muted disabled:opacity-50 font-medium"
              >
                {uploading ? "上載中…" : "＋ 加附件"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            {savedNote && (savedNote.attachments ?? []).length > 0 && (
              <div className="mt-3 space-y-2">
                {(savedNote.attachments ?? []).map((att) => (
                  <div key={att.id} className="group flex items-center gap-2">
                    {att.mime_type.startsWith("image/") ? (
                      <AttachmentImage noteId={savedNote.id} att={att} />
                    ) : (
                      <AttachmentDownloadButton noteId={savedNote.id} att={att} />
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="text-xs text-red-500 opacity-0 group-hover:opacity-100 hover:underline"
                    >
                      刪
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Note meta info */}
          {savedNote && (
            <div className="mt-4 text-xs text-muted-foreground">
              建立：{savedNote.created_at.slice(0, 16).replace("T", " ")} · 更新：{savedNote.updated_at.slice(0, 16).replace("T", " ")}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={deleteTarget}
        title="刪除筆記"
        message="確定要刪除呢個筆記？"
        onConfirm={() => {
          if (savedNote) deleteMutation.mutate(savedNote.id);
          setDeleteTarget(false);
        }}
        onCancel={() => setDeleteTarget(false)}
      />

      <EncryptionLockModal
        open={lockModalOpen}
        onClose={() => { setLockModalOpen(false); setPendingUnlockAction(null); }}
        onUnlocked={() => {
          const next = pendingUnlockAction;
          setPendingUnlockAction(null);
          if (next) next();
        }}
      />
    </main>
  );
}
