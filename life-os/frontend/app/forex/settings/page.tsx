"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ForexBroker,
  type ForexGroup,
  type ForexWallet,
} from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";

function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

/* ─────────── Wallets section ─────────── */

function WalletList({ group }: { group: ForexGroup }) {
  const qc = useQueryClient();
  const wallets = useQuery({
    queryKey: ["forex-wallets", group.id],
    queryFn: () => api.listForexWallets(group.id),
  });
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  const create = useMutation({
    mutationFn: () => api.createForexWallet(group.id, { label: label.trim(), address: address.trim() }),
    onSuccess: () => {
      toast.success(`Wallet 已加：${label} — 記得喺 Telegram /addwallet 命令會自動 backfill；用 web 加要手動跑 backfill 先`);
      setAdding(false);
      setLabel("");
      setAddress("");
      qc.invalidateQueries({ queryKey: ["forex-wallets", group.id] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`加 wallet 失敗：${String(e)}`),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.updateForexWallet(group.id, id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forex-wallets", group.id] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteForexWallet(group.id, id),
    onSuccess: () => {
      toast.success("Wallet 刪除");
      qc.invalidateQueries({ queryKey: ["forex-wallets", group.id] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
  });

  if (wallets.isLoading) return <div className="text-xs text-zinc-500">…</div>;

  return (
    <div className="space-y-1.5">
      {(wallets.data ?? []).map((w) => (
        <div key={w.id} className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${w.is_active ? "bg-green-500" : "bg-zinc-400"}`} />
          <span className="flex-1 font-medium">{w.label}</span>
          <code className="text-xs text-zinc-500">{shortAddr(w.address)}</code>
          <button
            onClick={() => toggle.mutate({ id: w.id, is_active: !w.is_active })}
            className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700"
            title={w.is_active ? "暫停" : "啟用"}
          >
            {w.is_active ? "暫停" : "啟用"}
          </button>
          <button
            onClick={() => {
              if (confirm(`刪除 wallet ${w.label}？相關 tx 會 cascade delete！`)) {
                remove.mutate(w.id);
              }
            }}
            className="text-xs px-1.5 py-0.5 rounded text-red-600"
            title="刪除"
          >
            ×
          </button>
        </div>
      ))}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-blue-600 hover:underline"
        >
          + 加 wallet
        </button>
      ) : (
        <div className="flex flex-wrap gap-1.5 items-center mt-2">
          <input
            placeholder="Label (e.g. Carrie Tronlink)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-48"
          />
          <input
            placeholder="TRON address (T...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-72 font-mono"
          />
          <button
            disabled={!label.trim() || !address.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
          >
            {create.isPending ? "…" : "✓ 加"}
          </button>
          <button
            onClick={() => { setAdding(false); setLabel(""); setAddress(""); }}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded"
          >
            ×
          </button>
          <span className="text-xs text-amber-600 w-full">
            ⚠️ 由 web 加 wallet 唔會自動 backfill — 用 Telegram <code>/addwallet</code> 會自動 pull 365 日歷史
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────── Brokers section ─────────── */

function BrokerList({ group }: { group: ForexGroup }) {
  const qc = useQueryClient();
  const brokers = useQuery({
    queryKey: ["forex-brokers", group.id],
    queryFn: () => api.listForexBrokers(group.id),
  });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ForexBroker>>({});

  const create = useMutation({
    mutationFn: () =>
      api.createForexBroker(group.id, {
        name: name.trim(),
        owner: owner.trim() || null,
      }),
    onSuccess: () => {
      toast.success(`Broker 已加：${name}`);
      setAdding(false);
      setName("");
      setOwner("");
      qc.invalidateQueries({ queryKey: ["forex-brokers", group.id] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
    onError: (e) => toast.error(`加 broker 失敗：${String(e)}`),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ForexBroker> }) =>
      api.updateForexBroker(group.id, id, payload),
    onSuccess: () => {
      toast.success("更新成功");
      setEditingId(null);
      setEditValues({});
      qc.invalidateQueries({ queryKey: ["forex-brokers", group.id] });
    },
    onError: (e) => toast.error(`更新失敗：${String(e)}`),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteForexBroker(group.id, id),
    onSuccess: () => {
      toast.success("Broker 刪除");
      qc.invalidateQueries({ queryKey: ["forex-brokers", group.id] });
      qc.invalidateQueries({ queryKey: ["forex-dashboard"] });
    },
  });

  if (brokers.isLoading) return <div className="text-xs text-zinc-500">…</div>;

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 text-left">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Owner</th>
              <th className="px-2 py-1">Active</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {(brokers.data ?? []).map((b) => (
              <tr key={b.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-2 py-1">
                  {editingId === b.id ? (
                    <input
                      defaultValue={b.name}
                      onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                      className="text-sm px-1 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded"
                    />
                  ) : (
                    <span className="font-medium">{b.name}</span>
                  )}
                </td>
                <td className="px-2 py-1 text-zinc-500">
                  {editingId === b.id ? (
                    <input
                      defaultValue={b.owner ?? ""}
                      onChange={(e) => setEditValues({ ...editValues, owner: e.target.value || null })}
                      className="text-sm px-1 py-0.5 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-24"
                    />
                  ) : (
                    b.owner ?? "—"
                  )}
                </td>
                <td className="px-2 py-1">
                  <span className={`text-xs ${b.is_active ? "text-green-600" : "text-zinc-400"}`}>
                    {b.is_active ? "✓" : "—"}
                  </span>
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {editingId === b.id ? (
                    <>
                      <button
                        onClick={() => update.mutate({ id: b.id, payload: editValues })}
                        className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded mr-1"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditValues({}); }}
                        className="text-xs px-2 py-0.5 border border-zinc-300 dark:border-zinc-700 rounded"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(b.id); setEditValues({}); }}
                        className="text-xs text-blue-600 hover:underline mr-2"
                      >
                        改
                      </button>
                      <button
                        onClick={() =>
                          update.mutate({ id: b.id, payload: { is_active: !b.is_active } })
                        }
                        className="text-xs text-zinc-600 hover:underline mr-2"
                      >
                        {b.is_active ? "暫停" : "啟用"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`刪 broker ${b.name}? Tag 過嘅 tx 會變回 pending_tag.`)) {
                            remove.mutate(b.id);
                          }
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        ×
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-blue-600 hover:underline mt-2"
        >
          + 加 broker
        </button>
      ) : (
        <div className="flex gap-1.5 items-center mt-2">
          <input
            placeholder="Broker name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-48"
          />
          <input
            placeholder="Owner (e.g. Kelvin / Celia)"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded w-40"
          />
          <button
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="text-xs px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
          >
            {create.isPending ? "…" : "✓ 加"}
          </button>
          <button
            onClick={() => { setAdding(false); setName(""); setOwner(""); }}
            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────── Page ─────────── */

export default function ForexSettingsPage() {
  const groups = useQuery({
    queryKey: ["forex-groups"],
    queryFn: () => api.listForexGroups(),
  });

  if (groups.isLoading) return <Loading />;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/forex" className="text-sm text-blue-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">外匯設定</h1>
      </div>

      <div className="space-y-8">
        {(groups.data ?? []).map((g) => (
          <div key={g.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl font-bold">{g.name}</h2>
              <code className="text-xs text-zinc-500">{g.code}</code>
            </div>

            <section className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                TRON Wallets
              </h3>
              <WalletList group={g} />
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Brokers
              </h3>
              <BrokerList group={g} />
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}
