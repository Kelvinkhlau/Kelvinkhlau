"use client";

/**
 * RelationPicker — 揀 entity link 俾另一個 entity。
 *
 * 用例：
 *   <RelationPicker
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     sourceType="todo"
 *     sourceId={todoId}
 *     excludeTypes={["todo"]}  // 唔俾揀同類
 *     onLinked={() => qc.invalidateQueries({ queryKey: ["relations", "todo", todoId] })}
 *   />
 *
 * 流程：
 *   1. 用戶 type keyword
 *   2. 每 300ms debounce call `api.searchEntities`
 *   3. 點 result → POST /api/relations → 通知 parent
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { Badge } from "./ui";
import {
  Search,
  Mail,
  CheckSquare,
  FileText,
  Lightbulb,
  FolderKanban,
  Calendar,
  CreditCard,
  Loader2,
  iconProps,
  iconSize,
  type LucideIcon,
} from "./icons";
import {
  api,
  type RelatedEntity,
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

const ALL_TYPES: RelationEntityType[] = [
  "todo",
  "note",
  "idea",
  "project",
  "email",
  "event",
  "expense",
];

type Props = {
  open: boolean;
  onClose: () => void;
  sourceType: RelationEntityType;
  sourceId: number;
  /** 唔俾揀邊啲 entity type */
  excludeTypes?: RelationEntityType[];
  /** 關係 label，預設 "related" */
  kind?: string;
  /** 成功 link 之後 callback（通常 invalidate queries） */
  onLinked?: () => void;
};

export function RelationPicker({
  open,
  onClose,
  sourceType,
  sourceId,
  excludeTypes = [],
  kind = "related",
  onLinked,
}: Props) {
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus 當每次 open
  useEffect(() => {
    if (open) {
      setRawQuery("");
      setDebouncedQuery("");
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const allowedTypes = useMemo<RelationEntityType[]>(
    () => ALL_TYPES.filter((t) => !excludeTypes.includes(t)),
    [excludeTypes],
  );

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["relation-search", debouncedQuery, allowedTypes.join(",")],
    queryFn: () => api.searchEntities(debouncedQuery, allowedTypes, 8),
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: (target: RelatedEntity) =>
      api.createRelation({
        source_type: sourceType,
        source_id: sourceId,
        target_type: target.type,
        target_id: target.id,
        kind,
      }),
    onSuccess: () => {
      toast("已連結", { type: "success" });
      onLinked?.();
      onClose();
    },
    onError: (e) => {
      toast(`連結失敗：${e instanceof Error ? e.message : String(e)}`);
    },
  });

  // 過濾：唔可以 link 返自己
  const filtered = results.filter(
    (r) => !(r.type === sourceType && r.id === sourceId),
  );

  return (
    <Modal open={open} onClose={onClose} title="連結到其他項目" size="md">
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search
            {...iconProps}
            size={iconSize.md}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="搜尋 todo / note / idea / project..."
            className="w-full h-10 pl-10 pr-3 text-body bg-surface border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>

        {/* Results */}
        <div className="min-h-[240px] max-h-[360px] overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-foreground-muted">
              <Loader2
                {...iconProps}
                size={iconSize.md}
                className="animate-spin mr-2"
              />
              <span className="text-caption">搜尋中…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-caption text-foreground-subtle">
              {debouncedQuery
                ? `冇搵到「${debouncedQuery}」相關項目`
                : "輸入 keyword 開始搜尋"}
            </div>
          ) : (
            filtered.map((r) => {
              const meta = ENTITY_META[r.type];
              const Icon = meta.icon;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onClick={() => linkMutation.mutate(r)}
                  disabled={linkMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left bg-surface hover:bg-surface-elevated active:bg-surface-elevated/80 border border-border-subtle transition-colors disabled:opacity-50"
                >
                  <Icon
                    {...iconProps}
                    size={iconSize.md}
                    className="shrink-0 text-foreground-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-body text-foreground truncate">
                      {r.title}
                    </div>
                    {r.subtitle && (
                      <div className="text-caption text-foreground-subtle truncate">
                        {r.subtitle}
                      </div>
                    )}
                  </div>
                  <Badge variant="neutral" size="sm">
                    {meta.label}
                  </Badge>
                </button>
              );
            })
          )}
        </div>

        {/* Hint */}
        <div className="text-caption text-foreground-subtle pt-2 border-t border-border-subtle">
          撳 ↑/↓ 揀，Enter 確認，ESC 關閉
        </div>
      </div>
    </Modal>
  );
}
