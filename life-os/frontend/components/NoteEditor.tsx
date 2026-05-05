"use client";

/**
 * NoteEditor — Notion-style block-based editor built on TipTap.
 *
 * 特點：
 * - StarterKit 提供 paragraph / heading / bullet / numbered / blockquote / code / code block
 * - Task list (todo checkbox)
 * - Image block with `src="attachment:{id}"` — 上載去 note attachment API，
 *   render 時 fetch blob URL（避開 JWT header 問題）
 * - Markdown 輸入規則（例：`# ` → H1、`- ` → bullet、`[] ` → todo）
 * - 工具列 + 斜線指令 menu
 * - Drag / drop / paste 圖片 auto-upload
 *
 * Storage format: TipTap ProseMirror JSON string（存入 note.content，
 * note.content_format = "blocks"）。
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  EditorContent,
  useEditor,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import type { Editor, NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Heading from "@tiptap/extension-heading";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { api, type NoteAttachment } from "@/lib/api";
import { toast } from "@/components/Toast";

// ─── Attachment image node view ────────────────────────────────────────────
// Render <img src="attachment:{id}"> by fetching blob URL with JWT auth.

function AttachmentImageView({ node, selected, deleteNode }: NodeViewProps) {
  const src = (node.attrs.src as string) || "";
  const alt = (node.attrs.alt as string) || "";
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    // attachment:{noteId}:{attId}   (both IDs encoded)
    const m = src.match(/^attachment:(\d+):(\d+)$/);
    if (!m) {
      // Plain URL image (external)
      setUrl(src);
      return;
    }
    const noteId = Number(m[1]);
    const attId = Number(m[2]);
    api
      .fetchNoteAttachmentBlobUrl(noteId, attId)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
        } else {
          objectUrl = u;
          setUrl(u);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <NodeViewWrapper
      className={`my-3 relative group ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
      data-drag-handle
    >
      {error ? (
        <div className="p-4 border border-red-300 rounded text-sm text-red-600 bg-red-50 dark:bg-red-950">
          ⚠️ 圖片載入失敗（{alt || "unknown"}）
        </div>
      ) : !url ? (
        <div className="aspect-video bg-muted animate-pulse rounded" aria-label="loading image" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="max-w-full max-h-[500px] rounded border border-border"
          draggable={false}
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          deleteNode();
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded bg-black/70 text-white hover:bg-red-600 transition"
        aria-label="刪除圖片"
      >
        刪
      </button>
    </NodeViewWrapper>
  );
}

const AttachmentImage = Image.extend({
  name: "image",
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView);
  },
});

// ─── Collapsible heading ───────────────────────────────────────────────────
// 擴展 tiptap Heading — 加一個 `collapsed` 屬性。NodeView 提供 ▸/▾ 按鈕，
// 配合 ProseMirror plugin 用 decorations 隱藏 collapsed heading 之後、下一個
// 同 level 或更高 level heading 之前嘅所有 block。

function CollapsibleHeadingView({
  node,
  editor,
  getPos,
}: NodeViewProps) {
  const level = (node.attrs.level as number) || 1;
  const collapsed = Boolean(node.attrs.collapsed);
  const HeadingTag = `h${level}` as "h1" | "h2" | "h3";

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeAttribute(pos, "collapsed", !collapsed);
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper
      className="relative group collapsible-heading"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <HeadingTag className="flex items-center gap-1">
        <button
          type="button"
          contentEditable={false}
          onMouseDown={toggle}
          title={collapsed ? "展開" : "摺疊"}
          aria-label={collapsed ? "展開" : "摺疊"}
          className="text-muted-foreground hover:text-foreground text-xs w-4 h-4 flex items-center justify-center rounded select-none cursor-pointer shrink-0"
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <NodeViewContent />
      </HeadingTag>
    </NodeViewWrapper>
  );
}

const collapsedHeadingPluginKey = new PluginKey("collapsedHeadingDecorations");

/**
 * ProseMirror plugin — 為 collapsed heading 之後嘅 block 加上
 * `collapsed-hidden` CSS class（CSS 做 display:none）。
 *
 * 收合範圍：由 collapsed heading 開始，去到下一個同 level 或更高 (數字更小)
 * level 嘅 heading 為止。
 */
