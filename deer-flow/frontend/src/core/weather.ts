export const DEFAULT_WEATHER_LOCATION = {
  latitude: 31.23,
  longitude: 121.47,
  label: "上海",
} as const;

export type WeatherIconKind =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export interface WeatherCondition {
  icon: WeatherIconKind;
  label: string;
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  high: number;
  low: number;
  precipitationProbability: number | null;
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    observedAt: string;
    temperature: number;
    apparentTemperature: number;
    relativeHumidity: number;
    weatherCode: number;
    windSpeed: number;
  };
  daily: WeatherDay[];
}

export function weatherCondition(code: number): WeatherCondition {
  if (code === 0) return { icon: "clear", label: "晴" };
  if (code === 1 || code === 2)
    return { icon: "partly-cloudy", label: code === 1 ? "大部晴朗" : "多云" };
  if (code === 3) return { icon: "cloudy", label: "阴" };
  if (code === 45 || code === 48) return { icon: "fog", label: "有雾" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return { icon: "rain", label: code >= 80 ? "阵雨" : "有雨" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: "snow", label: "有雪" };
  if (code >= 95) return { icon: "storm", label: "雷雨" };
  return { icon: "cloudy", label: "天气变化" };
}

export function formatWeatherDay(date: string, index: number): string {
  if (index === 0) return "今天";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(parsed);
}

export function roundWeatherCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
