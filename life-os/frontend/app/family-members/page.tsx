"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type FamilyMember } from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading, EmptyState } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Money } from "@/components/Money";

export default function FamilyMembersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [color, setColor] = useState("#888");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["family-members"],
    queryFn: () => api.listFamilyMembers(false),
  });

  const resetForm = () => {
    setName("");
    setRelation("");
    setColor("#888");
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (m: FamilyMember) => {
    setEditing(m);
    setName(m.name);
    setRelation(m.relation || "");
    setColor(m.color || "#888");
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        relation: relation || null,
        color,
      };
      if (editing) {
        return api.updateFamilyMember(editing.id, payload);
      }
      return api.createFamilyMember(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members"] });
      resetForm();
      toast.success(editing ? "已更新" : "已新增成員");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteFamilyMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members"] });
      toast.success("已刪除");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">家庭成員</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        記錄家庭成員 / 朋友，記消費時可將一筆消費分攤俾唔同人（例：AA 飯局）。
      </p>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mb-4 p-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-foreground hover:text-foreground transition"
        >
          + 新增成員
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
              <label className="text-xs text-muted-foreground">姓名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：阿媽"
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
            <label className="text-xs text-muted-foreground">關係（選填）</label>
            <input
              type="text"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="例：母親 / 朋友 / 同事"
              className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
            />
          </div>

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
        ) : members.length === 0 ? (
          <EmptyState message="尚未新增家庭成員" />
        ) : (
          members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              onEdit={() => openEdit(m)}
              onDelete={() => setDeleteTarget(m.id)}
            />
          ))
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="刪除成員"
        message="刪除後相關分攤記錄會保留（顯示為「未知」）。確定？"
        onConfirm={() => {
          if (deleteTarget !== null) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

function MemberCard({
  member,
  onEdit,
  onDelete,
}: {
  member: FamilyMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: owed } = useQuery({
    queryKey: ["member-owed", member.id],
    queryFn: () => api.memberOwed(member.id),
  });

  return (
    <div
      className={`flex items-center gap-3 p-3 border border-border rounded-lg ${
        !member.is_active ? "opacity-50" : ""
      }`}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
        style={{ backgroundColor: member.color || "#888" }}
      >
        {member.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{member.name}</div>
        {member.relation && (
          <div className="text-xs text-muted-foreground">{member.relation}</div>
        )}
      </div>
      <div className="text-right">
        {owed && owed.outstanding > 0 && (
          <div className="text-sm font-medium text-red-500">
            未收：<Money value={owed.outstanding} decimals={2} prefix="$" />
          </div>
        )}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-blue-500 hover:underline"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-500 hover:underline"
          >
            刪
          </button>
        </div>
      </div>
    </div>
  );
}
