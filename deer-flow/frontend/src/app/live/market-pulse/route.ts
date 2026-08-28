import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public, unauthenticated market snapshot for the landing page.
 *
 * The symbol list is fixed on the server so this route can never be turned into
 * an open proxy for the internal DSA API.
 */
const LEAD_SYMBOL = { code: "600519", name: "贵州茅台", market: "cn" } as const;
const ROW_SYMBOLS = [
  { code: "300750", name: "宁德时代", market: "cn" },
  { code: "NVDA", name: "英伟达", market: "us" },
  { code: "AAPL", name: "苹果", market: "us" },
] as const;

const CACHE_TTL_MS = 45_000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const FIRST_FILL_WAIT_MS = 3_000;

type Market = "cn" | "hk" | "us";

type Row = {
  code: string;
  name: string;
  market: Market;
  price: number;
  change: number;
  changePct: number;
};

type Symbol = { code: string; name: string; market: Market };

type Pulse = {
  live: boolean;
  updatedAt: string | null;
  lead: (Row & { series: number[] }) | null;
  rows: Row[];
};

type UpstreamQuote = {
  stock_code?: string;
  stock_name?: string | null;
  current_price?: number | null;
  change?: number | null;
  change_percent?: number | null;
};

type UpstreamHistory = { data?: { close?: number | null }[] };

const OFFLINE: Pulse = { live: false, updatedAt: null, lead: null, rows: [] };

let cache: { data: Pulse; at: number } | null = null;
let inflight: Promise<void> | null = null;
let resolvedBaseUrl: string | null = null;

function candidateBaseUrls(): string[] {
  const configured = [
    process.env.DSA_PUBLIC_API_URL,
    process.env.DSA_INTERNAL_API_URL,
  ].filter((value): value is string => Boolean(value));
  return [
    ...configured,
    "http://host.docker.internal:8000/api/v1",
    "http://localhost:8000/api/v1",
  ].map((url) => url.replace(/\/$/, ""));
}

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }
  return (await response.json()) as T;
}

async function resolveBaseUrl(): Promise<string | null> {
  if (resolvedBaseUrl) return resolvedBaseUrl;
  for (const baseUrl of candidateBaseUrls()) {
    try {
      await getJson<UpstreamQuote>(
        baseUrl,
        `/stocks/${LEAD_SYMBOL.code}/quote`,
      );
      resolvedBaseUrl = baseUrl;
      return baseUrl;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function toRow(symbol: Symbol, quote: UpstreamQuote | null): Row | null {
  const price = quote?.current_price;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return {
    code: symbol.code,
    // Upstream labels are inconsistent ("五 粮 液", "Apple Inc."); keep ours.
    name: symbol.name,
    market: symbol.market,
    price,
    change: quote?.change ?? 0,
    changePct: quote?.change_percent ?? 0,
  };
}

async function refresh(): Promise<void> {
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) {
    cache = { data: OFFLINE, at: Date.now() };
    return;
  }

  const [leadQuote, leadHistory, ...rowQuotes] = await Promise.all([
    getJson<UpstreamQuote>(baseUrl, `/stocks/${LEAD_SYMBOL.code}/quote`).catch(
      () => null,
    ),
    getJson<UpstreamHistory>(
      baseUrl,
      `/stocks/${LEAD_SYMBOL.code}/history?period=daily&days=45`,
    ).catch(() => null),
    ...ROW_SYMBOLS.map((symbol) =>
      getJson<UpstreamQuote>(baseUrl, `/stocks/${symbol.code}/quote`).catch(
        () => null,
      ),
    ),
  ]);

  const lead = toRow(LEAD_SYMBOL, leadQuote);
  if (!lead) {
    // Keep serving the previous snapshot rather than flipping the card offline.
    cache = { data: cache?.data ?? OFFLINE, at: Date.now() };
    return;
  }

  const series = (leadHistory?.data ?? [])
    .map((point) => point.close)
    .filter((close): close is number => typeof close === "number")
    .slice(-30);

  cache = {
    data: {
      live: true,
      updatedAt: new Date().toISOString(),
      lead: { ...lead, series: series.length >= 2 ? series : [] },
      rows: ROW_SYMBOLS.map((symbol, index) =>
        toRow(symbol, rowQuotes[index] ?? null),
      ).filter((row): row is Row => row !== null),
    },
    at: Date.now(),
  };
}

function scheduleRefresh(): Promise<void> {
  inflight ??= refresh()
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function GET() {
  const isFresh = cache !== null && Date.now() - cache.at < CACHE_TTL_MS;
  const pending = isFresh ? null : scheduleRefresh();

  if (cache === null && pending) {
    // Cold start: give upstream a short head start, then fall back to seed data.
    await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(resolve, FIRST_FILL_WAIT_MS)),
    ]);
  }

  return NextResponse.json(cache?.data ?? OFFLINE, {
    headers: { "cache-control": "no-store" },
  });
}
