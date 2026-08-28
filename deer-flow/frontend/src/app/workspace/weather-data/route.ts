import type { NextRequest } from "next/server";

import {
  DEFAULT_WEATHER_LOCATION,
  roundWeatherCoordinate,
  type WeatherDay,
  type WeatherSnapshot,
} from "@/core/weather";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export const runtime = "nodejs";

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
  };
}

function parseCoordinate(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum)
    return null;
  return roundWeatherCoordinate(parsed);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeForecast(payload: OpenMeteoResponse): WeatherSnapshot | null {
  const current = payload.current;
  const daily = payload.daily;
  if (
    !current ||
    !daily ||
    typeof current.time !== "string" ||
    !finiteNumber(current.temperature_2m) ||
    !finiteNumber(current.apparent_temperature) ||
    !finiteNumber(current.relative_humidity_2m) ||
    !finiteNumber(current.weather_code) ||
    !finiteNumber(current.wind_speed_10m) ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min)
  ) {
    return null;
  }

  const days: WeatherDay[] = [];
  for (let index = 0; index < Math.min(daily.time.length, 5); index += 1) {
    const date = daily.time[index];
    const weatherCode = daily.weather_code[index];
    const high = daily.temperature_2m_max[index];
    const low = daily.temperature_2m_min[index];
    const precipitationProbability =
      daily.precipitation_probability_max?.[index];
    if (
      typeof date !== "string" ||
      !finiteNumber(weatherCode) ||
      !finiteNumber(high) ||
      !finiteNumber(low)
    ) {
      continue;
    }
    days.push({
      date,
      weatherCode,
      high,
      low,
      precipitationProbability: finiteNumber(precipitationProbability)
        ? precipitationProbability
        : null,
    });
  }
  if (days.length === 0) return null;

  return {
    latitude: finiteNumber(payload.latitude) ? payload.latitude : 0,
    longitude: finiteNumber(payload.longitude) ? payload.longitude : 0,
    timezone: payload.timezone ?? "auto",
    current: {
      observedAt: current.time,
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      relativeHumidity: current.relative_humidity_2m,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
    },
    daily: days,
  };
}

export async function GET(request: NextRequest) {
  const latitude = parseCoordinate(
    request.nextUrl.searchParams.get("latitude"),
    DEFAULT_WEATHER_LOCATION.latitude,
    -90,
    90,
  );
  const longitude = parseCoordinate(
    request.nextUrl.searchParams.get("longitude"),
    DEFAULT_WEATHER_LOCATION.longitude,
    -180,
    180,
  );
  if (latitude === null || longitude === null) {
    return Response.json({ error: "无效的地理坐标" }, { status: 400 });
  }

  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      next: { revalidate: 600 },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Weather upstream returned ${response.status}`);
    const forecast = normalizeForecast(
      (await response.json()) as OpenMeteoResponse,
    );
    if (!forecast)
      throw new Error("Weather upstream returned an invalid payload");
    return Response.json(forecast, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600",
      },
    });
  } catch {
    return Response.json({ error: "天气数据暂时不可用" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