function buildCollapsedHeadingPlugin() {
  return new Plugin({
    key: collapsedHeadingPluginKey,
    props: {
      decorations(state) {
        const decos: Decoration[] = [];
        let hideUntilLevel: number | null = null;
        state.doc.forEach((node, offset) => {
          if (node.type.name === "heading") {
            const lvl = Number(node.attrs.level) || 1;
            // 遇到相同或更高 level heading → 結束 hiding
            if (hideUntilLevel !== null && lvl <= hideUntilLevel) {
              hideUntilLevel = null;
            }
            if (node.attrs.collapsed) {
              hideUntilLevel = lvl;
            }
            return;
          }
          if (hideUntilLevel !== null) {
            decos.push(
              Decoration.node(offset, offset + node.nodeSize, {
                class: "collapsed-hidden",
              })
            );
          }
        });
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) =>
          attrs.collapsed ? { "data-collapsed": "true" } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleHeadingView);
  },
  addProseMirrorPlugins() {
    return [buildCollapsedHeadingPlugin()];
  },
});

// ─── Slash command menu ────────────────────────────────────────────────────
// 簡化版 — 偵測到 editor 單獨一行 "/" 時 show floating menu。

type SlashCommand = {
  key: string;
  label: string;
  icon: string;
  run: (editor: Editor) => void;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    key: "h1",
    label: "標題 1",
    icon: "H1",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 1 }).run(),
  },
  {
    key: "h2",
    label: "標題 2",
    icon: "H2",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 2 }).run(),
  },
  {
    key: "h3",
    label: "標題 3",
    icon: "H3",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleHeading({ level: 3 }).run(),
  },
  {
    key: "bullet",
    label: "項目清單",
    icon: "•",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleBulletList().run(),
  },
  {
    key: "numbered",
    label: "數字清單",
    icon: "1.",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleOrderedList().run(),
  },
  {
    key: "todo",
    label: "待辦清單",
    icon: "☐",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleTaskList().run(),
  },
  {
    key: "quote",
    label: "引用",
    icon: "❝",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleBlockquote().run(),
  },
  {
    key: "code",
    label: "程式碼區塊",
    icon: "</>",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).toggleCodeBlock().run(),
  },
  {
    key: "hr",
    label: "分隔線",
    icon: "―",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).setHorizontalRule().run(),
  },
  {
    key: "table",
    label: "表格",
    icon: "▦",
    run: (e) => e.chain().focus().deleteRange({ from: e.state.selection.from - 1, to: e.state.selection.from }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

// ─── Toolbar ───────────────────────────────────────────────────────────────

function Toolbar({
  editor,
  onImageUploadClick,
  uploading,
}: {
  editor: Editor | null;
  onImageUploadClick: () => void;
  uploading: boolean;
}) {
  if (!editor) return null;

  const btn = (
    isActive: boolean,
    onClick: () => void,
    label: string,
    title: string
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={`px-2 py-1 text-xs rounded hover:bg-muted transition ${
        isActive ? "bg-muted font-bold" : ""
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1 border border-border rounded bg-background sticky top-0 z-10">
      {btn(
        editor.isActive("bold"),
        () => editor.chain().focus().toggleBold().run(),
        "B",
        "粗體"
      )}
      {btn(
        editor.isActive("italic"),
        () => editor.chain().focus().toggleItalic().run(),
        "I",
        "斜體"
      )}
      {btn(
        editor.isActive("strike"),
        () => editor.chain().focus().toggleStrike().run(),
        "S",
        "刪除線"
      )}
      {btn(
        editor.isActive("code"),
        () => editor.chain().focus().toggleCode().run(),
        "`",
        "行內程式碼"
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {btn(
        editor.isActive("heading", { level: 1 }),
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        "H1",
        "標題 1"
      )}
      {btn(
        editor.isActive("heading", { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        "H2",
        "標題 2"
      )}
      {btn(
        editor.isActive("heading", { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        "H3",
        "標題 3"
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {btn(
        editor.isActive("bulletList"),
        () => editor.chain().focus().toggleBulletList().run(),
        "•",
        "項目清單"
      )}
      {btn(
        editor.isActive("orderedList"),
        () => editor.chain().focus().toggleOrderedList().run(),
        "1.",
        "數字清單"
      )}
      {btn(
        editor.isActive("taskList"),
        () => editor.chain().focus().toggleTaskList().run(),
        "☐",
        "待辦清單"
      )}
      {btn(
        editor.isActive("blockquote"),
        () => editor.chain().focus().toggleBlockquote().run(),
        "❝",
        "引用"
      )}
      {btn(
        editor.isActive("codeBlock"),
        () => editor.chain().focus().toggleCodeBlock().run(),
        "</>",
        "程式碼區塊"
      )}
      <span className="w-px h-5 bg-border mx-1" />
      {btn(
        editor.isActive("table"),
        () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        "▦",
        "插入表格"
      )}
      <button
        type="button"
        onClick={onImageUploadClick}
        disabled={uploading}
        className="px-2 py-1 text-xs rounded hover:bg-muted transition disabled:opacity-50"
        title="插入圖片"
        aria-label="插入圖片"
      >
        {uploading ? "⏳" : "🖼"}
      </button>
      {/* Table context actions — only show when cursor is inside a table */}
      {editor.isActive("table") && (
        <>
          <span className="w-px h-5 bg-border mx-1" />
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-1.5 py-1 text-[10px] rounded hover:bg-muted transition"
            title="右方加欄"
          >
            +欄
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-1.5 py-1 text-[10px] rounded hover:bg-muted transition"
            title="下方加行"
          >
            +行
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-1.5 py-1 text-[10px] rounded hover:bg-muted text-red-500 transition"
            title="刪除欄"
          >
            -欄
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-1.5 py-1 text-[10px] rounded hover:bg-muted text-red-500 transition"
            title="刪除行"
          >
            -行
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-1.5 py-1 text-[10px] rounded hover:bg-muted text-red-500 transition"
            title="刪除表格"
          >
            刪表
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main editor ───────────────────────────────────────────────────────────

export type NoteEditorHandle = {
  /** Serialize current doc to JSON string. */
  getJson: () => string;
  /** Check if doc is effectively empty (no text, no nodes beyond empty paragraph). */
  isEmpty: () => boolean;
};

export type NoteEditorProps = {
  /** Existing note id (required for image uploads). Pass null/undefined for new notes. */
  noteId: number | null;
  /** Callback that returns a note id — parent can auto-create a draft if needed.
   *  Called when user tries to upload an image on an unsaved note.
   *  Return null to abort (e.g. title blank). */
  ensureNoteId?: () => Promise<number | null>;
  /** Initial content — JSON string (blocks) or markdown/plain text (legacy). */
  initialContent: string;
  /** Initial content format. Default "blocks". */
  initialFormat: "markdown" | "blocks";
  /** Fired whenever content changes (debounced upstream if needed). */
  onChange?: (json: string) => void;
  /** Called when image is uploaded — parent can refresh note attachments list. */
  onAttachmentAdded?: (att: NoteAttachment) => void;
  /** Read-only mode (for viewer). */
  editable?: boolean;
  /** Placeholder text. */
  placeholder?: string;
};

/** Parse incoming content into TipTap JSON doc. */
function parseInitialContent(content: string, format: "markdown" | "blocks"): object {
  if (!content || content.trim() === "") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  if (format === "blocks") {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") {
        return parsed;
      }
    } catch {
      /* fall through to markdown */
    }
  }
  // Legacy markdown / plain text → wrap each non-empty line as a paragraph.
  // Not a full markdown parser — just a best-effort fallback so nothing is lost.
  const lines = content.split("\n");
  const blocks: object[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "") {
      blocks.push({ type: "paragraph" });
      continue;
    }
    // Basic heading detection
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      blocks.push({
        type: "heading",
        attrs: { level: h[1].length },
        content: [{ type: "text", text: h[2] }],
      });
      continue;
    }
    blocks.push({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    });
  }
  return { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] };
}

export function NoteEditor({
  noteId,
  ensureNoteId,
  initialContent,
  initialFormat,
  onChange,
  onAttachmentAdded,
  editable = true,
  placeholder = "開始寫筆記，或者輸入「/」插入 block…",
}: NoteEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      let targetId = noteId;
      if (!targetId && ensureNoteId) {
        targetId = await ensureNoteId();
      }
      if (!targetId) {
        toast.info("請先輸入標題再插入圖片");
        return null;
      }
      setUploading(true);
      try {
        const att = await api.uploadNoteAttachment(targetId, file);
        onAttachmentAdded?.(att);
        return `attachment:${targetId}:${att.id}`;
      } catch (e) {
        toast.error((e as Error).message);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [noteId, ensureNoteId, onAttachmentAdded]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        // Disable built-in heading so we can register CollapsibleHeading 代替
        heading: false,
      }),
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      AttachmentImage.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false, lastColumnResizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: parseInitialContent(initialContent, initialFormat),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-3 py-2",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              uploadImage(file).then((src) => {
                if (src && editorRef.current) {
                  editorRef.current.chain().focus().setImage({ src }).run();
                }
              });
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imgFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (imgFiles.length === 0) return false;
        event.preventDefault();
        (async () => {
          for (const f of imgFiles) {
            const src = await uploadImage(f);
            if (src && editorRef.current) {
              editorRef.current.chain().focus().setImage({ src }).run();
            }
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(JSON.stringify(editor.getJSON()));
      // Slash detection — if the text immediately before cursor is "/" on a new line
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 20), from, "\n");
      const slashMatch = textBefore.match(/(?:^|\n|\s)\/([^\n/]*)$/);
      if (slashMatch) {
        setSlashFilter(slashMatch[1]);
        setSlashIndex(0);
        // Position menu below caret
        const coords = editor.view.coordsAtPos(from);
        const container = containerRef.current?.getBoundingClientRect();
        if (container) {
          setSlashPos({
            top: coords.bottom - container.top + 4,
            left: coords.left - container.left,
          });
        }
        setSlashOpen(true);
      } else if (slashOpen) {
        setSlashOpen(false);
      }
    },
  });

  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Keep editable state in sync
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Filter slash commands by the typed text
  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
    c.key.includes(slashFilter.toLowerCase())
  );

  // Keyboard navigation for slash menu
  useEffect(() => {
    if (!slashOpen || !editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === "Enter") {
        if (filteredCommands.length > 0) {
          e.preventDefault();
          const cmd = filteredCommands[slashIndex];
          // Remove the `/filter` text first
          const { from } = editor.state.selection;
          const deleteFrom = from - (slashFilter.length + 1);
          editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
          // Run command (re-implemented so we don't re-delete)
          runSlashCommand(editor, cmd);
          setSlashOpen(false);
        }
      } else if (e.key === "Escape") {
        setSlashOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [slashOpen, filteredCommands, slashIndex, editor, slashFilter]);

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const src = await uploadImage(f);
      if (src && editor) {
        editor.chain().focus().setImage({ src }).run();
      }
    }
    e.target.value = "";
  };

  if (!editor) {
    return <div className="min-h-[200px] p-3 text-muted-foreground text-sm">載入編輯器…</div>;
  }

  return (
    <div ref={containerRef} className="relative">
      {editable && (
        <Toolbar editor={editor} onImageUploadClick={handleImageButtonClick} uploading={uploading} />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleImageFileSelected}
      />
      <div className="border border-border rounded mt-1 bg-background">
        <EditorContent editor={editor} />
      </div>
      {slashOpen && slashPos && editable && (
        <div
          className="absolute z-20 w-52 bg-background border border-border rounded-lg shadow-lg overflow-hidden"
          style={{ top: slashPos.top, left: slashPos.left }}
        >
          <div className="text-[10px] text-muted-foreground px-3 py-1 border-b border-border">
            插入 block
          </div>
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">冇 matching command</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const { from } = editor.state.selection;
                  const deleteFrom = from - (slashFilter.length + 1);
                  editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
                  runSlashCommand(editor, cmd);
                  setSlashOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted ${
                  idx === slashIndex ? "bg-muted" : ""
                }`}
              >
                <span className="w-6 text-center font-mono">{cmd.icon}</span>
                <span>{cmd.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Run a slash command without its built-in "delete slash" step
 * (parent already removed the `/filter` text). */
function runSlashCommand(editor: Editor, cmd: SlashCommand) {
  const chain = editor.chain().focus();
  switch (cmd.key) {
    case "h1":
      chain.toggleHeading({ level: 1 }).run();
      break;
    case "h2":
      chain.toggleHeading({ level: 2 }).run();
      break;
    case "h3":
      chain.toggleHeading({ level: 3 }).run();
      break;
    case "bullet":
      chain.toggleBulletList().run();
      break;
    case "numbered":
      chain.toggleOrderedList().run();
      break;
    case "todo":
      chain.toggleTaskList().run();
      break;
    case "quote":
      chain.toggleBlockquote().run();
      break;
    case "code":
      chain.toggleCodeBlock().run();
      break;
    case "hr":
      chain.setHorizontalRule().run();
      break;
    case "table":
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
  }
}
