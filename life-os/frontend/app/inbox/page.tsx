"use client";

import { useEffect, useState } from "react";
import { api, type Email } from "@/lib/api";

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEmails()
      .then(setEmails)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="p-8">載入中…</main>;
  if (error) return <main className="p-8 text-red-600">錯誤：{error}</main>;

  return (
    <main className="min-h-screen p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Inbox</h1>

      {emails.length === 0 ? (
        <div className="text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg">
          仲未有任何 email。
          <br />
          <span className="text-sm">
            連接 Gmail account 之後背景 sync 會自動填滿。
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {emails.map((email) => (
            <li key={email.id} className="p-4 hover:bg-muted">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium">{email.subject || "(無主題)"}</div>
                  <div className="text-sm text-muted-foreground">
                    {email.sender}
                  </div>
                  <div className="text-sm mt-1 line-clamp-2">{email.snippet}</div>
                </div>
                {email.classification && (
                  <span className="ml-2 text-xs px-2 py-1 rounded bg-muted">
                    {email.classification.final_category}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
