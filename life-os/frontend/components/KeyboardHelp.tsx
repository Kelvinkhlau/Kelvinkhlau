"use client";

/**
 * ⇧? — 全域 keyboard shortcut cheat sheet。
 *
 * 按 `?` 任何時候彈出（input 入面都唔會阻擋，因為 ? = Shift+/，有 mod）。
 * 排住依類型分組。
 */

import { Modal } from "./Modal";
import { usePaletteContext } from "./command/paletteContext";
import { formatKey } from "@/lib/hotkeys";

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: "全域",
    items: [
      { keys: ["mod+k"], label: "Command palette（搜尋、跳轉、動作）" },
      { keys: ["mod+n"], label: "快速新增 todo / note / idea" },
      { keys: ["?"], label: "顯示呢個 cheat sheet" },
      { keys: ["esc"], label: "關閉 modal / 彈窗" },
    ],
  },
  {
    title: "Inbox 列表",
    items: [
      { keys: ["j"], label: "下一封" },
      { keys: ["k"], label: "上一封" },
      { keys: ["o"], label: "開啟" },
      { keys: ["enter"], label: "開啟" },
      { keys: ["e"], label: "封存" },
      { keys: ["#"], label: "移到垃圾桶" },
      { keys: ["u"], label: "切換已讀 / 未讀" },
      { keys: ["r"], label: "寫郵件 / 回覆" },
    ],
  },
  {
    title: "Email 詳情",
    items: [
      { keys: ["j"], label: "下一封" },
      { keys: ["k"], label: "上一封" },
      { keys: ["e"], label: "封存" },
      { keys: ["#"], label: "移到垃圾桶" },
      { keys: ["u"], label: "標為未讀" },
      { keys: ["r"], label: "回覆" },
      { keys: ["esc"], label: "返回列表" },
    ],
  },
  {
    title: "Today / 焦點",
    items: [
      { keys: ["mod+n"], label: "新增 todo（會自動出現喺「建議」）" },
    ],
  },
];

export function KeyboardHelp() {
  const { helpOpen, closeHelp } = usePaletteContext();

  return (
    <Modal open={helpOpen} onClose={closeHelp} size="lg" title="⌨️ 鍵盤快捷鍵">
      <div className="p-5 space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="text-caption text-foreground-muted mb-2 uppercase tracking-wide">
              {g.title}
            </h3>
            <div className="space-y-1.5">
              {g.items.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-body"
                >
                  <span className="text-foreground">{s.label}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="font-mono text-caption px-2 h-6 min-w-[1.75rem] inline-flex items-center justify-center bg-muted border border-border-subtle rounded text-foreground-muted"
                      >
                        {formatKey(k)}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="text-caption text-foreground-subtle pt-2 border-t border-border-subtle">
          貼士：除咗 <kbd className="font-mono">⌘K</kbd> /{" "}
          <kbd className="font-mono">⌘N</kbd> /{" "}
          <kbd className="font-mono">?</kbd> 可以喺 input
          入面都生效，其他 shortcut 喺你 type 嘢嘅時候會自動停用。
        </p>
      </div>
    </Modal>
  );
}
