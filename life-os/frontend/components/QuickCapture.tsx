"use client";

/**
 * ⌘N Quick Capture — 快速新增 todo / note / idea，唔使跳頁。
 *
 * 設計：
 *   - 預設係 todo（最常用）
 *   - 頂部 tab 切換 todo / note / idea
 *   - 單行 title + Enter 即 submit
 *   - Note 可以展開 content 輸入
 *   - Idea 可以加 tags（逗號分隔）
 *   - 成功後 invalidate queries + toast
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { Badge } from "./ui";
import {
  CheckSquare,
  FileText,
  Lightbulb,
  Loader2,
  Sparkles,
  iconProps,
  iconSize,
  type LucideIcon,
} from "./icons";
import { formatKey } from "@/lib/hotkeys";
import { api } from "@/lib/api";
import { toast } from "./Toast";
import {
  usePaletteContext,
  type CaptureKind,
} from "./command/paletteContext";

const TABS: { kind: CaptureKind; label: string; icon: LucideIcon; hint: string }[] = [
  { kind: "smart", label: "智能", icon: Sparkles, hint: "寫一句話，AI 會識分類" },
  { kind: "todo", label: "待辦", icon: CheckSquare, hint: "快速加一件要做嘅事" },
  { kind: "note", label: "筆記", icon: FileText, hint: "記低想法或知識" },
  { kind: "idea", label: "Idea", icon: Lightbulb, hint: "閃過嘅靈感" },
];

const CREATED_TYPE_LABEL: Record<string, string> = {
  todo: "待辦",
  note: "筆記",
  idea: "Idea",
  project: "Project",
  calendar_event: "行事曆",
  expense: "消費",
};

const CREATED_TYPE_QUERY_KEY: Record<string, string> = {
  todo: "todos",
  note: "notes",
  idea: "ideas",
  project: "projects",
  calendar_event: "calendar-events",
  expense: "expenses",
};

type PriorityValue = "low" | "medium" | "high";

export function QuickCapture() {
  const { captureOpen, captureKind, openCapture, closeCapture } = usePaletteContext();
  const qc = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [priority, setPriority] = useState<PriorityValue>("medium");
  const [smartText, setSmartText] = useState("");
  const [smartReply, setSmartReply] = useState<string | null>(null);

  // Reset form on open
  useEffect(() => {
    if (captureOpen) {
      setTitle("");
      setContent("");
      setTags("");
      setPriority("medium");
      setSmartText("");
      setSmartReply(null);
      const t = setTimeout(() => titleRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [captureOpen, captureKind]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error("請輸入標題");

      if (captureKind === "todo") {
        return api.createTodo({
          title: trimmed,
          priority,
          description: content.trim() || undefined,
        });
      }
      if (captureKind === "note") {
        return api.createNote({
          title: trimmed,
          content: content.trim(),
        });
      }
      // idea
      return api.createIdea({
        title: trimmed,
        content: content.trim() || undefined,
        tags: tags.trim() || undefined,
      });
    },
    onSuccess: () => {
      const labels: Record<CaptureKind, string> = {
        smart: "已新增",
        todo: "已新增待辦",
        note: "已新增筆記",
        idea: "已新增 idea",
      };
      toast(labels[captureKind], { type: "success" });
      // Invalidate caches
      if (captureKind === "todo") {
        qc.invalidateQueries({ queryKey: ["todos"] });
      } else if (captureKind === "note") {
        qc.invalidateQueries({ queryKey: ["notes"] });
      } else {
        qc.invalidateQueries({ queryKey: ["ideas"] });
      }
      closeCapture();
    },
    onError: (e) => {
      toast(e instanceof Error ? e.message : "新增失敗");
    },
  });

  const smartMutation = useMutation({
    mutationFn: async () => {
      const text = smartText.trim();
      if (!text) throw new Error("請輸入內容");
      return api.chat(text);
    },
    onSuccess: (res) => {
      const createdType = res.created_type;
      if (createdType && res.created_id) {
        const label = CREATED_TYPE_LABEL[createdType] ?? createdType;
        toast(`已新增 ${label}`, { type: "success" });
        const qkey = CREATED_TYPE_QUERY_KEY[createdType];
        if (qkey) qc.invalidateQueries({ queryKey: [qkey] });
        closeCapture();
      } else {
        // 純回覆（AI 未建立嘢，可能要再追問）
        setSmartReply(res.reply);
      }
    },
    onError: (e) => {
      toast(e instanceof Error ? e.message : "分析失敗");
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (captureKind === "smart") {
      smartMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  const activeTab = TABS.find((t) => t.kind === captureKind) ?? TABS[0];

  return (
    <Modal
      open={captureOpen}
      onClose={closeCapture}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <span>快速新增</span>
          <Badge variant="neutral" size="sm">
            {formatKey("mod+n")}
          </Badge>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.kind === captureKind;
            return (
              <button
                key={tab.kind}
                type="button"
                onClick={() => openCapture(tab.kind)}
                className={`flex-1 flex items-center justify-center gap-1.5 h-8 text-caption rounded-sm transition-colors ${
                  active
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-foreground-muted hover:text-foreground"
                }`}
              >
                <Icon {...iconProps} size={iconSize.sm} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Smart mode — single textarea, AI parses */}
        {captureKind === "smart" ? (
          <>
            <div>
              <label className="block text-caption text-foreground-muted mb-1">
                你想記錄乜？
              </label>
              <textarea
                ref={titleRef as unknown as React.RefObject<HTMLTextAreaElement>}
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    smartMutation.mutate();
                  }
                }}
                rows={3}
                placeholder="例：「聽日下晝 3 點同 Sam 開會」、「花咗 $120 食飯」、「記住買牛奶」"
                required
                autoFocus
                className="w-full px-3 py-2 text-body bg-surface border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
              />
              <div className="mt-1 text-caption text-foreground-subtle">
                AI 會自動判斷係 todo / idea / 筆記 / 行事曆 / 消費。按 <kbd className="font-mono">{formatKey("mod+enter")}</kbd> 送出。
              </div>
            </div>
            {smartReply && (
              <div className="p-3 bg-muted rounded-md text-caption text-foreground-muted border border-border-subtle">
                <div className="font-medium text-foreground mb-1">AI 回覆</div>
                {smartReply}
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="block text-caption text-foreground-muted mb-1">
              標題
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={activeTab.hint}
              required
              className="w-full h-10 px-3 text-body bg-surface border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
          </div>
        )}

        {/* Todo priority */}
        {captureKind === "todo" && (
          <div>
            <label className="block text-caption text-foreground-muted mb-1">
              優先度
            </label>
            <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
              {(["low", "medium", "high"] as const).map((p) => {
                const label = { low: "低", medium: "中", high: "高" }[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 h-8 text-caption rounded-sm transition-colors ${
                      active
                        ? "bg-surface text-foreground shadow-sm"
                        : "text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Idea tags */}
        {captureKind === "idea" && (
          <div>
            <label className="block text-caption text-foreground-muted mb-1">
              Tags（逗號分隔）
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="design, ios, side-project"
              className="w-full h-10 px-3 text-body bg-surface border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            />
          </div>
        )}

        {/* Content（共用） */}
        {captureKind !== "smart" && (
          <div>
            <label className="block text-caption text-foreground-muted mb-1">
              {captureKind === "note" ? "內容" : "備註（可選）"}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={captureKind === "note" ? 5 : 3}
              placeholder={
                captureKind === "note"
                  ? "支援 markdown"
                  : "詳細說明（可留空）"
              }
              className="w-full px-3 py-2 text-body bg-surface border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
          <span className="text-caption text-foreground-subtle">
            按 <kbd className="font-mono">↵</kbd> 儲存、
            <kbd className="font-mono">ESC</kbd> 取消
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeCapture}
              className="h-9 px-3 text-caption text-foreground-muted hover:text-foreground rounded-sm transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                captureKind === "smart"
                  ? !smartText.trim() || smartMutation.isPending
                  : !title.trim() || createMutation.isPending
              }
              className="h-9 px-4 text-caption font-medium bg-accent text-accent-foreground hover:bg-accent-strong active:bg-accent-strong rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              {(createMutation.isPending || smartMutation.isPending) && (
                <Loader2 {...iconProps} size={iconSize.sm} className="animate-spin" />
              )}
              {captureKind === "smart"
                ? smartMutation.isPending
                  ? "分析中…"
                  : "分析 + 儲存"
                : "儲存"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
