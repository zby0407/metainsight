export interface MarketIndexSnapshot {
  code: string;
  name: string;
  current: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  amount: number;
  amplitude: number;
}

export interface MarketBreadthSnapshot {
  up_count: number;
  down_count: number;
  flat_count: number;
  limit_up_count: number;
  limit_down_count: number;
  total_amount: number;
  turnover_unit: string;
}

export interface SectorMoveSnapshot {
  name: string;
  change_pct: number;
}

export function formatMarketNumber(
  value: number | null | undefined,
  digits = 2,
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatCompactAmount(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) {
    return null;
  }
  if (value >= 1e12) return `${formatMarketNumber(value / 1e12, 2)} 万亿`;
  if (value >= 1e8) return `${formatMarketNumber(value / 1e8, 2)} 亿`;
  if (value >= 1e4) return `${formatMarketNumber(value / 1e4, 2)} 万`;
  return formatMarketNumber(value, 0);
}

export function aShareSessionStatus(
  now = new Date(),
  timeZone = "Asia/Shanghai",
): { label: string; live: boolean; detail: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const minutes = hour * 60 + minute;
  const weekend = weekday === "Sat" || weekday === "Sun";
  if (weekend) {
    return { label: "休市", live: false, detail: "周末休市，展示最近交易日快照" };
  }
  if (minutes >= 9 * 60 + 15 && minutes < 9 * 60 + 30) {
    return { label: "集合竞价", live: true, detail: "开盘前竞价，观察隔夜定价" };
  }
  if (minutes >= 9 * 60 + 30 && minutes < 11 * 60 + 30) {
    return { label: "早盘交易", live: true, detail: "连续竞价中，关注量价确认" };
  }
  if (minutes >= 11 * 60 + 30 && minutes < 13 * 60) {
    return { label: "午间休市", live: false, detail: "上午已结束，等待下午开盘" };
  }
  if (minutes >= 13 * 60 && minutes < 15 * 60) {
    return { label: "午后交易", live: true, detail: "连续竞价中，跟踪风格切换" };
  }
  return { label: "已收盘", live: false, detail: "展示最近收盘快照，便于复盘" };
}

export function deriveIndexBreadth(indices: MarketIndexSnapshot[]) {
  const rising = indices.filter((item) => item.change_pct > 0);
  const falling = indices.filter((item) => item.change_pct < 0);
  const flat = indices.filter((item) => item.change_pct === 0);
  const averageChange =
    indices.length === 0
      ? 0
      : indices.reduce((sum, item) => sum + item.change_pct, 0) / indices.length;
  const leader = [...indices].sort(
    (left, right) => Math.abs(right.change_pct) - Math.abs(left.change_pct),
  )[0];
  const totalAmount = indices.reduce(
    (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
    0,
  );
  return {
    rising: rising.length,
    falling: falling.length,
    flat: flat.length,
    averageChange,
    leader,
    totalAmount,
    upRatio: indices.length === 0 ? 0 : (rising.length / indices.length) * 100,
  };
}

export function resolveMarketStats(
  breadth: MarketBreadthSnapshot | null | undefined,
  indices: MarketIndexSnapshot[],
) {
  const derived = deriveIndexBreadth(indices);
  const hasOfficial =
    Boolean(breadth) &&
    ((breadth?.up_count ?? 0) + (breadth?.down_count ?? 0) > 0 ||
      (breadth?.total_amount ?? 0) > 0);

  return {
    source: hasOfficial ? "全市场" : "主要指数",
    upCount: hasOfficial ? (breadth?.up_count ?? null) : derived.rising,
    downCount: hasOfficial ? (breadth?.down_count ?? null) : derived.falling,
    upRatio: hasOfficial
      ? ((breadth?.up_count ?? 0) + (breadth?.down_count ?? 0) > 0
          ? ((breadth?.up_count ?? 0) /
              ((breadth?.up_count ?? 0) + (breadth?.down_count ?? 0))) *
            100
          : null)
      : derived.upRatio,
    limitUp: hasOfficial ? (breadth?.limit_up_count ?? null) : null,
    limitDown: hasOfficial ? (breadth?.limit_down_count ?? null) : null,
    turnover: hasOfficial
      ? breadth && breadth.total_amount > 0
        ? `${formatMarketNumber(breadth.total_amount, 0)} ${breadth.turnover_unit}`
        : null
      : formatCompactAmount(derived.totalAmount),
    averageChange: derived.averageChange,
    leader: derived.leader ?? null,
  };
}

const DEFENSIVE = /银行|保险|公用|煤炭|石油|石化|交通运输|食品|饮料|医药|农业/;
const OFFENSIVE = /半导体|芯片|计算机|电子|通信|军工|新能源|汽车|传媒|软件|人工智能|机器人/;

export function describeSectorRotation(
  top: SectorMoveSnapshot[],
  bottom: SectorMoveSnapshot[],
) {
  if (top.length === 0 && bottom.length === 0) {
    return "板块结构尚未返回，刷新后可观察进攻与防御资金的切换。";
  }
  const offensive = top.filter((item) => OFFENSIVE.test(item.name)).length;
  const defensive = top.filter((item) => DEFENSIVE.test(item.name)).length;
  const bias =
    offensive > defensive
      ? "资金偏向成长与主题"
      : defensive > offensive
        ? "资金偏向防御与红利"
        : "风格尚未一边倒";
  const leader = top[0];
  const laggard = bottom[0];
  const pieces = [bias];
  if (leader) {
    pieces.push(
      `领涨 ${leader.name} ${leader.change_pct >= 0 ? "+" : ""}${formatMarketNumber(leader.change_pct)}%`,
    );
  }
  if (laggard) {
    pieces.push(
      `领跌 ${laggard.name} ${formatMarketNumber(laggard.change_pct)}%`,
    );
  }
  if (top.length > 0) {
    pieces.push(
      `强势方向集中在 ${top
        .slice(0, 3)
        .map((item) => item.name)
        .join("、")}`,
    );
  }
  return `${pieces.join("；")}。`;
}

export function sparklinePath(values: number[], width = 72, height = 28) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function indexRangePosition(index: MarketIndexSnapshot) {
  const low = Number.isFinite(index.low) ? index.low : index.current;
  const high = Number.isFinite(index.high) ? index.high : index.current;
  const span = high - low || 1;
  return Math.min(100, Math.max(0, ((index.current - low) / span) * 100));
}

export function temperatureTone(score: number) {
  if (score >= 70) return "hot" as const;
  if (score >= 55) return "warm" as const;
  if (score <= 30) return "cold" as const;
  if (score <= 45) return "cool" as const;
  return "neutral" as const;
}
