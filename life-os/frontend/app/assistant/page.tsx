"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  text: string;
  action?: string;
  createdType?: string | null;
  createdId?: number | null;
};

const ACTION_LABELS: Record<string, string> = {
  create_todo: "已建 Todo",
  create_idea: "已建 Idea",
  create_project: "已建 Project",
  chat: "",
};

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await api.chat(msg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.reply,
          action: res.action,
          createdType: res.created_type,
          createdId: res.created_id,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `錯誤：${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const text = await api.transcribe(blob);
          if (text) {
            setInput(text);
          }
        } catch {
          /* ignore */
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      /* mic permission denied */
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  return (
    <main className="min-h-screen flex flex-col max-w-2xl mx-auto">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h1 className="text-xl font-bold">AI 助手</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← 首頁
        </Link>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <p className="text-lg mb-2">你好！我係 life-os AI 助手。</p>
            <p className="text-sm">
              你可以同我講：「提醒我聽日交報告」、「記低一個 idea」、或者問我嘢。
            </p>
            <p className="text-sm mt-2">
              撳下面個 mic 按鈕，可以用廣東話語音輸入。
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === "user"
                  ? "bg-foreground text-background"
                  : "bg-muted"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
              {msg.action && msg.action !== "chat" && (
                <div className="mt-1 text-xs opacity-70">
                  {ACTION_LABELS[msg.action] || msg.action}
                  {msg.createdType && msg.createdId && (
                    <span>
                      {" "}
                      →{" "}
                      <Link
                        href={
                          msg.createdType === "project"
                            ? `/projects/detail?id=${msg.createdId}`
                            : `/${msg.createdType}s`
                        }
                        className="underline"
                      >
                        睇下
                      </Link>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-4 py-2 text-sm text-muted-foreground">
              諗緊…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-border flex gap-2"
      >
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || transcribing}
          className={`px-3 py-2 rounded-full font-medium transition ${
            recording
              ? "bg-red-500 text-white animate-pulse"
              : "bg-muted hover:bg-muted/80"
          } disabled:opacity-40`}
          title={recording ? "停止錄音" : "語音輸入"}
        >
          {transcribing ? "..." : recording ? "⏹" : "🎙"}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={transcribing ? "轉錄中…" : "同 AI 助手講嘢…"}
          className="flex-1 px-4 py-2 border border-border rounded-full bg-background"
          disabled={loading || transcribing}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading || transcribing}
          className="px-5 py-2 bg-foreground text-background rounded-full font-medium disabled:opacity-40"
        >
          送出
        </button>
      </form>
    </main>
  );
}
