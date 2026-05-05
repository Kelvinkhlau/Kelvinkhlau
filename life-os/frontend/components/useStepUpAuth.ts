"use client";

/**
 * useStepUpAuth — 敏感操作前 re-prompt passkey，拎新 JWT。
 *
 * 用途：vault 下載 / 刪除 / 永久刪除前確認身份。
 * Backend `/api/vault/files/*` 敏感 endpoint 會 check JWT `iat` 喺最近 15 分鐘內，
 * 否則 401 detail="step_up_required"。
 *
 * 用法：
 *   const { runWithStepUp } = useStepUpAuth();
 *   await runWithStepUp(async () => api.downloadVaultFile(id));
 *
 * 如果第一次 call throw "step_up_required"，會自動彈 passkey → 成功後 retry 一次。
 */

import { useCallback } from "react";
import { api, ApiError, setToken } from "@/lib/api";
import {
  parseRequestOptions,
  serializeAuthenticationCredential,
} from "@/lib/webauthn";
import { toast } from "@/components/Toast";

async function performStepUp(): Promise<void> {
  toast.info("請用 Face ID / Touch ID 驗證");
  const start = await api.passkeyLoginStart();
  const options = parseRequestOptions(start.options);
  const cred = (await navigator.credentials.get({
    publicKey: options,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("用戶取消驗證");
  const serialized = serializeAuthenticationCredential(cred);
  const res = await api.passkeyLoginFinish(start.challenge_token, serialized);
  setToken(res.token);
}

export function useStepUpAuth() {
  const runWithStepUp = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.status === 401 &&
          e.message.includes("step_up_required")
        ) {
          await performStepUp();
          return await fn();
        }
        throw e;
      }
    },
    []
  );

  return { runWithStepUp };
}
