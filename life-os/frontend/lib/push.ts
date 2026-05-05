/**
 * Web Push subscription helpers.
 *
 * 流程：
 * 1. 檢查 browser 支持 push + Notification API
 * 2. 攞 VAPID public key（從 backend）
 * 3. 攞 service worker registration
 * 4. 用 sw.pushManager.subscribe() 攞 PushSubscription
 * 5. POST 到 /api/push/subscribe
 *
 * iOS 16.4+ Safari 支持 Web Push，但**必須先將 app 加入主畫面**（Add to Home Screen）。
 */

import { api } from "./api";

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr as Uint8Array<ArrayBuffer>;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

/** 由 user agent 粗略猜個友善裝置名 — 用戶之後可以自己改。 */
export function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "裝置";
  const ua = navigator.userAgent;
  // iPad
  if (/iPad/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)) {
    return "iPad";
  }
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/.test(ua)) {
    if (/Chrome/.test(ua) && !/Edg/.test(ua)) return "Mac Chrome";
    if (/Firefox/.test(ua)) return "Mac Firefox";
    return "Mac Safari";
  }
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "裝置";
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

export async function subscribeToPush(label?: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("瀏覽器唔支援 Push Notification");
  }

  // 1. Request permission
  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      throw new Error("未授權通知");
    }
  }

  // 2. Fetch server's VAPID public key
  const { public_key, configured } = await api.getVapidPublicKey();
  if (!configured || !public_key) {
    throw new Error("伺服器未配置 VAPID keys");
  }

  // 3. Subscribe via service worker
  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // 已 subscribe — 驗證 key 一致，唔一致就重 subscribe
    const existingKey = sub.options.applicationServerKey;
    const sameKey =
      existingKey && new Uint8Array(existingKey).toString() ===
        urlBase64ToUint8Array(public_key).toString();
    if (!sameKey) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });
  }

  // 4. Send to backend
  const json = sub.toJSON();
  await api.subscribePush({
    endpoint: json.endpoint || sub.endpoint,
    keys: {
      p256dh: (json.keys && json.keys.p256dh) || "",
      auth: (json.keys && json.keys.auth) || "",
    },
    user_agent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    label: label || guessDeviceLabel(),
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.unsubscribePush({ endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await getRegistration();
  return reg.pushManager.getSubscription();
}
