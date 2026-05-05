/**
 * User preferences stored in localStorage.
 *
 * 包括：
 * - displayName: 顯示名（「早晨 Kelvin」）
 * - weatherLocation: 天氣地區（lat/lng + label）
 * - autoMarkRead: 開 email 時自動標已讀（預設關）
 */

const KEY_DISPLAY_NAME = "lifeos:pref:displayName";
const KEY_WEATHER_LOC = "lifeos:pref:weatherLocation";
// v2：migrated key，舊 v1 "0" 會被無視，default 改做 ON
const KEY_AUTO_MARK_READ = "lifeos:pref:autoMarkRead:v2";
const KEY_AUTO_MARK_READ_LEGACY = "lifeos:pref:autoMarkRead";

/** 預設地區：香港 */
export const DEFAULT_WEATHER: WeatherLocation = {
  label: "香港",
  lat: 22.3193,
  lng: 114.1694,
};

export type WeatherLocation = {
  label: string;
  lat: number;
  lng: number;
};

/** 常用地區 preset —— Settings 入面俾用戶揀 */
export const WEATHER_PRESETS: WeatherLocation[] = [
  { label: "香港", lat: 22.3193, lng: 114.1694 },
  { label: "九龍", lat: 22.3167, lng: 114.1833 },
  { label: "將軍澳", lat: 22.3067, lng: 114.2597 },
  { label: "沙田", lat: 22.3815, lng: 114.1876 },
  { label: "台北", lat: 25.033, lng: 121.5654 },
  { label: "東京", lat: 35.6762, lng: 139.6503 },
  { label: "大阪", lat: 34.6937, lng: 135.5023 },
  { label: "首爾", lat: 37.5665, lng: 126.978 },
  { label: "曼谷", lat: 13.7563, lng: 100.5018 },
  { label: "新加坡", lat: 1.3521, lng: 103.8198 },
];

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getDisplayName(): string {
  const ls = safeStorage();
  return ls?.getItem(KEY_DISPLAY_NAME) ?? "";
}

export function setDisplayName(name: string): void {
  const ls = safeStorage();
  ls?.setItem(KEY_DISPLAY_NAME, name);
}

export function getWeatherLocation(): WeatherLocation {
  const ls = safeStorage();
  const raw = ls?.getItem(KEY_WEATHER_LOC);
  if (!raw) return DEFAULT_WEATHER;
  try {
    const parsed = JSON.parse(raw) as WeatherLocation;
    if (
      typeof parsed?.label === "string" &&
      typeof parsed?.lat === "number" &&
      typeof parsed?.lng === "number"
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_WEATHER;
}

export function setWeatherLocation(loc: WeatherLocation): void {
  const ls = safeStorage();
  ls?.setItem(KEY_WEATHER_LOC, JSON.stringify(loc));
}

export function getAutoMarkRead(): boolean {
  const ls = safeStorage();
  if (!ls) return true;
  const v = ls.getItem(KEY_AUTO_MARK_READ);
  // v2 key 未 set → 當做 default ON（忽略 legacy v1 嘅 "0"，因為舊 default 係 OFF 會誤導）
  if (v === null || v === undefined) return true;
  return v === "1";
}

export function setAutoMarkRead(on: boolean): void {
  const ls = safeStorage();
  if (!ls) return;
  ls.setItem(KEY_AUTO_MARK_READ, on ? "1" : "0");
  // 清走 legacy key，避免溝亂
  ls.removeItem(KEY_AUTO_MARK_READ_LEGACY);
}
