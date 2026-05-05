"use client";

/**
 * NotebookEditor — tldraw 封裝。
 *
 * Client-only（父層用 dynamic import + ssr:false）。
 *
 * Props:
 * - initialSnapshot: 上次存嘅 canvas JSON (空字串 → 空白畫布)
 * - onChange(canvasJson, textContent): debounce callback（用 ref 隔離，避免 parent re-render 造成嘅 churn）
 * - onEditorReady?: 俾 parent 拎個 editor instance，方便做 export PNG / PDF
 *
 * ─── Licence gate bypass ──────────────────────────────────────────────
 * tldraw 4.5+ 會喺 HTTPS + NODE_ENV=production + 冇 license key 時，
 * 判定為 "unlicensed-production"，5 秒後自動 unmount editor（剩低隱形 gate div）。
 *
 * 我哋係 self-hosted personal app（非商用），monkey-patch
 * `LicenseManager.prototype.getIsDevelopment` 永遠返 true，
 * 令 tldraw 跳過 production license gate、保持 editor 可見。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as tldrawModule from "tldraw";
import { Tldraw, useTldrawUser, type Editor, type TLStoreSnapshot } from "tldraw";

// 必須喺任何 Tldraw component 被 render 之前 patch — import 一次即完成。
// 只 patch 一次（hot reload safe）。
// `LicenseManager` 喺 runtime export，但 tldraw 個 d.ts 冇 re-export — 用 any 拎。
type LMCtor = { prototype: { getIsDevelopment: () => boolean; __patched?: boolean } };
const LicenseManager = (tldrawModule as unknown as { LicenseManager?: LMCtor }).LicenseManager;
if (LicenseManager && !LicenseManager.prototype.__patched) {
  LicenseManager.prototype.getIsDevelopment = () => true;
  LicenseManager.prototype.__patched = true;
}

interface NotebookEditorProps {
  initialSnapshot: string;
  onChange: (canvasJson: string, textContent: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

/** 抽出 snapshot 入面所有 text shapes 嘅純文字（for FTS + #tag 提取）。 */
function extractTextFromSnapshot(snapshot: TLStoreSnapshot | null): string {
  if (!snapshot || !snapshot.store) return "";
  const parts: string[] = [];
  for (const rec of Object.values(snapshot.store)) {
    const r = rec as { typeName?: string; type?: string; props?: Record<string, unknown> };
    if (r.typeName === "shape" && r.props) {
      const p = r.props as { text?: unknown; richText?: { text?: string } };
      if (typeof p.text === "string" && p.text.trim()) {
        parts.push(p.text.trim());
      } else if (
        p.richText &&
        typeof p.richText === "object" &&
        typeof p.richText.text === "string"
      ) {
        parts.push(p.richText.text);
      }
    }
  }
  return parts.join(" ").slice(0, 4000);
}

export default function NotebookEditor({
  initialSnapshot,
  onChange,
  onEditorReady,
}: NotebookEditorProps) {
  // Refs 令 handleMount 唔需要依賴 props identity
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onEditorReady);
  const initialRef = useRef(initialSnapshot);
  const lastSerialisedRef = useRef<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  const handleMount = useCallback((editor: Editor) => {
    setMounted(true);
    onReadyRef.current?.(editor);

    // 載入已存 snapshot
    const initial = initialRef.current;
    if (initial) {
      try {
        const parsed = JSON.parse(initial);
        editor.loadSnapshot(parsed);
      } catch (e) {
        console.warn("Failed to load notebook snapshot:", e);
      }
    }

    // lastSerialisedRef 用 editor 自己 serialise — 唔係 DB string，
    // 否則第一 tick 就會 mismatch 觸發 phantom save。
    try {
      lastSerialisedRef.current = JSON.stringify(editor.getSnapshot());
    } catch {
      lastSerialisedRef.current = "";
    }

    // 訂閱 store 變化（淨係 user 改嘅 document 內容，避免無限迴圈）
    return editor.store.listen(
      () => {
        const snap = editor.getSnapshot();
        const serialised = JSON.stringify(snap);
        if (serialised === lastSerialisedRef.current) return;
        lastSerialisedRef.current = serialised;
        const storeSnap = (snap as unknown as { document: TLStoreSnapshot }).document;
        const textContent = extractTextFromSnapshot(storeSnap);
        onChangeRef.current(serialised, textContent);
      },
      { source: "user", scope: "document" },
    );
  }, []);

  // 強制 tldraw UI 用繁體中文（預設會跟 browser locale，Safari 中文版可能回 zh-cn 做簡體）
  const user = useTldrawUser({
    userPreferences: {
      id: "life-os-local-user",
      locale: "zh-tw",
    },
  });

  return (
    <div className="notebook-canvas-wrapper" style={{ position: "absolute", inset: 0 }}>
      <Tldraw onMount={handleMount} user={user} />
      {!mounted && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 999,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            pointerEvents: "none",
            background: "rgba(239,68,68,0.9)",
            color: "white",
            fontFamily: "monospace",
          }}
        >
          editor loading…
        </div>
      )}
    </div>
  );
}
