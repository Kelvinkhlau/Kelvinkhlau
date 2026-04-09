import { useEffect, useState } from "react";

import { apiClient } from "../services/apiClient.js";

function StatusPill({ state, label }) {
  const styles = {
    ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    error: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    loading: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  }[state];

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${styles}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          state === "ok"
            ? "bg-emerald-400"
            : state === "error"
            ? "bg-rose-400"
            : "bg-slate-400 animate-pulse"
        }`}
      />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [state, setState] = useState("loading");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/api/health")
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setState(data?.status === "ok" ? "ok" : "error");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || String(err));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-400">Phase 1 — connection check</p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Backend API</h2>
          <StatusPill
            state={state}
            label={
              state === "ok"
                ? "API connected"
                : state === "error"
                ? "API unreachable"
                : "Connecting…"
            }
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">App</dt>
            <dd className="text-slate-200">{info?.app || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Version</dt>
            <dd className="text-slate-200">{info?.version || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Database</dt>
            <dd className="text-slate-200">{info?.db || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="text-slate-200">{info?.status || "—"}</dd>
          </div>
        </dl>

        {error && (
          <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-lg font-medium">What's next</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          <li>• Phase 2 — Email sync (Gmail + iCloud) and AI classifier</li>
          <li>• Phase 3 — Project + Todo system with priority engine</li>
          <li>• Phase 4 — Idea + Card inspiration library</li>
          <li>• Phase 5 — Natural language AI assistant</li>
          <li>• Phase 6 — Calendar integration</li>
        </ul>
      </section>
    </div>
  );
}
