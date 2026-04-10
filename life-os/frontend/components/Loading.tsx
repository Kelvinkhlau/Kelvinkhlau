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
