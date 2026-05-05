export function Loading({ text = "載入中…" }: { text?: string }) {
  return (
    <div className="text-center text-muted-foreground p-8">
      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent mb-2" />
      <div className="text-sm">{text}</div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center text-muted-foreground p-8 border border-dashed border-border rounded-lg">
      {message}
    </div>
  );
}

/**
 * 骨架載入條 — 用嚟取代 spinner，減少感知延遲。
 * <SkeletonList count={5} />
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="載入中" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-lg bg-muted/50 animate-pulse"
          aria-hidden
        />
      ))}
      <span className="sr-only">載入中…</span>
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-muted/50 animate-pulse ${className}`}
      role="status"
      aria-label="載入中"
      aria-hidden
    />
  );
}
