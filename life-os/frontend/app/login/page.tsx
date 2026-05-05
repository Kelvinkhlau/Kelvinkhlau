"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";
import {
  parseCreationOptions,
  parseRequestOptions,
  serializeAuthenticationCredential,
  serializeRegistrationCredential,
} from "@/lib/webauthn";

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown device";
}

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const start = await api.passkeyRegisterStart();
      const options = parseCreationOptions(start.options);
      const cred = (await navigator.credentials.create({
        publicKey: options,
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("User cancelled");
      const serialized = serializeRegistrationCredential(cred);
      const deviceName = guessDeviceName();
      const res = await api.passkeyRegisterFinish(
        start.challenge_token,
        serialized,
        deviceName
      );
      setToken(res.token);
      setInfo(`註冊成功 — ${res.user.name}。正在跳轉…`);
      setTimeout(() => router.push("/"), 600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const start = await api.passkeyLoginStart();
      const options = parseRequestOptions(start.options);
      const cred = (await navigator.credentials.get({
        publicKey: options,
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("User cancelled");
      const serialized = serializeAuthenticationCredential(cred);
      const res = await api.passkeyLoginFinish(start.challenge_token, serialized);
      setToken(res.token);
      setInfo(`登入成功 — ${res.user.name}。正在跳轉…`);
      setTimeout(() => router.push("/"), 600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh p-8 max-w-md mx-auto flex flex-col justify-center">
      <h1 className="text-2xl font-bold mb-6 text-center">登入 life-os</h1>

      <div className="space-y-3">
        <button
          type="button"
          disabled={loading}
          className="w-full p-4 bg-foreground text-background rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
          onClick={handleLogin}
        >
          🔐 用 Face ID / Touch ID 登入
        </button>

        <button
          type="button"
          disabled={loading}
          className="w-full p-4 border border-border rounded-lg font-medium hover:bg-muted transition disabled:opacity-50"
          onClick={handleRegister}
        >
          ➕ 第一次用？註冊 Passkey
        </button>
      </div>

      {info && (
        <div className="mt-4 p-3 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded">
          {info}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded">
          {error}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground text-center">
        WebAuthn / Passkey — 唔需要密碼，安全又快
      </p>
      <Link
        href="/"
        className="mt-4 text-xs text-blue-600 hover:underline text-center"
      >
        ← 返回首頁
      </Link>
    </main>
  );
}
