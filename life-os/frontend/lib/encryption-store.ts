"use client";

import { create } from "zustand";

import {
  buildVerifier,
  deriveKey,
  generateSalt,
  verifyPassword,
} from "./crypto";
import { api, type EncryptionInfo } from "./api";

/**
 * 加密 session state。
 *
 * CryptoKey 只喺 memory — refresh page / tab close 之後就要再輸入密碼。
 * 呢個係 security trade-off：如果 key 存落 localStorage，browser extension /
 * XSS 就可以攞走。
 */
interface EncryptionState {
  info: EncryptionInfo | null; // backend info（configured? salt? verifier?）
  masterKey: CryptoKey | null; // session-cached derived key
  loadingInfo: boolean;
  refreshInfo: () => Promise<EncryptionInfo>;
  setupMasterPassword: (password: string) => Promise<void>;
  unlockWithPassword: (password: string) => Promise<boolean>;
  lock: () => void;
}

export const useEncryptionStore = create<EncryptionState>((set, get) => ({
  info: null,
  masterKey: null,
  loadingInfo: false,

  refreshInfo: async () => {
    set({ loadingInfo: true });
    try {
      const info = await api.encryptionInfo();
      set({ info });
      return info;
    } finally {
      set({ loadingInfo: false });
    }
  },

  setupMasterPassword: async (password: string) => {
    const salt = generateSalt();
    const key = await deriveKey(password, salt);
    const { verifier, verifier_iv } = await buildVerifier(key);
    await api.encryptionSetup({ salt, verifier, verifier_iv });
    set({
      info: { configured: true, salt, verifier, verifier_iv },
      masterKey: key,
    });
  },

  unlockWithPassword: async (password: string) => {
    const current = get().info ?? (await get().refreshInfo());
    if (!current.configured || !current.salt || !current.verifier || !current.verifier_iv) {
      return false;
    }
    const key = await deriveKey(password, current.salt);
    const ok = await verifyPassword(key, current.verifier, current.verifier_iv);
    if (ok) {
      set({ masterKey: key });
    }
    return ok;
  },

  lock: () => set({ masterKey: null }),
}));
