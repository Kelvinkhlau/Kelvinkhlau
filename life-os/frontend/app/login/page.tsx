"use client";

export default function LoginPage() {
  return (
    <main className="min-h-screen p-8 max-w-md mx-auto flex flex-col justify-center">
      <h1 className="text-2xl font-bold mb-6 text-center">登入 life-os</h1>

      <button
        type="button"
        className="w-full p-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
        onClick={() => alert("MVP Week 3：Passkey 登入未實作")}
      >
        🔐 用 Face ID / Touch ID 登入
      </button>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        WebAuthn / Passkey — 唔需要密碼
      </p>
    </main>
  );
}
