"use client";

import {
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  LocateFixedIcon,
  MapPinIcon,
  RefreshCwIcon,
  SunIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_WEATHER_LOCATION,
  formatWeatherDay,
  roundWeatherCoordinate,
  weatherCondition,
  type WeatherIconKind,
  type WeatherSnapshot,
} from "@/core/weather";
import { cn } from "@/lib/utils";

interface WeatherLocation {
  latitude: number;
  longitude: number;
  label: string;
  isCurrent: boolean;
}

const FALLBACK_LOCATION: WeatherLocation = {
  ...DEFAULT_WEATHER_LOCATION,
  isCurrent: false,
};

function getCurrentCoordinates(): Promise<WeatherLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("当前浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          label: "当前位置",
          isCurrent: true,
        }),
      () => reject(new Error("无法读取当前位置")),
      { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 5000 },
    );
  });
}

async function loadWeather(
  location: WeatherLocation,
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(roundWeatherCoordinate(location.latitude)),
    longitude: String(roundWeatherCoordinate(location.longitude)),
  });
  const response = await fetch(`/workspace/weather-data?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("天气数据暂时不可用");
  return (await response.json()) as WeatherSnapshot;
}

export function LocalWeatherRail() {
  const [location, setLocation] = useState<WeatherLocation>(FALLBACK_LOCATION);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function initialize() {
      let initialLocation = FALLBACK_LOCATION;
      try {
        if ("permissions" in navigator) {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });
          if (permission.state === "granted") {
            initialLocation = await getCurrentCoordinates();
          }
        }
      } catch {
        // Permission lookup is optional. The fallback remains usable.
      }
      try {
        const snapshot = await loadWeather(initialLocation, controller.signal);
        if (!cancelled) {
          setLocation(initialLocation);
          setWeather(snapshot);
        }
      } catch (reason) {
        if (
          !cancelled &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setMessage("天气数据暂时不可用");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const requestCurrentLocation = useCallback(async () => {
    setLocating(true);
    setMessage("");
    try {
      const nextLocation = await getCurrentCoordinates();
      const snapshot = await loadWeather(nextLocation);
      setLocation(nextLocation);
      setWeather(snapshot);
    } catch {
      setMessage("无法读取定位，继续显示上海天气");
    } finally {
      setLocating(false);
    }
  }, []);

  const condition = weather
    ? weatherCondition(weather.current.weatherCode)
    : null;

  return (
    <section className="border-b pb-6" aria-label="本地天气">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CloudSunIcon className="size-4" /> 本地天气
          </h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <MapPinIcon className="size-3" /> {location.label}
          </p>
        </div>
        {!location.isCurrent && (
          <Button
            className="h-7 gap-1 px-2 text-xs"
            disabled={locating}
            onClick={() => void requestCurrentLocation()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {locating ? (
              <RefreshCwIcon className="size-3 animate-spin" />
            ) : (
              <LocateFixedIcon className="size-3" />
            )}
            {locating ? "定位中" : "使用当前位置"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 animate-pulse">
          <div className="bg-muted h-12 w-28 rounded" />
          <div className="bg-muted mt-4 h-20 w-full rounded" />
        </div>
      ) : weather && condition ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <WeatherGlyph className="size-10" kind={condition.icon} />
              <span className="text-4xl font-medium tracking-tight tabular-nums">
                {Math.round(weather.current.temperature)}°
              </span>
            </div>
            <div className="text-right">
              <div className="font-medium">{condition.label}</div>
              <div className="text-muted-foreground mt-1 text-xs tabular-nums">
                体感 {Math.round(weather.current.apparentTemperature)}°
              </div>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 text-xs tabular-nums">
            湿度 {Math.round(weather.current.relativeHumidity)}% · 风速{" "}
            {Math.round(weather.current.windSpeed)} km/h
          </p>
          <div className="mt-4 grid grid-cols-5 border-y py-3">
            {weather.daily.map((day, index) => {
              const dayCondition = weatherCondition(day.weatherCode);
              return (
                <div
                  className="flex min-w-0 flex-col items-center gap-2 border-r px-1 last:border-r-0"
                  key={day.date}
                  title={dayCondition.label}
                >
                  <span className="text-muted-foreground text-[11px]">
                    {formatWeatherDay(day.date, index)}
                  </span>
                  <WeatherGlyph className="size-4" kind={dayCondition.icon} />
                  <span className="text-[11px] tabular-nums">
                    {Math.round(day.high)}°{" "}
                    <span className="text-muted-foreground">
                      {Math.round(day.low)}°
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <a
            className="text-muted-foreground hover:text-foreground mt-3 inline-flex text-[11px] transition-colors"
            href="https://open-meteo.com/"
            rel="noreferrer"
            target="_blank"
          >
            天气数据 · Open-Meteo
          </a>
        </div>
      ) : (
        <div className="text-muted-foreground mt-4 flex items-center justify-between gap-3 text-xs">
          <span>{message || "天气数据暂时不可用"}</span>
          <Button
            className="h-7 px-2 text-xs"
            onClick={() => window.location.reload()}
            size="sm"
            type="button"
            variant="ghost"
          >
            重试
          </Button>
        </div>
      )}
      {message && weather && (
        <p className="text-muted-foreground mt-2 text-[11px]">{message}</p>
      )}
    </section>
  );
}

function WeatherGlyph({
  kind,
  className,
}: {
  kind: WeatherIconKind;
  className?: string;
}) {
  const iconClass = cn("shrink-0", className);
  if (kind === "clear") return <SunIcon className={iconClass} />;
  if (kind === "partly-cloudy") return <CloudSunIcon className={iconClass} />;
  if (kind === "fog") return <CloudFogIcon className={iconClass} />;
  if (kind === "rain") return <CloudRainIcon className={iconClass} />;
  if (kind === "snow") return <CloudSnowIcon className={iconClass} />;
  if (kind === "storm") return <CloudLightningIcon className={iconClass} />;
  return <CloudIcon className={iconClass} />;
}
