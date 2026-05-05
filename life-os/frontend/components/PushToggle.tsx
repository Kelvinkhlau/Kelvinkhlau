"use client";

import { useEffect, useState } from "react";
import { api, type PushSubscriptionOut } from "@/lib/api";
import {
  getCurrentSubscription,
  guessDeviceLabel,
  isPushSupported,
  notificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { toast } from "@/components/Toast";

/**
 * 推送通知管理 — 可以開關呢部機，同時睇晒所有已登記裝置，
 * 每部裝置獨立開關 / 改名 / 刪除。
 */
export function PushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [devices, setDevices] = useState<PushSubscriptionOut[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Initial load: detect support + this device's subscription
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sup = isPushSupported();
      if (cancelled) return;
      setSupported(sup);
      if (!sup) return;
      try {
        const sub = await getCurrentSubscription();
        if (cancelled) return;
        setThisDeviceSubscribed(sub !== null);
        setCurrentEndpoint(sub?.endpoint ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      const list = await api.listPushSubscriptions(currentEndpoint ?? undefined);
      setDevices(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDevicesLoading(false);
    }
  };

  // Load device list when expanded
  useEffect(() => {
    if (expanded) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, currentEndpoint]);

  if (supported === null) return null;
  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground text-right max-w-[200px]">
        瀏覽器唔支援推送通知。
        <br />
        iOS 用戶請先將 app 加入主畫面。
      </p>
    );
  }

  const perm = notificationPermission();

  const handleToggleThisDevice = async () => {
    setBusy(true);
    try {
      if (thisDeviceSubscribed) {
        await unsubscribeFromPush();
        setThisDeviceSubscribed(false);
        setCurrentEndpoint(null);
        toast.success("已關閉呢部機嘅推送");
      } else {
        await subscribeToPush(guessDeviceLabel());
        const sub = await getCurrentSubscription();
        setThisDeviceSubscribed(true);
        setCurrentEndpoint(sub?.endpoint ?? null);
        toast.success("已啟用呢部機嘅推送");
      }
      if (expanded) await loadDevices();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeviceToggle = async (dev: PushSubscriptionOut) => {
    try {
      const updated = await api.updatePushSubscription(dev.id, {
        enabled: !dev.enabled,
      });
      setDevices((prev) =>
        prev.map((d) => (d.id === dev.id ? { ...updated } : d))
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDeviceDelete = async (dev: PushSubscriptionOut) => {
    if (!confirm(`刪除「${dev.label || dev.user_agent.slice(0, 40)}」？`)) return;
    try {
      await api.deletePushSubscription(dev.id);
      setDevices((prev) => prev.filter((d) => d.id !== dev.id));
      if (dev.is_current) {
        // 刪咗呢部機 — 順便 unsubscribe
        await unsubscribeFromPush().catch(() => {});
        setThisDeviceSubscribed(false);
        setCurrentEndpoint(null);
      }
      toast.success("已刪除裝置");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const startEditLabel = (dev: PushSubscriptionOut) => {
    setEditingId(dev.id);
    setEditLabel(dev.label);
  };

  const saveEditLabel = async (id: number) => {
    try {
      const updated = await api.updatePushSubscription(id, {
        label: editLabel,
      });
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...updated } : d)));
      setEditingId(null);
      setEditLabel("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleToggleThisDevice}
          disabled={busy || perm === "denied"}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            thisDeviceSubscribed
              ? "bg-green-50 dark:bg-green-950 border-green-300 text-green-700 dark:text-green-300"
              : "border-border hover:bg-muted"
          } disabled:opacity-50`}
          title={
            perm === "denied"
              ? "瀏覽器已封鎖通知 — 請喺設定手動允許"
              : undefined
          }
        >
          {busy
            ? "處理中…"
            : thisDeviceSubscribed
            ? "🔔 呢部機已開"
            : perm === "denied"
            ? "🔕 通知被封鎖"
            : "🔕 開啟推送"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs px-2 py-1.5 rounded-full border border-border hover:bg-muted"
          aria-label="管理推送裝置"
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "管理裝置"}
        </button>
      </div>

      {expanded && (
        <div className="w-72 p-3 border border-border rounded-lg bg-background shadow-sm space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground">
              推送裝置
            </span>
            <button
              type="button"
              onClick={loadDevices}
              className="text-[10px] text-blue-600 hover:underline"
            >
              重新載入
            </button>
          </div>
          {devicesLoading ? (
            <p className="text-xs text-muted-foreground">載入中…</p>
          ) : devices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              未有任何裝置。撳上面「開啟推送」先登記呢部機。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {devices.map((dev) => (
                <li
                  key={dev.id}
                  className={`p-2 rounded border ${
                    dev.is_current
                      ? "border-blue-300 bg-blue-50 dark:bg-blue-950"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      {editingId === dev.id ? (
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onBlur={() => saveEditLabel(dev.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditLabel(dev.id);
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditLabel("");
                            }
                          }}
                          className="w-full text-xs px-1 py-0.5 border border-border rounded bg-background"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditLabel(dev)}
                          className="text-xs font-medium truncate w-full text-left hover:text-blue-600"
                          title="撳去改名"
                        >
                          {dev.label || dev.user_agent.slice(0, 30) || "未命名裝置"}
                          {dev.is_current && (
                            <span className="ml-1 text-[10px] text-blue-600">
                              （呢部機）
                            </span>
                          )}
                        </button>
                      )}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {new Date(dev.created_at).toLocaleDateString("zh-HK")}
                      </div>
                    </div>
                    <label
                      className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer"
                      title={dev.enabled ? "關閉推送" : "開啟推送"}
                    >
                      <input
                        type="checkbox"
                        checked={dev.enabled}
                        onChange={() => handleDeviceToggle(dev)}
                        className="cursor-pointer"
                      />
                      {dev.enabled ? "開" : "關"}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeviceDelete(dev)}
                      className="text-[10px] text-red-500 hover:underline"
                      aria-label={`刪除 ${dev.label || "裝置"}`}
                    >
                      刪
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await api.testPush();
                  toast.success(`已發出 ${r.sent} 條測試通知`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              className="w-full text-xs px-2 py-1 border border-border rounded hover:bg-muted"
            >
              發送測試通知
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
