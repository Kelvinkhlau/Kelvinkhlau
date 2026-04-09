import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">life-os</h1>
      <p className="text-muted-foreground mb-8">個人生活整合管理系統</p>

      <div className="space-y-3">
        <Link
          href="/inbox"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">📧 Email Inbox</div>
          <div className="text-sm text-muted-foreground">
            Gmail 智能助手 — AI 自動分類
          </div>
        </Link>

        <Link
          href="/login"
          className="block p-4 border border-border rounded-lg hover:bg-muted transition"
        >
          <div className="font-medium">🔐 登入</div>
          <div className="text-sm text-muted-foreground">
            Face ID / Touch ID（Passkey）
          </div>
        </Link>
      </div>

      <p className="mt-12 text-xs text-muted-foreground">
        MVP Week 1 scaffold — 詳見 docs/plan.md
      </p>
    </main>
  );
}
