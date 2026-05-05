"use client";

/**
 * Swipeable — 掃左 / 掃右觸發 action 嘅 list item wrapper。
 *
 * 用喺 touch device（iPhone PWA）上面，俾用戶 swipe 封存 / 刪除 email
 * 或者 mark-done todo。Desktop 用 mouse 亦 work（pointer events），但
 * 通常用 hover actions 或者 keyboard shortcut 更順。
 *
 * 原理：
 *   - PointerEvent 追 x delta
 *   - 拖超過 threshold (80px) 放手就 trigger action（同 direction 一致）
 *   - 拖緊時跟手移動，revealing action label underneath
 *   - Release 前如果未過 threshold，彈返 0
 *
 * Props:
 *   - onSwipeLeft: 掃左（由右向左）→ 通常係 destructive（archive/delete）
 *   - onSwipeRight: 掃右（由左向右）→ 通常係 primary（done/read）
 *   - leftAction / rightAction: { label, color } — 顯示喺 swipe 背景嘅 label
 */

import { useRef, useState, type ReactNode } from "react";

type SwipeAction = {
  label: string;
  /** Tailwind bg colour，e.g. "bg-red-500" / "bg-green-500" */
  color: string;
};

type Props = {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  /** 禁用（例如已完成嘅 todo 就唔洗再 swipe） */
  disabled?: boolean;
  className?: string;
};

const THRESHOLD = 80;

export function Swipeable({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  disabled = false,
  className = "",
}: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const axisLocked = useRef<"h" | "v" | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    // 只處理 touch / pen — 避免 mouse click 意外被當 swipe
    if (e.pointerType === "mouse") return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    axisLocked.current = null;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || startX.current === null || startY.current === null) return;
    const deltaX = e.clientX - startX.current;
    const deltaY = e.clientY - startY.current;

    // Lock axis 喺首 10px 之內
    if (axisLocked.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        axisLocked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      }
    }

    if (axisLocked.current !== "h") return; // 縱向 scroll，放手
    e.preventDefault();

    // 冇 action 嘅方向唔可以拖
    let clamped = deltaX;
    if (clamped < 0 && !onSwipeLeft) clamped = 0;
    if (clamped > 0 && !onSwipeRight) clamped = 0;
    // 拖過頭加阻力
    const limit = 160;
    if (Math.abs(clamped) > limit) {
      clamped = clamped > 0 ? limit : -limit;
    }
    setDx(clamped);
  }

  function finishDrag() {
    if (axisLocked.current === "h") {
      if (dx <= -THRESHOLD && onSwipeLeft) {
        onSwipeLeft();
      } else if (dx >= THRESHOLD && onSwipeRight) {
        onSwipeRight();
      }
    }
    setDx(0);
    setDragging(false);
    startX.current = null;
    startY.current = null;
    axisLocked.current = null;
    pointerId.current = null;
  }

  function onPointerUp() {
    finishDrag();
  }

  function onPointerCancel() {
    finishDrag();
  }

  // 顯示方向 — 掃左就 reveal 左邊（其實係 right action 顯示喺右邊 bg）
  const showingLeftAction = dx < 0 && !!leftAction;
  const showingRightAction = dx > 0 && !!rightAction;

  return (
    <div
      className={`relative overflow-hidden touch-pan-y ${className}`}
      style={{ touchAction: "pan-y" }}
    >
      {/* Background action — absolute layer */}
      {showingRightAction && rightAction && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center justify-start pl-6 text-white font-medium text-sm ${rightAction.color}`}
          style={{ width: Math.max(0, dx) + 16 }}
          aria-hidden="true"
        >
          {rightAction.label}
        </div>
      )}
      {showingLeftAction && leftAction && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-6 text-white font-medium text-sm ${leftAction.color}`}
          style={{ width: Math.max(0, -dx) + 16 }}
          aria-hidden="true"
        >
          {leftAction.label}
        </div>
      )}

      {/* Content — translates with drag */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
