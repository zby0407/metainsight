"use client";

import { SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const ENDPOINT = "/live/market-pulse";
const POLL_INTERVAL_MS = 20_000;

type Market = "cn" | "hk" | "us";

type Row = {
  code: string;
  name: string;
  market: Market;
  price: number;
  change: number;
  changePct: number;
};

const MARKET_LABELS: Record<Market, string> = {
  cn: "A股",
  hk: "港股",
  us: "美股",
};

/** 沪深与港股红涨绿跌，美股绿涨红跌。 */
const RISE_IS_RED: Record<Market, boolean> = { cn: true, hk: true, us: false };

const TONES = {
  red: {
    text: "text-danger",
    badge: "text-danger bg-danger/10",
    flash: "bg-danger/10",
  },
  green: {
    text: "text-success",
    badge: "text-success bg-success/10",
    flash: "bg-success/10",
  },
} as const;

function toneFor(market: Market, rising: boolean) {
  return TONES[RISE_IS_RED[market] === rising ? "red" : "green"];
}

type Pulse = {
  live: boolean;
  updatedAt: string | null;
  lead: (Row & { series: number[] }) | null;
  rows: Row[];
};

const SEED_SERIES = [
  1204.98, 1210.99, 1214.88, 1251.06, 1258.99, 1247.3, 1239.86, 1252.44,
  1268.1, 1274.52, 1266.03, 1281.77, 1294.6, 1288.14, 1301.92, 1312.48,
  1305.36, 1318.7, 1327.04, 1321.0, 1353.4,
];

const SEED: Pulse = {
  live: false,
  updatedAt: null,
  lead: {
    code: "600519",
    name: "贵州茅台",
    market: "cn",
    price: 1353.4,
    change: 32.4,
    changePct: 2.45,
    series: SEED_SERIES,
  },
  rows: [
    {
      code: "300750",
      name: "宁德时代",
      market: "cn",
      price: 396.84,
      change: 4.98,
      changePct: 1.27,
    },
    {
      code: "NVDA",
      name: "英伟达",
      market: "us",
      price: 197.63,
      change: 1.31,
      changePct: 0.67,
    },
    {
      code: "AAPL",
      name: "苹果",
      market: "us",
      price: 341.25,
      change: -1.22,
      changePct: -0.36,
    },
  ],
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 112;
const CHART_PADDING = 10;

function buildChart(series: number[]) {
  if (series.length < 2) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * CHART_WIDTH;
    const y =
      CHART_HEIGHT -
      CHART_PADDING -
      ((value - min) / span) * (CHART_HEIGHT - CHART_PADDING * 2);
    return [x, y] as const;
  });

  let line = `M${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const previous = points[i - 1] ?? points[i]!;
    const current = points[i]!;
    const next = points[i + 1]!;
    const following = points[i + 2] ?? next;
    const c1x = current[0] + (next[0] - previous[0]) / 6;
    const c1y = current[1] + (next[1] - previous[1]) / 6;
    const c2x = next[0] - (following[0] - current[0]) / 6;
    const c2y = next[1] - (following[1] - current[1]) / 6;
    line += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
  }

  return {
    line,
    area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT} Z`,
    last: points[points.length - 1]!,
    length: Math.round(CHART_WIDTH * 1.4),
  };
}

