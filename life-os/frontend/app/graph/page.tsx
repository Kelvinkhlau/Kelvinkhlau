"use client";

/**
 * Graph / Backlinks — entity connection explorer。
 *
 * 核心 UX：
 *   1. Search 任何 entity（todo / note / idea / project / email / event / expense）
 *   2. 揀一個做 center → 顯示佢所有 connections（by type）
 *   3. Click connection → re-center（連 history trail）
 *   4. 可以手動 add / delete connection
 *
 * 純前端做 graph logic — 用已有 /api/relations endpoints。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type RelatedEntity,
  type RelatedLink,
  type RelationEntityType,
} from "@/lib/api";
import { toast } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { Card, PageShell, PageHeader, Badge } from "@/components/ui";
import {
  Search,
  Link2,
  Plus,
  X,
  ArrowLeft,
  ExternalLink,
  Mail,
  CheckSquare,
  FileText,
  Lightbulb,
  FolderKanban,
  Calendar,
  Wallet,
  iconProps,
  iconSize,
  type LucideIcon,
} from "@/components/icons";

type EntityRef = { type: RelationEntityType; id: number };

const TYPE_META: Record<
  RelationEntityType,
  { label: string; icon: LucideIcon; tone: string }
> = {
  email: {
    label: "Email",
    icon: Mail,
    tone: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  },
  todo: {
    label: "Todo",
    icon: CheckSquare,
    tone: "bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400",
  },
  note: {
    label: "Note",
    icon: FileText,
    tone: "bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400",
  },
  idea: {
    label: "Idea",
    icon: Lightbulb,
    tone: "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
  },
  project: {
    label: "Project",
    icon: FolderKanban,
    tone: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
  },
  event: {
    label: "Event",
    icon: Calendar,
    tone: "bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400",
  },
  expense: {
    label: "Expense",
    icon: Wallet,
    tone: "bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400",
  },
};

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function GraphPage() {
  const qc = useQueryClient();
  const [center, setCenter] = useState<RelatedEntity | null>(null);
  const [trail, setTrail] = useState<RelatedEntity[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const debounced = useDebounced(search, 180);
  const searchRef = useRef<HTMLInputElement>(null);

  // Global search（冇 center 或正 add 時用）
  const { data: searchResults = [], isFetching: searching } = useQuery<RelatedEntity[]>({
    queryKey: ["graph-search", debounced],
    queryFn: () => api.searchEntities(debounced || "", undefined, 8),
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });

  // Center 嘅 connections
  const { data: links = [], isLoading: linksLoading } = useQuery<RelatedLink[]>({
    queryKey: ["graph-relations", center?.type, center?.id],
    queryFn: () => api.listRelations(center!.type, center!.id),
    enabled: !!center,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (target: EntityRef) =>
      api.createRelation({
        source_type: center!.type,
        source_id: center!.id,
        target_type: target.type,
        target_id: target.id,
        kind: "related",
      }),
    onSuccess: () => {
      toast.success("已連結");
      setAddMode(false);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["graph-relations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "加唔到連結"),
  });

  const deleteMutation = useMutation({
    mutationFn: (relationId: number) => api.deleteRelation(relationId),
    onSuccess: () => {
      toast.success("已斷開");
      qc.invalidateQueries({ queryKey: ["graph-relations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "斷唔到"),
  });

  // Re-center：push current 去 trail
  const goTo = (entity: RelatedEntity) => {
    if (center) {
      setTrail((prev) => [...prev.slice(-4), center]);
    }
    setCenter(entity);
    setSearch("");
    setShowSearch(false);
    setAddMode(false);
  };

  const goBack = () => {
    setTrail((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCenter(last);
      return prev.slice(0, -1);
    });
  };

  // Group links by type
  const byType = useMemo(() => {
    const m = new Map<RelationEntityType, RelatedLink[]>();
    for (const l of links) {
      const arr = m.get(l.entity.type) ?? [];
      arr.push(l);
      m.set(l.entity.type, arr);
    }
    return m;
  }, [links]);

  // Open search on "/" hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setShowSearch(true);
        setAddMode(false);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="關係圖"
        subtitle="睇下 email / todo / note 之間嘅 connection"
        actions={
          <button
            onClick={() => {
              setShowSearch(true);
              setAddMode(false);
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border rounded hover:bg-muted transition-colors"
          >
            <Search {...iconProps} size={iconSize.sm} />
            搜尋（/）
          </button>
        }
      />

      {/* Search overlay */}
      {showSearch && (
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search
                {...iconProps}
                size={iconSize.sm}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle"
              />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋 todo / note / email…"
                className="w-full pl-9 pr-3 h-10 rounded-md bg-surface-elevated border border-border-subtle focus:border-accent focus:outline-none text-sm"
                autoFocus
              />
            </div>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearch("");
              }}
              className="p-2 text-foreground-subtle hover:text-foreground"
              aria-label="關閉搜尋"
            >
              <X {...iconProps} size={iconSize.md} />
            </button>
          </div>
          {debounced && (
            <Card padding="sm">
              {searching ? (
                <div className="py-4 text-center text-foreground-subtle text-sm">
                  搵緊…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-4 text-center text-foreground-subtle text-sm">
                  冇結果
                </div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((e) => (
                    <SearchRow key={`${e.type}-${e.id}`} entity={e} onSelect={goTo} />
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Empty state */}
      {!center && !showSearch && (
        <Card>
          <div className="py-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-accent-soft flex items-center justify-center mb-4">
              <Link2 {...iconProps} size={iconSize["2xl"]} className="text-accent" />
            </div>
            <h3 className="text-heading font-semibold mb-2">
              揀一個 entity 開始探索
            </h3>
            <p className="text-foreground-muted text-sm max-w-md mx-auto mb-6">
              所有 todo / note / idea / email / project
              都可以互相 link。揀一個 entity 做中心，
              <br />
              睇下佢有邊啲 connection，再一路跳去相關嘅東西。
            </p>
            <button
              onClick={() => {
                setShowSearch(true);
                setTimeout(() => searchRef.current?.focus(), 0);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-accent-foreground hover:opacity-90 text-sm font-medium"
            >
              <Search {...iconProps} size={iconSize.sm} />
              搜尋 entity
            </button>
            <p className="text-xs text-foreground-subtle mt-3">
              或者按 <kbd className="px-1 py-0.5 rounded bg-muted">/</kbd>
            </p>
          </div>
        </Card>
      )}

      {/* Trail */}
      {center && trail.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-foreground-subtle flex-wrap">
          <button
            onClick={goBack}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
            title="返回上一個"
          >
            <ArrowLeft {...iconProps} size={iconSize.xs} />
            返回
          </button>
          <span className="text-foreground-subtle">·</span>
          {trail.map((t, idx) => (
            <button
              key={`${t.type}-${t.id}-${idx}`}
              onClick={() => {
                setCenter(t);
                setTrail((prev) => prev.slice(0, idx));
              }}
              className="px-2 py-1 rounded hover:bg-muted truncate max-w-[140px]"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* Center card + connections */}
      {center && (
        <>
          <CenterCard entity={center} />

          {/* Stats */}
          <div className="flex items-center gap-2 text-sm">
            <Link2
              {...iconProps}
              size={iconSize.sm}
              className="text-foreground-subtle"
            />
            <span className="text-foreground-muted">
              {links.length} 個 connection
            </span>
            <div className="flex-1" />
            <button
              onClick={() => {
                setAddMode(true);
                setSearch("");
                setTimeout(() => searchRef.current?.focus(), 10);
              }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-border rounded hover:bg-muted transition-colors"
            >
              <Plus {...iconProps} size={iconSize.xs} />
              加連結
            </button>
          </div>

          {/* Add-connection panel */}
          {addMode && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search
                    {...iconProps}
                    size={iconSize.sm}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜尋要 link 嘅 entity…"
                    className="w-full pl-9 pr-3 h-9 rounded-md bg-surface-elevated border border-border-subtle focus:border-accent focus:outline-none text-sm"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => {
                    setAddMode(false);
                    setSearch("");
                  }}
                  className="p-1.5 text-foreground-subtle hover:text-foreground"
                  aria-label="取消"
                >
                  <X {...iconProps} size={iconSize.sm} />
                </button>
              </div>
              {debounced && (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {searching ? (
                    <div className="py-2 text-center text-foreground-subtle text-xs">
                      搵緊…
                    </div>
                  ) : searchResults.filter(
                      (r) => !(r.type === center.type && r.id === center.id),
                    ).length === 0 ? (
                    <div className="py-2 text-center text-foreground-subtle text-xs">
                      冇結果
                    </div>
                  ) : (
                    searchResults
                      .filter((r) => !(r.type === center.type && r.id === center.id))
                      .map((e) => (
                        <SearchRow
                          key={`${e.type}-${e.id}`}
                          entity={e}
                          action="link"
                          onSelect={(target) => createMutation.mutate(target)}
                        />
                      ))
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Connections grouped by type */}
          {linksLoading ? (
            <Loading />
          ) : links.length === 0 ? (
            <Card>
              <div className="text-center text-foreground-subtle py-10 text-sm">
                冇 connection。撳「加連結」link 去其他 entity。
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {Array.from(byType.entries()).map(([t, arr]) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <section key={t}>
                    <h3 className="text-subhead mb-2 flex items-center gap-2">
                      <Icon
                        {...iconProps}
                        size={iconSize.sm}
                        className="text-foreground-subtle"
                      />
                      {meta.label}
                      <Badge variant="neutral">{arr.length}</Badge>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {arr.map((l) => (
                        <ConnectionCard
                          key={l.relation_id}
                          link={l}
                          onRecenter={() => goTo(l.entity)}
                          onDelete={() => {
                            if (confirm("確定斷開呢個連結？")) {
                              deleteMutation.mutate(l.relation_id);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function SearchRow({
  entity,
  onSelect,
  action = "center",
}: {
  entity: RelatedEntity;
  onSelect: (e: RelatedEntity) => void;
  action?: "center" | "link";
}) {
  const meta = TYPE_META[entity.type];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(entity)}
      className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted text-left transition-colors"
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-md ${meta.tone} flex items-center justify-center`}
      >
        <Icon {...iconProps} size={iconSize.sm} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{entity.title}</div>
        {entity.subtitle && (
          <div className="text-xs text-foreground-subtle truncate">
            {entity.subtitle}
          </div>
        )}
      </div>
      <span className="text-xs text-foreground-subtle shrink-0">
        {action === "link" ? "加連結" : "→"}
      </span>
    </button>
  );
}

function CenterCard({ entity }: { entity: RelatedEntity }) {
  const meta = TYPE_META[entity.type];
  const Icon = meta.icon;
  return (
    <Card padding="md" className="border-2 border-accent">
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-12 h-12 rounded-lg ${meta.tone} flex items-center justify-center`}
        >
          <Icon {...iconProps} size={iconSize.xl} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="accent">{meta.label}</Badge>
            <span className="text-xs text-foreground-subtle">#{entity.id}</span>
          </div>
          <div className="text-heading font-semibold truncate">
            {entity.title}
          </div>
          {entity.subtitle && (
            <div className="text-caption text-foreground-muted truncate">
              {entity.subtitle}
            </div>
          )}
        </div>
        <Link
          href={entity.href}
          className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 border border-border rounded hover:bg-muted transition-colors"
        >
          <ExternalLink {...iconProps} size={iconSize.xs} />
          打開
        </Link>
      </div>
    </Card>
  );
}

function ConnectionCard({
  link,
  onRecenter,
  onDelete,
}: {
  link: RelatedLink;
  onRecenter: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[link.entity.type];
  const Icon = meta.icon;
  return (
    <Card interactive padding="sm" className="flex items-center gap-2 group">
      <button
        type="button"
        onClick={onRecenter}
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
        title="設為 center"
      >
        <div
          className={`shrink-0 w-7 h-7 rounded ${meta.tone} flex items-center justify-center`}
        >
          <Icon {...iconProps} size={iconSize.xs} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{link.entity.title}</div>
          {link.entity.subtitle && (
            <div className="text-[11px] text-foreground-subtle truncate">
              {link.entity.subtitle}
            </div>
          )}
        </div>
      </button>
      <Link
        href={link.entity.href}
        className="shrink-0 p-1.5 text-foreground-subtle hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        title="去 detail"
      >
        <ExternalLink {...iconProps} size={iconSize.xs} />
      </Link>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 p-1.5 text-foreground-subtle hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="斷開"
      >
        <X {...iconProps} size={iconSize.xs} />
      </button>
    </Card>
  );
}
