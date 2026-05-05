"use client";

/**
 * ⌘K Command Palette — 全 app action launcher。
 *
 * 三類 command：
 *   1. Navigate — 跳去任何 page
 *   2. Create — 新增 todo / note / idea（開 QuickCapture）
 *   3. Search — type keyword 即時跨模組 search（同 RelationPicker 共用
 *      `api.searchEntities`）
 *
 * 設計：
 *   - 用 cmdk 做 fuzzy match + keyboard nav（↑/↓ + Enter + ESC）
 *   - Search result 每 200ms debounced call API
 *   - Mount once at Providers level；透過 `usePaletteControls()` trigger
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Home,
  Sparkles,
  Inbox,
  CheckSquare,
  FolderKanban,
  Lightbulb,
  Calendar,
  FileText,
  Wallet,
  CreditCard,
  FileBarChart,
  Building2,
  RefreshCw,
  Bot,
  Shield,
  Settings,
  Mail,
  Link2,
  Plus,
  Search,
  Star,
  Tags,
  LogOut,
  iconProps,
  iconSize,
  type LucideIcon,
} from "./icons";
import { api, setToken, type RelatedEntity, type RelationEntityType } from "@/lib/api";
import { formatKey } from "@/lib/hotkeys";
import { usePaletteContext } from "./command/paletteContext";
import { loadRecents, pushRecent, type RecentItem } from "@/lib/recents";
import { useAppStore } from "@/lib/store";
import { toast } from "./Toast";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords?: string;
};

const NAV_COMMANDS: NavItem[] = [
  { label: "主頁", href: "/", icon: Home, keywords: "dashboard home" },
  { label: "今日", href: "/today", icon: Sparkles, keywords: "today focus 今日 起跑點" },
  { label: "收件箱", href: "/inbox", icon: Inbox, keywords: "inbox mail email" },
  { label: "待辦", href: "/todos", icon: CheckSquare, keywords: "todos tasks" },
  { label: "Projects", href: "/projects", icon: FolderKanban, keywords: "projects" },
  { label: "Ideas", href: "/ideas", icon: Lightbulb, keywords: "ideas" },
  { label: "行事曆", href: "/calendar", icon: Calendar, keywords: "calendar events" },
  { label: "知識庫", href: "/notes", icon: FileText, keywords: "notes knowledge" },
  { label: "財務總覽", href: "/finance", icon: Wallet, keywords: "finance 財務" },
  { label: "消費記錄", href: "/expenses", icon: CreditCard, keywords: "expenses 消費" },
  { label: "預算", href: "/budgets", icon: FileBarChart, keywords: "budgets 預算" },
  { label: "付款賬戶", href: "/bank-accounts", icon: Building2, keywords: "bank accounts" },
  { label: "訂閱", href: "/subscriptions", icon: RefreshCw, keywords: "subscriptions" },
  { label: "智能標籤", href: "/smart-labels", icon: Tags, keywords: "smart labels" },
  { label: "VIP 白名單", href: "/vip", icon: Star, keywords: "vip" },
  { label: "日報", href: "/report", icon: FileBarChart, keywords: "report daily" },
  { label: "回顧", href: "/review", icon: FileBarChart, keywords: "review weekly monthly 回顧 週 月" },
  { label: "關係圖", href: "/graph", icon: Link2, keywords: "graph backlinks relations 連結 關係" },
  { label: "AI 助手", href: "/assistant", icon: Bot, keywords: "assistant ai" },
  { label: "審計", href: "/audit", icon: Shield, keywords: "audit log" },
  { label: "設定", href: "/settings", icon: Settings, keywords: "settings 設定" },
];

const CREATE_ICON_MAP: Record<string, LucideIcon> = {
  smart: Sparkles,
  todo: CheckSquare,
  note: FileText,
  idea: Lightbulb,
};

const SEARCH_ICON_MAP: Record<RelationEntityType, LucideIcon> = {
  email: Mail,
  todo: CheckSquare,
  note: FileText,
  idea: Lightbulb,
  project: FolderKanban,
  event: Calendar,
  expense: CreditCard,
};

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, closePalette, openCapture, openHelp } = usePaletteContext();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus + reload recents when opened
  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setDebounced("");
      setRecents(loadRecents());
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [paletteOpen]);

  // Debounce query → API
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Search API — 只有 query >= 2 字先 fetch
  const { data: searchResults = [] } = useQuery<RelatedEntity[]>({
    queryKey: ["palette-search", debounced],
    queryFn: () => api.searchEntities(debounced, undefined, 5),
    enabled: paletteOpen && debounced.trim().length >= 2,
  });

  if (!paletteOpen) return null;

  function go(href: string) {
    closePalette();
    router.push(href);
  }

  function handleCreate(kind: "smart" | "todo" | "note" | "idea") {
    closePalette();
    openCapture(kind);
  }

  function handleLogout() {
    closePalette();
    setToken(null);
    window.location.href = "/login";
  }

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      toast.info("正在同步 email…");
      const res = await api.triggerSync({ limit: 50, classify: true });
      toast.success(
        `同步完成：取到 ${res.fetched}，新 ${res.new}，分類 ${res.classified}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
      closePalette();
    }
  }

  function handleCycleTheme() {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    const labels: Record<typeof next, string> = {
      light: "淺色",
      dark: "深色",
      system: "跟系統",
    };
    toast.success(`主題：${labels[next]}`);
    closePalette();
  }

  function handleShowHelp() {
    closePalette();
    openHelp();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="關閉 palette"
        onClick={closePalette}
        className="absolute inset-0 bg-overlay backdrop-blur-sm animate-fade-in"
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-xl bg-surface-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden animate-scale-in"
        label="Command Palette"
        shouldFilter={true}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border-subtle">
          <Search
            {...iconProps}
            size={iconSize.md}
            className="text-foreground-muted shrink-0"
          />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="輸入指令、搜尋項目、或前往頁面…"
            className="flex-1 bg-transparent h-full text-body outline-none placeholder:text-foreground-subtle"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 h-5 text-[10px] font-mono text-foreground-subtle bg-muted rounded-sm">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[420px] overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-caption text-foreground-subtle">
            冇結果
          </Command.Empty>

          {/* Search results — 有 query 先顯示 */}
          {debounced.trim().length >= 2 && searchResults.length > 0 && (
            <Command.Group
              heading="搜尋結果"
              className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {searchResults.map((r) => {
                const Icon = SEARCH_ICON_MAP[r.type];
                return (
                  <Command.Item
                    key={`search-${r.type}-${r.id}`}
                    value={`search ${r.type} ${r.title} ${r.subtitle ?? ""}`}
                    onSelect={() => {
                      pushRecent({
                        kind: "entity",
                        href: r.href,
                        title: r.title,
                        subtitle: r.subtitle ?? undefined,
                        entityType: r.type,
                      });
                      go(r.href);
                    }}
                    className={commandItemCls}
                  >
                    <Icon {...iconProps} size={iconSize.md} className="text-foreground-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body truncate">{r.title}</div>
                      {r.subtitle && (
                        <div className="text-caption text-foreground-subtle truncate">
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                    <span className="text-caption text-foreground-subtle">
                      {r.type}
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {/* Recent — empty query 時先顯示 */}
          {debounced.trim().length < 2 && recents.length > 0 && (
            <Command.Group
              heading="最近"
              className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {recents.slice(0, 5).map((r) => {
                const Icon =
                  (r.entityType && SEARCH_ICON_MAP[r.entityType as RelationEntityType]) ||
                  Home;
                return (
                  <Command.Item
                    key={`recent-${r.href}`}
                    value={`recent ${r.title} ${r.subtitle ?? ""}`}
                    onSelect={() => go(r.href)}
                    className={commandItemCls}
                  >
                    <Icon {...iconProps} size={iconSize.md} className="text-foreground-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="text-body truncate">{r.title}</div>
                      {r.subtitle && (
                        <div className="text-caption text-foreground-subtle truncate">
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                    {r.entityType && (
                      <span className="text-caption text-foreground-subtle">
                        {r.entityType}
                      </span>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {/* Create actions */}
          <Command.Group
            heading="新增"
            className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
          >
            {(["smart", "todo", "note", "idea"] as const).map((kind) => {
              const Icon = CREATE_ICON_MAP[kind];
              const labels = { smart: "智能新增（AI 判斷）", todo: "新增待辦", note: "新增筆記", idea: "新增 Idea" };
              return (
                <Command.Item
                  key={`create-${kind}`}
                  value={`create ${kind} 新增`}
                  onSelect={() => handleCreate(kind)}
                  className={commandItemCls}
                >
                  <Plus
                    {...iconProps}
                    size={iconSize.md}
                    className="text-accent"
                  />
                  <div className="flex items-center gap-2">
                    <Icon {...iconProps} size={iconSize.sm} className="text-foreground-muted" />
                    <span className="text-body">{labels[kind]}</span>
                  </div>
                </Command.Item>
              );
            })}
          </Command.Group>

          {/* Navigate actions */}
          <Command.Group
            heading="前往"
            className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
          >
            {NAV_COMMANDS.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={`nav-${item.href}`}
                  value={`${item.label} ${item.keywords ?? ""}`}
                  onSelect={() => go(item.href)}
                  className={commandItemCls}
                >
                  <Icon {...iconProps} size={iconSize.md} className="text-foreground-muted" />
                  <span className="text-body flex-1">{item.label}</span>
                  <span className="text-caption text-foreground-subtle">
                    {item.href}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>

          {/* Quick actions — 執行咗就 close，唔跳頁 */}
          <Command.Group
            heading="動作"
            className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
          >
            <Command.Item
              value="sync emails 同步"
              onSelect={handleSyncNow}
              className={commandItemCls}
              disabled={syncing}
            >
              <RefreshCw {...iconProps} size={iconSize.md} className={`text-foreground-muted ${syncing ? "animate-spin" : ""}`} />
              <span className="text-body flex-1">{syncing ? "同步中…" : "同步 email 依家"}</span>
            </Command.Item>
            <Command.Item
              value="theme dark light 主題"
              onSelect={handleCycleTheme}
              className={commandItemCls}
            >
              <Sparkles {...iconProps} size={iconSize.md} className="text-foreground-muted" />
              <span className="text-body flex-1">切換主題（淺 / 深 / 跟系統）</span>
              <span className="text-caption text-foreground-subtle">
                {theme === "dark" ? "深色" : theme === "light" ? "淺色" : "跟系統"}
              </span>
            </Command.Item>
            <Command.Item
              value="help keyboard shortcuts 快捷鍵"
              onSelect={handleShowHelp}
              className={commandItemCls}
            >
              <Shield {...iconProps} size={iconSize.md} className="text-foreground-muted" />
              <span className="text-body flex-1">顯示鍵盤快捷鍵</span>
              <kbd className="font-mono text-caption text-foreground-subtle">?</kbd>
            </Command.Item>
          </Command.Group>

          {/* System actions */}
          <Command.Group
            heading="系統"
            className="[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-foreground-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
          >
            <Command.Item
              value="logout 登出"
              onSelect={handleLogout}
              className={commandItemCls}
            >
              <LogOut {...iconProps} size={iconSize.md} className="text-foreground-muted" />
              <span className="text-body">登出</span>
            </Command.Item>
          </Command.Group>
        </Command.List>

        <div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-border-subtle text-caption text-foreground-subtle bg-surface">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono">↑↓</kbd> 揀
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono">↵</kbd> 確定
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="font-mono">{formatKey("mod+k")}</kbd> 打開
          </span>
        </div>
      </Command>
    </div>
  );
}

const commandItemCls =
  "flex items-center gap-3 px-3 py-2 rounded-sm cursor-pointer text-foreground data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-strong transition-colors";
