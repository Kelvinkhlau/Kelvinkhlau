"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { PrivacyToggle } from "./PrivacyToggle";
import { NotificationCenter } from "./NotificationCenter";
import { getToken, setToken } from "@/lib/api";
import { formatKey } from "@/lib/hotkeys";
import { usePaletteContext } from "./command/paletteContext";
import type { LucideIcon } from "./icons";
import {
  Home,
  Sparkles,
  Inbox,
  Send,
  Tags,
  Star,
  Mail,
  CheckSquare,
  FolderKanban,
  Lightbulb,
  Calendar,
  FileText,
  NotebookPen,
  Wallet,
  BarChart3,
  CreditCard,
  FileBarChart,
  Building2,
  RefreshCw,
  TrendingUp,
  Bot,
  Shield,
  Settings,
  LineChart,
  BookOpen,
  HandCoins,
  Users,
  Lock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Menu,
  LogOut,
  Search,
  Link2,
  iconProps,
} from "./icons";

type NavItem = { href: string; icon: LucideIcon; label: string };
type NavGroup = { icon: LucideIcon; label: string; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const NAV_ENTRIES: NavEntry[] = [
  { href: "/", icon: Home, label: "主頁" },
  { href: "/today", icon: Sparkles, label: "今日" },
  {
    icon: Mail, label: "郵件",
    items: [
      { href: "/inbox", icon: Inbox, label: "收件箱" },
      { href: "/inbox?folder=sent", icon: Send, label: "寄件備份" },
      { href: "/smart-labels", icon: Tags, label: "智能標籤" },
      { href: "/vip", icon: Star, label: "重要聯絡人" },
    ],
  },
  { href: "/todos", icon: CheckSquare, label: "待辦" },
  { href: "/projects", icon: FolderKanban, label: "專案" },
  { href: "/ideas", icon: Lightbulb, label: "靈感" },
  { href: "/calendar", icon: Calendar, label: "行事曆" },
  { href: "/notes", icon: FileText, label: "知識庫" },
  { href: "/notebooks", icon: NotebookPen, label: "記事簿" },
  {
    icon: Wallet, label: "財務",
    items: [
      { href: "/finance", icon: BarChart3, label: "財務總覽" },
      { href: "/expenses", icon: CreditCard, label: "消費記錄" },
      { href: "/analytics", icon: LineChart, label: "消費分析" },
      { href: "/budgets", icon: FileBarChart, label: "預算" },
      { href: "/bank-accounts", icon: Building2, label: "付款賬戶" },
      { href: "/subscriptions", icon: RefreshCw, label: "訂閱" },
      { href: "/ledgers", icon: BookOpen, label: "帳簿" },
      { href: "/loans", icon: HandCoins, label: "借貸" },
      { href: "/family-members", icon: Users, label: "家庭成員" },
      { href: "/forex", icon: TrendingUp, label: "外匯對賬" },
    ],
  },
  { href: "/racing", icon: TrendingUp, label: "賽馬預測" },
  { href: "/vault", icon: Lock, label: "個人資料庫" },
  { href: "/report", icon: FileBarChart, label: "日報" },
  { href: "/review", icon: BarChart3, label: "回顧" },
  { href: "/graph", icon: Link2, label: "關係圖" },
  { href: "/assistant", icon: Bot, label: "助手" },
  { href: "/audit", icon: Shield, label: "審計" },
  { href: "/settings", icon: Settings, label: "設定" },
];

/** 不需要 sidebar 的頁面（login 等） */
const NO_SHELL_PATHS = ["/login"];

/** 底部 tab bar 嘅主要入口（thumb-reachable） */
const BOTTOM_TABS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/", icon: Home, label: "主頁" },
  { href: "/inbox", icon: Inbox, label: "郵件" },
  { href: "/todos", icon: CheckSquare, label: "待辦" },
  { href: "/calendar", icon: Calendar, label: "行事曆" },
  { href: "/expenses", icon: Wallet, label: "財務" },
];

