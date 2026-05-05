/**
 * Weather helpers — Open-Meteo free API（冇 API key，免費）
 *
 * https://open-meteo.com/en/docs
 */

export type WeatherSummary = {
  tempC: number;
  weatherCode: number;
  icon: string;
  label: string;
};

/** WMO weather code → emoji icon + 繁中 label */
export function weatherCodeToIcon(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "晴天" };
  if (code === 1) return { icon: "🌤️", label: "大致晴朗" };
  if (code === 2) return { icon: "⛅", label: "部分多雲" };
  if (code === 3) return { icon: "☁️", label: "多雲" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "有霧" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "毛毛雨" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "有雨" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "有雪" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", label: "陣雨" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "陣雪" };
  if (code >= 95) return { icon: "⛈️", label: "雷暴" };
  return { icon: "🌡️", label: "天氣" };
}

export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherSummary> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  const data = (await res.json()) as {
    current?: { temperature_2m: number; weather_code: number };
  };
  const cur = data.current;
  if (!cur) throw new Error("weather: no current data");
  const { icon, label } = weatherCodeToIcon(cur.weather_code);
  return {
    tempC: cur.temperature_2m,
    weatherCode: cur.weather_code,
    icon,
    label,
  };
}
