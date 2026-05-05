/**
 * 本地端加密 helper — 用 Web Crypto API 做 E2E note encryption。
 *
 * 設計：
 * 1. 用戶 set master password。Client 隨機生成 salt，用 PBKDF2-SHA256
 *    derive 一個 AES-GCM 256-bit key（100k iterations）。
 * 2. 用 derived key encrypt 明文 "lifeos-verify-v1" 做 verifier，
 *    連 salt 一齊 send 去 server 儲。
 * 3. 之後每次 unlock，client 攞返 salt + verifier，用戶輸入 password，
 *    本地 derive key 再 decrypt verifier — 成功就即係密碼啱。
 * 4. 加密筆記：用同一個 derived key + per-save random IV encrypt
 *    `{title, content, tags}` JSON string。Server 只見 ciphertext。
 *
 * Password 本身永遠唔會離開 browser memory。
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;
const VERIFIER_PLAINTEXT = "lifeos-verify-v1";

// ─── base64 helpers ────────────────────────────────────────────────────────

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

// ─── random ─────────────────────────────────────────────────────────────────

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const u8 = new Uint8Array(buf);
  crypto.getRandomValues(u8);
  return u8;
}

export function generateSalt(): string {
  return toBase64(randomBytes(SALT_LENGTH_BYTES));
}

// ─── key derivation ────────────────────────────────────────────────────────

/**
 * PBKDF2 derive AES-GCM key from password + salt。
 */
export async function deriveKey(
  password: string,
  saltB64: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // non-extractable — 安全啲
    ["encrypt", "decrypt"]
  );
}

// ─── AES-GCM encrypt / decrypt ─────────────────────────────────────────────

export async function encryptString(
  plaintext: string,
  key: CryptoKey
): Promise<{ cipher: string; iv: string }> {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return { cipher: toBase64(cipherBuf), iv: toBase64(iv) };
}

export async function decryptString(
  cipherB64: string,
  ivB64: string,
  key: CryptoKey
): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64)
  );
  return new TextDecoder().decode(plainBuf);
}

// ─── verifier ───────────────────────────────────────────────────────────────

/**
 * 生成 verifier payload — 新 master password 第一次 setup 時用。
 */
export async function buildVerifier(
  key: CryptoKey
): Promise<{ verifier: string; verifier_iv: string }> {
  const { cipher, iv } = await encryptString(VERIFIER_PLAINTEXT, key);
  return { verifier: cipher, verifier_iv: iv };
}

/**
 * 驗證 password 啱唔啱。Decrypt verifier 成功 + plaintext 等於 known 就 OK。
 */
export async function verifyPassword(
  key: CryptoKey,
  verifierB64: string,
  verifierIvB64: string
): Promise<boolean> {
  try {
    const plain = await decryptString(verifierB64, verifierIvB64, key);
    return plain === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

// ─── note payload helpers ───────────────────────────────────────────────────

export type NotePlaintext = {
  title: string;
  content: string;
  content_format: "markdown" | "blocks";
  tags: string;
};

export async function encryptNotePayload(
  plain: NotePlaintext,
  key: CryptoKey
): Promise<{ encrypted_payload: string; encryption_iv: string }> {
  const { cipher, iv } = await encryptString(JSON.stringify(plain), key);
  return { encrypted_payload: cipher, encryption_iv: iv };
}

export async function decryptNotePayload(
  encryptedPayload: string,
  encryptionIv: string,
  key: CryptoKey
): Promise<NotePlaintext> {
  const plain = await decryptString(encryptedPayload, encryptionIv, key);
  return JSON.parse(plain) as NotePlaintext;
}
