"use client";

import { useEffect, useState } from "react";

/**
 * useDebounce — 延遲 update value 直到冇新改動 delayMs 後先 fire。
 *
 *   const [q, setQ] = useState("");
 *   const debouncedQ = useDebounce(q, 300);
 *
 * 用喺搜尋框避免每打一個字就 call API。
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
