"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type VipSender } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function VipPage() {
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: vips = [], isLoading } = useQuery({
    queryKey: ["vips"],
    queryFn: () => api.listVips(),
  });

  const addMutation = useMutation({
    mutationFn: (payload: { email: string; name: string }) =>
      api.addVip(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vips"] });
      setNewEmail("");
      setNewName("");
      toast.success("已加入 VIP");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteVip(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<VipSender[]>(["vips"], (old) =>
        old?.filter((v) => v.id !== id)
      );
      toast.success("已移除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    addMutation.mutate({ email: newEmail.trim(), name: newName.trim() });
  };

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">VIP 白名單</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        VIP 寄件者嘅 email 會自動歸類為「重要」，唔使過 AI 分類。
      </p>

      <form
        onSubmit={handleAdd}
        className="flex gap-2 mb-4 p-3 border border-border rounded-lg flex-wrap"
      >
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="Email 地址"
          className="flex-1 min-w-[200px] px-3 py-2 border border-border rounded-md bg-background"
          aria-label="VIP Email 地址"
          required
        />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="名稱（選填）"
          className="w-32 px-3 py-2 border border-border rounded-md bg-background"
          aria-label="VIP 名稱"
        />
        <button
          type="submit"
          disabled={!newEmail.trim() || addMutation.isPending}
          className="px-4 py-2 bg-foreground text-background rounded-md font-medium disabled:opacity-40"
        >
          加入
        </button>
      </form>

      {isLoading ? (
        <Loading />
      ) : vips.length === 0 ? (
        <EmptyState message="仲未有 VIP — 加個重要寄件者先！" />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {vips.map((vip) => (
            <li
              key={vip.id}
              className="flex items-center gap-3 p-3 hover:bg-muted"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{vip.email}</div>
                {vip.name && (
                  <div className="text-sm text-muted-foreground">
                    {vip.name}
                  </div>
                )}
                {vip.note && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {vip.note}
                  </div>
                )}
              </div>
              <button
                onClick={() => setDeleteTarget(vip.id)}
                className="text-xs text-red-600 hover:underline shrink-0"
                aria-label={`移除 ${vip.email}`}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="移除 VIP"
        message="確定要移出 VIP 白名單？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
