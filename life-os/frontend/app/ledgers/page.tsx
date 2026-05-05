"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Ledger } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const ICON_CHOICES = ["📒", "🏠", "✈️", "💼", "👨‍👩‍👧", "🎉", "🛒", "💰"];

export default function LedgersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ledger | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📒");
  const [color, setColor] = useState("#888");
  const [isDefault, setIsDefault] = useState(false);
  const [note, setNote] = useState("");

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => api.listLedgers(false),
  });

  const resetForm = () => {
    setName("");
    setIcon("📒");
    setColor("#888");
    setIsDefault(false);
    setNote("");
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (l: Ledger) => {
    setEditing(l);
    setName(l.name);
    setIcon(l.icon || "📒");
    setColor(l.color || "#888");
    setIsDefault(l.is_default);
    setNote(l.note || "");
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        icon,
        color,
        is_default: isDefault,
        note: note || null,
      };
      if (editing) {
        return api.updateLedger(editing.id, payload);
      }
      return api.createLedger(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
      resetForm();
      toast.success(editing ? "已更新" : "已新增帳簿");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.updateLedger(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ledgers"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLedger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">帳簿管理</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        用唔同帳簿分開記錄（例：日常、家庭、旅行）。每筆消費可歸入一個帳簿，報表可按帳簿篩選。
      </p>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增帳簿
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="mb-4 p-4 border border-border rounded-lg space-y-3"
        >
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">名稱</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：家庭開支"
                className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                required
                autoFocus
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground">顏色</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full mt-1 h-[42px] border border-border rounded bg-background cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">圖示</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICON_CHOICES.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-10 h-10 border rounded text-xl ${
                    icon === ic
                      ? "border-foreground bg-muted"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">備註</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="（選填）"
              className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            設為預設帳簿（新消費自動歸入此帳簿）
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saveMutation.isPending || !name.trim()}
              className="flex-1 py-2 bg-foreground text-background rounded font-medium disabled:opacity-50"
            >
              {saveMutation.isPending ? "儲存中…" : editing ? "更新" : "儲存"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              取消
            </button>
          </div>
        </form>
      )}

      <section className="space-y-2">
        {isLoading ? (
          <Loading />
        ) : ledgers.length === 0 ? (
          <EmptyState message="尚未建立任何帳簿（建立消費時會自動建立「日常」預設帳簿）" />
        ) : (
          ledgers.map((l) => (
            <div
              key={l.id}
              className={`flex items-center gap-3 p-3 border border-border rounded-lg ${
                !l.is_active ? "opacity-50" : ""
              }`}
            >
              <div
                className="w-10 h-10 rounded flex items-center justify-center text-lg"
                style={{ backgroundColor: (l.color || "#888") + "22" }}
              >
                {l.icon || "📒"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{l.name}</span>
                  {l.is_default && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-600 rounded">
                      預設
                    </span>
                  )}
                </div>
                {l.note && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {l.note}
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => openEdit(l)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() =>
                    toggleMutation.mutate({ id: l.id, is_active: !l.is_active })
                  }
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {l.is_active ? "停用" : "啟用"}
                </button>
                {!l.is_default && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(l.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    刪
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除帳簿"
        message="刪除後該帳簿下嘅消費會保留（ledger_id 會設為 NULL）。確定刪除？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
