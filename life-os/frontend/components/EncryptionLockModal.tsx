"use client";

import { useEffect, useRef, useState } from "react";

import { useEncryptionStore } from "@/lib/encryption-store";
import { toast } from "@/components/Toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}

/** Strip HTML + collapse whitespace so error messages can't blow up the modal. */
function truncate(msg: string, max = 160): string {
  const clean = msg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/**
 * 加密 master password 設定 / 解鎖 modal。
 *
 * - 如果 server 未有 salt + verifier → setup 模式，要確認密碼
 * - 如果已經 setup → unlock 模式，只需一個密碼
 *
 * 成功之後 masterKey 會放入 encryption store，然後 call onUnlocked。
 */
export function EncryptionLockModal({ open, onClose, onUnlocked }: Props) {
  const {
    info,
    loadingInfo,
    refreshInfo,
    setupMasterPassword,
    unlockWithPassword,
  } = useEncryptionStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setError(null);
    // Fetch latest info when opening（避免 stale state）
    refreshInfo().catch((e) =>
      setError(
        "無法連線加密設定 API — 請確認 backend 已更新重啟。" +
          ` (${truncate((e as Error).message)})`
      )
    );
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, refreshInfo]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  const isSetup = info && !info.configured;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setBusy(true);
    try {
      if (isSetup) {
        if (password.length < 8) {
          setError("密碼至少 8 個字元");
          return;
        }
        if (password !== confirm) {
          setError("兩次輸入嘅密碼唔一樣");
          return;
        }
        await setupMasterPassword(password);
        toast.success("已設定 master password");
      } else {
        const ok = await unlockWithPassword(password);
        if (!ok) {
          setError("密碼錯誤");
          return;
        }
        toast.success("已解鎖");
      }
      onUnlocked();
      onClose();
    } catch (e) {
      setError(truncate((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pb-safe"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-lg shadow-xl p-6 max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="enc-title"
      >
        <h2 id="enc-title" className="text-lg font-semibold mb-1">
          🔒 {isSetup ? "設定 Master Password" : "解鎖加密筆記"}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {isSetup
            ? "密碼用嚟加密 / 解密你嘅私人筆記。密碼永遠唔會送去 server — 唔記得就無法救返加密內容。"
            : "輸入 master password 去解鎖加密筆記。"}
        </p>

        {loadingInfo ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Master password"
              className="w-full px-3 py-2 border border-border rounded bg-background"
              autoComplete={isSetup ? "new-password" : "current-password"}
              required
            />
            {isSetup && (
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再輸入一次"
                className="w-full px-3 py-2 border border-border rounded bg-background"
                autoComplete="new-password"
                required
              />
            )}
            {error && (
              <p className="text-sm text-red-500 max-h-24 overflow-y-auto break-words">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
                disabled={busy}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-sm bg-foreground text-background rounded-md disabled:opacity-50"
              >
                {busy ? "處理中…" : isSetup ? "設定" : "解鎖"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