const SIDEBAR_EXPAND_KEY = "lifeos:sidebarExpanded";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { openPalette } = usePaletteContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // desktop 上 sidebar 係 icon rail 定 expanded drawer（persist 係 localStorage）
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  // Defer localStorage reads to after mount so server-rendered HTML matches
  // the first client render (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    setMounted(true);
    setHasToken(getToken() !== null);
    try {
      setDesktopExpanded(localStorage.getItem(SIDEBAR_EXPAND_KEY) === "1");
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(SIDEBAR_EXPAND_KEY, desktopExpanded ? "1" : "0");
    } catch {}
  }, [desktopExpanded, mounted]);

  // 自動展開有 active 子項嘅 group
  const getDefaultOpen = (): string[] => {
    const open: string[] = [];
    for (const entry of NAV_ENTRIES) {
      if (isGroup(entry)) {
        if (entry.items.some((item) => isActive(item.href))) {
          open.push(entry.label);
        }
      }
    }
    return open;
  };

  const [openGroups, setOpenGroups] = useState<string[]>(getDefaultOpen);

  // Login 頁面不用 sidebar
  if (NO_SHELL_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) =>
      prev.includes(label)
        ? prev.filter((g) => g !== label)
        : [...prev, label]
    );
  }

  function isGroupActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href));
  }

  const handleLogout = () => {
    setToken(null);
    window.location.href = "/login";
  };

  // ─── 排版模式 ────────────────────────────────────────────────────
  // - drawer：mobile 永遠用；desktop 如果 desktopExpanded=true 都用
  // - rail：desktop 預設用（icon-only）
  //
  // Tailwind responsive class 無法運行時動態 toggle，所以用兩套 class
  // 字串分開接駁：desktopExpanded=true 時，lg 斷點上行 drawer 樣；false 時行 rail。
  const expanded = desktopExpanded;
  // Sidebar 外框
  const asideLgClasses = expanded
    ? "lg:static lg:translate-x-0 lg:w-60 lg:border-r lg:border-border-subtle"
    : "lg:static lg:translate-x-0 lg:w-[72px] lg:border-r lg:border-border-subtle";
  // 只喺 drawer 模式顯示（mobile 永遠；expanded 時 desktop 都 show）
  const drawerOnly = expanded ? "" : "lg:hidden";
  // 只喺 rail 模式顯示（desktop + !expanded 先 show）
  const railOnlyLg = expanded ? "hidden" : "hidden lg:flex";
  // 反轉：正常流（mobile flex, desktop 都 flex）
  const showAlways = expanded ? "flex" : "flex lg:hidden";
  // Nav link: rail 模式（desktop 嗰邊 icon-only center）
  const railNavLinkClasses = expanded
    ? ""
    : "lg:w-10 lg:h-10 lg:justify-center lg:mb-1 lg:px-0 lg:py-0 lg:gap-0";
  // Nav container: rail 模式 center align
  const navContainerClasses = expanded
    ? "flex-1 overflow-y-auto py-2 px-2"
    : "flex-1 overflow-y-auto py-2 px-2 lg:px-0 lg:flex lg:flex-col lg:items-center";
  // Header
  const headerClasses = expanded
    ? "flex items-center justify-between px-4 h-14 border-b border-border-subtle shrink-0 pt-[env(safe-area-inset-top)]"
    : "flex items-center justify-between lg:justify-center px-4 lg:px-0 h-14 border-b border-border-subtle shrink-0 pt-[env(safe-area-inset-top)]";
  // Search button
  const searchBtnClasses = expanded
    ? "w-full flex items-center gap-2 h-9 px-3 rounded-md bg-surface border border-border-subtle text-foreground-muted hover:text-foreground hover:border-border shadow-flat hover:shadow-raised-sm transition-all"
    : "w-full lg:w-10 lg:h-10 flex items-center gap-2 h-9 px-3 lg:px-0 lg:justify-center rounded-md bg-surface border border-border-subtle text-foreground-muted hover:text-foreground hover:border-border shadow-flat hover:shadow-raised-sm transition-all";
  // Bottom actions
  const bottomClasses = expanded
    ? "px-3 py-3 border-t border-border-subtle shrink-0"
    : "px-3 py-3 lg:px-0 lg:pb-4 border-t border-border-subtle shrink-0 lg:flex lg:flex-col lg:items-center lg:gap-2";
  const bottomInnerClasses = expanded
    ? "flex items-center gap-2"
    : "flex items-center gap-2 lg:flex-col lg:gap-2";

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Skip-link for keyboard users — visible on focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-3 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-md focus:text-sm focus:font-medium"
      >
        跳至主內容
      </a>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-surface flex flex-col transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0 w-60" : "-translate-x-full"}
          ${asideLgClasses}`}
      >
        {/* Header: logo + close (mobile) + expand/collapse toggle (desktop) */}
        <div className={headerClasses}>
          {expanded ? (
            <Link
              href="/"
              className="font-semibold text-base tracking-tight flex items-center gap-2"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center font-bold text-xs tracking-tighter">
                lo
              </span>
              life-os
            </Link>
          ) : (
            <>
              <Link
                href="/"
                className="font-semibold text-base tracking-tight lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                life-os
              </Link>
              <Link
                href="/"
                aria-label="life-os"
                className="hidden lg:flex w-10 h-10 rounded-md bg-foreground text-background items-center justify-center font-bold text-sm tracking-tighter shadow-raised-sm"
              >
                lo
              </Link>
            </>
          )}

          {/* Desktop expand/collapse toggle — 只喺 lg+ 出現 */}
          <button
            type="button"
            onClick={() => setDesktopExpanded((v) => !v)}
            className="hidden lg:flex text-foreground-muted hover:text-foreground p-1.5 rounded-sm"
            aria-label={expanded ? "收起 sidebar" : "展開 sidebar"}
            title={expanded ? "收起" : "展開"}
          >
            {expanded ? (
              <ChevronLeft {...iconProps} size={18} />
            ) : (
              <ChevronRight {...iconProps} size={18} />
            )}
          </button>

          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-foreground-muted hover:text-foreground p-1.5 rounded-sm"
            aria-label="關閉選單"
          >
            <X {...iconProps} size={18} />
          </button>
        </div>

        {/* ⌘K command launcher */}
        <div
          className={
            expanded
              ? "px-3 pt-3 pb-1 shrink-0"
              : "px-3 lg:px-0 pt-3 pb-1 shrink-0 flex lg:justify-center"
          }
        >
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              openPalette();
            }}
            className={searchBtnClasses}
            aria-label="打開 Command Palette"
            title="搜尋或跳轉 (⌘K)"
          >
            <Search {...iconProps} size={16} className="shrink-0" />
            <span className={`flex-1 text-left text-caption truncate ${drawerOnly}`}>
              搜尋或跳轉…
            </span>
            <kbd
              className={`hidden sm:inline-flex items-center px-1.5 h-5 text-[10px] font-mono text-foreground-subtle bg-muted rounded-sm ${drawerOnly}`}
            >
              {formatKey("mod+k")}
            </kbd>
          </button>
        </div>

        {/* Nav links */}
        <nav className={navContainerClasses}>
          {NAV_ENTRIES.map((entry) => {
            if (isGroup(entry)) {
              const groupExpanded = openGroups.includes(entry.label);
              const groupActive = isGroupActive(entry);
              const Icon = entry.icon;
              return (
                <div
                  key={entry.label}
                  className={
                    expanded
                      ? "mb-0.5"
                      : "mb-0.5 lg:w-full lg:flex lg:flex-col lg:items-center"
                  }
                >
                  {/* Rail mode (desktop !expanded): treat group as single icon */}
                  <Link
                    href={entry.items[0]?.href ?? "/"}
                    onClick={() => setSidebarOpen(false)}
                    className={`${railOnlyLg} w-10 h-10 rounded-md items-center justify-center mb-1 transition-all ${
                      groupActive
                        ? "bg-foreground text-background shadow-raised-sm"
                        : "text-foreground-muted hover:bg-muted hover:text-foreground"
                    }`}
                    aria-label={entry.label}
                    title={entry.label}
                  >
                    <Icon {...iconProps} size={18} />
                  </Link>
                  {/* Drawer mode (mobile always + desktop expanded): collapsible group */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.label)}
                    className={`${drawerOnly} w-full flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-colors ${
                      groupActive
                        ? "font-medium text-foreground"
                        : "text-foreground-muted hover:bg-muted hover:text-foreground"
                    }`}
                    aria-expanded={groupExpanded}
                  >
                    <Icon {...iconProps} size={17} className="shrink-0" />
                    <span className="flex-1 text-left truncate">{entry.label}</span>
                    <ChevronDown
                      {...iconProps}
                      size={14}
                      className={`shrink-0 transition-transform ${
                        groupExpanded ? "" : "-rotate-90"
                      }`}
                    />
                  </button>
                  {groupExpanded && (
                    <div className={`${drawerOnly} ml-4 mt-0.5 border-l border-border-subtle pl-1`}>
                      {entry.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-sm text-sm transition-colors ${
                              active
                                ? "bg-foreground text-background font-medium"
                                : "text-foreground-muted hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <ItemIcon {...iconProps} size={15} className="shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            // Single nav item
            const Icon = entry.icon;
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? "page" : undefined}
                aria-label={entry.label}
                title={entry.label}
                className={`flex items-center rounded-md transition-all gap-2.5 px-3 py-2 mb-0.5 text-sm ${railNavLinkClasses} ${
                  active
                    ? `bg-foreground text-background shadow-raised-sm font-medium ${
                        expanded ? "" : "lg:font-normal"
                      }`
                    : "text-foreground-muted hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon {...iconProps} size={18} className="shrink-0" />
                <span className={`truncate ${drawerOnly}`}>{entry.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className={bottomClasses}>
          <div className={bottomInnerClasses}>
            <NotificationCenter />
            <PrivacyToggle />
            <ThemeToggle />
            {mounted && hasToken && (
              <button
                onClick={handleLogout}
                aria-label="登出"
                title="登出"
                className={
                  expanded
                    ? "flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border-subtle rounded-md hover:bg-muted transition-colors"
                    : "flex items-center gap-1.5 text-xs px-2.5 py-1.5 lg:w-10 lg:h-10 lg:justify-center lg:px-0 lg:py-0 border border-border-subtle rounded-md hover:bg-muted transition-colors"
                }
              >
                <LogOut {...iconProps} size={14} />
                <span className={drawerOnly}>登出</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar — pt-safe 避開 notch / Dynamic Island */}
        <header className="lg:hidden shrink-0 border-b border-border-subtle bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex items-center h-14 px-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="mr-2 hover:bg-surface-elevated rounded-sm p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
              aria-label="開啟選單"
            >
              <Menu {...iconProps} size={22} />
            </button>
            <span className="font-semibold text-base tracking-tight flex-1">life-os</span>
            <NotificationCenter />
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Mobile bottom-tab nav — thumb-reachable primary navigation */}
        <nav
          className="lg:hidden shrink-0 border-t border-border-subtle bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
          aria-label="主選單"
        >
          <div className="flex items-stretch">
            {BOTTOM_TABS.map((tab) => {
              const active = isActive(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors ${
                    active
                      ? "text-accent"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated/50"
                  }`}
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-accent rounded-full" aria-hidden />
                  )}
                  <Icon
                    {...iconProps}
                    size={20}
                    className={`transition-transform ${active ? "scale-110" : ""}`}
                  />
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
