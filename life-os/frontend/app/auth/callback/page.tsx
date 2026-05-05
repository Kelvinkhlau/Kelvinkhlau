"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"ok" | "error" | null>(null);
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ok") === "1") {
      setStatus("ok");
      setDetail(params.get("email") || "");
    } else if (params.get("error")) {
      setStatus("error");
      setDetail(params.get("error") || "");
    }
  }, []);

  return (
    <main className="min-h-dvh p-8 max-w-md mx-auto flex flex-col justify-center">
      <div className="text-center">
        {status === null && <p>處理中…</p>}
        {status === "ok" && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">連接成功</h1>
            <p className="text-muted-foreground mb-6">
              Gmail 已連接：{detail}
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium"
            >
              返回首頁
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-2">連接失敗</h1>
            <p className="text-muted-foreground mb-6">{detail}</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 border border-border rounded-lg"
            >
              返回首頁
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