function formatPrice(value: number) {
  const [integer, decimals] = value.toFixed(2).split(".");
  return `${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimals}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Plain-language read of the current snapshot, recomputed on every tick. */
function describeBreadth(rows: Row[]) {
  const advancing = rows.filter((row) => row.changePct > 0).length;
  const leader = rows.reduce((best, row) =>
    Math.abs(row.changePct) > Math.abs(best.changePct) ? row : best,
  );
  const tone =
    advancing * 2 > rows.length
      ? "情绪偏暖"
      : advancing * 2 < rows.length
        ? "情绪偏弱"
        : "涨跌互现";
  const move = leader.changePct >= 0 ? "领涨" : "领跌";
  return `${rows.length} 只跟踪标的中 ${advancing} 只上涨，${tone}；${leader.name} ${move} ${formatPercent(leader.changePct)}。`;
}

function formatAge(seconds: number) {
  if (seconds < 5) return "刚刚更新";
  if (seconds < 60) return `${seconds} 秒前更新`;
  return `${Math.floor(seconds / 60)} 分钟前更新`;
}

/** Eases a displayed number toward its target so live ticks feel continuous. */
function useTweenedNumber(target: number, duration = 700) {
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    if (Math.abs(from - target) < 0.0001) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      currentRef.current = value;
      setDisplay(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Animation frames can be throttled; make sure the final value always lands.
    const settle = window.setTimeout(() => {
      currentRef.current = target;
      setDisplay(target);
    }, duration + 250);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target, duration]);

  return display;
}

export function MarketPulseCard() {
  const [pulse, setPulse] = useState<Pulse>(SEED);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [age, setAge] = useState(0);
  const [flashes, setFlashes] = useState<Record<string, "up" | "down">>({});
  const previousPrices = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Pulse;
      if (!data.live || !data.lead) return;

      const next: Record<string, "up" | "down"> = {};
      for (const row of [data.lead, ...data.rows]) {
        const previous = previousPrices.current[row.code];
        if (previous !== undefined && previous !== row.price) {
          next[row.code] = row.price > previous ? "up" : "down";
        }
        previousPrices.current[row.code] = row.price;
      }

      setPulse(data);
      setSyncedAt(Date.now());
      setAge(0);
      if (Object.keys(next).length > 0) {
        setFlashes(next);
        window.setTimeout(() => setFlashes({}), 1200);
      }
    } catch {
      // keep showing the last good snapshot
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (syncedAt === null) return;
    const timer = window.setInterval(
      () => setAge(Math.floor((Date.now() - syncedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [syncedAt]);

  const lead = pulse.lead ?? SEED.lead!;
  const rows = pulse.rows.length > 0 ? pulse.rows : SEED.rows;
  const chart = buildChart(lead.series.length >= 2 ? lead.series : SEED_SERIES);
  const leadPrice = useTweenedNumber(lead.price);
  const leadTone = toneFor(lead.market, lead.changePct >= 0);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="from-ink/10 to-ink/5 absolute -inset-4 rounded-[2rem] bg-linear-to-br blur-2xl"
      />

      <div className="border-line shadow-card-hover relative rounded-3xl border bg-paper p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-ink/50 text-[11px] font-semibold tracking-[0.18em] uppercase">
              Market Pulse
            </p>
            <p className="text-ink mt-1 flex items-center gap-2 text-sm font-semibold">
              {lead.name}
              <span className="text-ink/50 text-xs font-normal tabular-nums">
                {lead.code}
              </span>
              <MarketTag market={lead.market} />
            </p>
          </div>
          {pulse.live ? (
            <span className="border-success/25 bg-success/10 text-success flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
              <span className="relative flex size-1.5">
                <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-70" />
                <span className="bg-success relative inline-flex size-1.5 rounded-full" />
              </span>
              实时 · {formatAge(age)}
            </span>
          ) : (
            <span className="border-line text-ink/60 rounded-full border bg-paper px-2.5 py-1 text-[11px]">
              示例数据
            </span>
          )}
        </div>

        <div className="mt-6 flex items-end gap-3">
          <span className="text-ink font-[family-name:var(--font-mi-serif)] text-4xl font-normal tracking-[-0.02em] tabular-nums">
            {formatPrice(leadPrice)}
          </span>
          <span
            className={cn(
              "mb-1.5 rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums transition-colors",
              leadTone.badge,
            )}
          >
            {formatPercent(lead.changePct)}
          </span>
        </div>

        <svg
          aria-hidden
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="mt-4 h-28 w-full"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="mi-hero-area" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="var(--color-ink)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--color-ink)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="mi-hero-line" x1="0" y1="0" x2={CHART_WIDTH} y2="0">
              <stop stopColor="var(--color-ink)" />
              <stop offset="1" stopColor="var(--color-ink-soft)" />
            </linearGradient>
          </defs>
          {chart ? (
            <g key={chart.line}>
              <path
                className="animate-mi-fade opacity-0 [animation-delay:0.7s]"
                d={chart.area}
                fill="url(#mi-hero-area)"
              />
              <path
                className="animate-mi-draw [animation-delay:0.35s]"
                style={{
                  strokeDasharray: chart.length,
                  strokeDashoffset: chart.length,
                }}
                d={chart.line}
                stroke="url(#mi-hero-line)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle
                className="origin-center animate-mi-pop opacity-0 [animation-delay:1.4s]"
                cx={chart.last[0]}
                cy={chart.last[1]}
                r="4"
                fill="var(--color-ink)"
              />
              {pulse.live ? (
                <circle
                  className="animate-ping"
                  style={{ transformOrigin: `${chart.last[0]}px ${chart.last[1]}px` }}
                  cx={chart.last[0]}
                  cy={chart.last[1]}
                  r="5"
                  fill="var(--color-ink)"
                  opacity="0.35"
                />
              ) : null}
            </g>
          ) : null}
        </svg>

        <div className="border-line mt-5 space-y-1 border-t pt-4">
          {rows.map((row) => (
            <PulseRow key={row.code} row={row} flash={flashes[row.code]} />
          ))}
        </div>

        <div className="border-line bg-cream-dark mt-5 rounded-2xl border p-4">
          <p className="text-ink/70 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
            <SparklesIcon className="size-3.5" />
            实时解读
          </p>
          <p className="text-ink/70 mt-2 text-[13px] leading-6">
            {describeBreadth([lead, ...rows])}
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketTag({ market }: { market: Market }) {
  return (
    <span className="border-line text-ink/60 rounded border px-1.5 py-px text-[10px] font-normal">
      {MARKET_LABELS[market]}
    </span>
  );
}

function PulseRow({ row, flash }: { row: Row; flash?: "up" | "down" }) {
  const price = useTweenedNumber(row.price);
  const tone = toneFor(row.market, row.changePct >= 0);
  const flashTone = flash ? toneFor(row.market, flash === "up") : null;
  return (
    <div
      className={cn(
        "-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors duration-700",
        flashTone?.flash,
      )}
    >
      <span className="text-ink/85 flex items-center gap-2 text-sm">
        {row.name}
        <MarketTag market={row.market} />
      </span>
      <span className="flex items-baseline gap-3">
        <span className="text-ink text-sm font-medium tabular-nums">
          {formatPrice(price)}
        </span>
        <span
          className={cn(
            "w-16 text-right text-sm font-medium tabular-nums",
            tone.text,
          )}
        >
          {formatPercent(row.changePct)}
        </span>
      </span>
    </div>
  );
}
