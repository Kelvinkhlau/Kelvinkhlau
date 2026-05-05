"use client";

/**
 * RelatedItems — 顯示一個 entity 嘅所有 cross-module links。
 *
 * 呢個 component 設計俾每個 detail page 用：
 *   <RelatedItems entityType="todo" entityId={todo.id} />
 *
 * 功能：
 *   - 列晒相關 links（email / todo / note / idea / project / event / expense）
 *   - 「+ 新增連結」按鈕 → 打開 RelationPicker
 *   - 每 link 可以 hover 顯示 ✕ 刪除
 *   - 唔使傳 data — 自己 fetch
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RelationPicker } from "./RelationPicker";
import { Badge } from "./ui";
import { SkeletonList } from "./Loading";
import {
  Mail,
  CheckSquare,
  FileText,
  Lightbulb,
  FolderKanban,
  Calendar,
  CreditCard,
  Plus,
  Link2,
  X,
  iconProps,
  iconSize,
  type LucideIcon,
} from "./icons";
import {
  api,
  type RelatedLink,
  type RelationEntityType,
} from "@/lib/api";
import { toast } from "./Toast";

const ENTITY_META: Record<
  RelationEntityType,
  { icon: LucideIcon; label: string }
> = {
  email: { icon: Mail, label: "Email" },
  todo: { icon: CheckSquare, label: "待辦" },
  note: { icon: FileText, label: "筆記" },
  idea: { icon: Lightbulb, label: "Idea" },
  project: { icon: FolderKanban, label: "Project" },
  event: { icon: Calendar, label: "行程" },
  expense: { icon: CreditCard, label: "消費" },
};

type Props = {
  entityType: RelationEntityType;
  entityId: number;
  /** Section 標題，預設「相關項目」 */
  title?: string;
  /** 隱藏「新增」按鈕 */
  hideAdd?: boolean;
  /** RelationPicker 預設關係 label */
  kind?: string;
  className?: string;
};

export function RelatedItems({
  entityType,
  entityId,
  title = "相關項目",
  hideAdd = false,
  kind = "related",
  className = "",
}: Props) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const queryKey = ["relations", entityType, entityId];

  const { data: links = [], isLoading } = useQuery<RelatedLink[]>({
    queryKey,
    queryFn: () => api.listRelations(entityType, entityId),
  });

  const deleteMutation = useMutation({
    mutationFn: (relationId: number) => api.deleteRelation(relationId),
    onMutate: async (relationId) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<RelatedLink[]>(queryKey);
      qc.setQueryData<RelatedLink[]>(
        queryKey,
        (old) => old?.filter((l) => l.relation_id !== relationId) ?? [],
      );
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast(`刪除失敗：${e instanceof Error ? e.message : String(e)}`);
    },
    onSuccess: () => {
      toast("已移除連結", { type: "success" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link2
            {...iconProps}
            size={iconSize.md}
            className="text-foreground-muted"
          />
          <h3 className="text-subhead text-foreground">{title}</h3>
          {links.length > 0 && (
            <span className="text-caption text-foreground-subtle">
              ({links.length})
            </span>
          )}
        </div>
        {!hideAdd && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 text-caption text-accent hover:text-accent-strong transition-colors"
          >
            <Plus {...iconProps} size={iconSize.sm} />
            新增
          </button>
        )}
      </div>

      {isLoading ? (
        <SkeletonList count={2} />
      ) : links.length === 0 ? (
        <div className="text-center py-6 text-caption text-foreground-subtle border border-dashed border-border-subtle rounded-md">
          未有連結項目
        </div>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => {
            const meta = ENTITY_META[link.entity.type];
            const Icon = meta.icon;
            return (
              <div
                key={link.relation_id}
                className="group flex items-center gap-3 px-3 py-2 rounded-md bg-surface border border-border-subtle hover:border-border transition-colors"
              >
                <Icon
                  {...iconProps}
                  size={iconSize.md}
                  className="shrink-0 text-foreground-muted"
                />
                <Link
                  href={link.entity.href}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <div className="text-body text-foreground truncate">
                    {link.entity.title}
                  </div>
                  {link.entity.subtitle && (
                    <div className="text-caption text-foreground-subtle truncate">
                      {link.entity.subtitle}
                    </div>
                  )}
                </Link>
                <Badge variant="neutral" size="sm">
                  {meta.label}
                </Badge>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("確定移除此連結？")) {
                      deleteMutation.mutate(link.relation_id);
                    }
                  }}
                  aria-label="移除連結"
                  disabled={deleteMutation.isPending}
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-sm text-foreground-subtle hover:text-danger hover:bg-danger-soft transition-all"
                >
                  <X {...iconProps} size={iconSize.sm} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <RelationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        sourceType={entityType}
        sourceId={entityId}
        kind={kind}
        onLinked={() => qc.invalidateQueries({ queryKey })}
      />
    </section>
  );
}
