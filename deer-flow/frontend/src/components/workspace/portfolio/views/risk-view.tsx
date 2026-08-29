"use client";

import { AlertTriangleIcon, CheckCircleIcon, ShieldAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import type { InsightComputedPayload } from "@/core/portfolio/insights-api";
import type { StockRiskResponse } from "@/core/portfolio/types";
import { cn } from "@/lib/utils";

import { InsightRunner } from "../evidence/insight-runner";

type RiskState = "ok" | "near" | "breach";

const STATE_META: Record<
  RiskState,
  { label: string; badge: string; bar: string; text: string }
> = {
  ok: {
    label: "正常",
    badge: "bg-[#F1F9EE] text-[#478433]",
    bar: "bg-[#3f6218]",
    text: "text-[#3f6218]",
  },
  near: {
    label: "接近阈值",
    badge: "bg-[#FDF6E7] text-[#8a5a00]",
    bar: "bg-[#c9930a]",
    text: "text-[#8a5a00]",
  },
  breach: {
    label: "突破阈值",
    badge: "bg-[#FFF2F2] text-[#b91c1c]",
    bar: "bg-[#b91c1c]",
    text: "text-[#b91c1c]",
  },
};

function ratioState(value: number | null, threshold: number | null): RiskState {
  if (value == null || threshold == null || threshold <= 0) return "ok";
  if (value > threshold) return "breach";
  if (value >= threshold * 0.8) return "near";
  return "ok";
}

function StatusBadge({ state }: { state: RiskState }) {
  const meta = STATE_META[state];
  const Icon =
    state === "ok"
      ? CheckCircleIcon
      : state === "near"
        ? AlertTriangleIcon
        : ShieldAlertIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.badge,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function RiskView({ item }: { item: PortfolioDashboardItem }) {
  const accountId = Number(item.portfolio.id);
  const autoRunKey = useMemo(
    () => (Number.isFinite(accountId) ? `risk|${accountId}` : null),
    [accountId],
  );

  return (
    <InsightRunner
      packType="risk"
      accountId={Number.isFinite(accountId) ? accountId : null}
      title="风险诊断"
      description="体检式风险检查：每项给出当前值、阈值与三态判定（正常 / 接近 / 突破），汇总为风险体温分。判定全部来自规则，AI 只负责解读。"
      buildBody={() => ({ account_id: accountId })}
      autoRunKey={autoRunKey}
      runLabel="重新诊断"
      headline={(data) => {
        const risk = data as unknown as StockRiskResponse;
        const states = deriveStates(risk);
        const breach = states.filter((s) => s.state === "breach").length;
        const near = states.filter((s) => s.state === "near").length;
        const score = computeScore(states);
        if (breach > 0) {
          return `风险体温 ${score} 分：${breach} 项突破阈值、${near} 项接近阈值，建议优先处理突破项。`;
        }
        if (near > 0) {
          return `风险体温 ${score} 分：暂无突破阈值项，${near} 项接近阈值，保持关注。`;
        }
        return `风险体温 ${score} 分：全部 ${states.length} 项检查正常。`;
      }}
      renderStructured={(data, pack) => <RiskStructured data={data} pack={pack} />}
    />
  );
}

interface DimensionState {
  key: string;
  label: string;
  state: RiskState;
}

function deriveStates(risk: StockRiskResponse): DimensionState[] {
  const thresholds = risk.thresholds ?? {};
  const concentrationThreshold =
    typeof thresholds.concentration_alert_pct === "number"
      ? thresholds.concentration_alert_pct
      : null;
  const drawdownThreshold =
    typeof thresholds.drawdown_alert_pct === "number"
      ? thresholds.drawdown_alert_pct
      : null;

  const concentration = ratioState(
    risk.concentration?.top_weight_pct ?? null,
    concentrationThreshold,
  );
  const sector = ratioState(
    risk.sector_concentration?.top_weight_pct ?? null,
    concentrationThreshold,
  );
  const drawdown = ratioState(
    risk.drawdown?.max_drawdown_pct ?? null,
    drawdownThreshold,
  );
  const triggered = risk.stop_loss?.triggered_count ?? 0;
  const near = risk.stop_loss?.near_count ?? 0;
  const stopLoss: RiskState = triggered > 0 ? "breach" : near > 0 ? "near" : "ok";

  return [
    { key: "concentration", label: "持仓集中度", state: concentration },
    { key: "sector", label: "行业集中度", state: sector },
    { key: "drawdown", label: "回撤", state: drawdown },
    { key: "stop_loss", label: "止损", state: stopLoss },
  ];
}

function computeScore(states: DimensionState[]): number {
  const perDimension = 100 / states.length;
  return Math.round(
    states.reduce(
      (total, dimension) =>
        total +
        (dimension.state === "ok"
          ? perDimension
          : dimension.state === "near"
            ? perDimension / 2
            : 0),
      0,
    ),
  );
}

function scoreTone(score: number) {
  if (score >= 80) return { text: "text-[#3f6218]", label: "低风险" };
  if (score >= 50) return { text: "text-[#8a5a00]", label: "中风险" };
  return { text: "text-[#b91c1c]", label: "高风险" };
}

function RiskStructured({
  data,
  pack,
}: {
  data: InsightComputedPayload["data"];
  pack: EvidencePack;
}) {
  const risk = data as unknown as StockRiskResponse;
  const drawdown = risk.drawdown;
  const concentration = risk.concentration;
  const sector = risk.sector_concentration;
  const stopLoss = risk.stop_loss;
  const thresholds = risk.thresholds ?? {};

  const states = deriveStates(risk);
  const score = computeScore(states);
  const tone = scoreTone(score);

  return (
    <div className="space-y-6">
      {/* health score + dimension summary */}
      <div className="border-border bg-card grid grid-cols-1 gap-[1px] overflow-hidden rounded-2xl border md:grid-cols-[220px_1fr]">
        <div className="bg-card flex flex-col items-center justify-center px-6 py-6">
          <span className="text-muted-foreground text-xs">风险体温分</span>
          <div
            className={cn(
              "mt-1 font-serif text-5xl font-normal tabular-nums",
              tone.text,
            )}
          >
            {score}
          </div>
          <span className={cn("mt-1 text-xs font-medium", tone.text)}>
            {tone.label}
          </span>
          <p className="text-muted-foreground mt-2 text-center text-[11px] leading-4">
            计分 = {states.length} 项检查 × 单项{" "}
            {Math.round(100 / states.length)} 分（正常满分 / 接近半分 / 突破 0 分）
          </p>
        </div>
        <div className="bg-card grid grid-cols-2 gap-[1px] md:grid-cols-4">
          {states.map((dimension) => (
            <div key={dimension.key} className="px-5 py-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  {dimension.label}
                </span>
                <StatusBadge state={dimension.state} />
              </div>
              <div className="mt-3 flex items-end gap-1.5">
                <span
                  className={cn(
                    "font-serif text-xl tabular-nums",
                    STATE_META[dimension.state].text,
                  )}
                >
                  {dimension.state === "ok" ? "通过" : dimension.state === "near" ? "接近" : "突破"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* scorecards with gauges */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ScoreCard
          label="持仓集中度"
          state={ratioState(
            concentration?.top_weight_pct ?? null,
            typeof thresholds.concentration_alert_pct === "number"
              ? thresholds.concentration_alert_pct
              : null,
          )}
          value={concentration?.top_weight_pct ?? null}
          threshold={
            typeof thresholds.concentration_alert_pct === "number"
              ? thresholds.concentration_alert_pct
              : null
          }
          caption={`最大单一持仓 ${concentration?.top_positions?.[0]?.symbol ?? "—"}`}
        />
        <ScoreCard
          label="行业集中度"
          state={ratioState(
            sector?.top_weight_pct ?? null,
            typeof thresholds.concentration_alert_pct === "number"
              ? thresholds.concentration_alert_pct
              : null,
          )}
          value={sector?.top_weight_pct ?? null}
          threshold={
            typeof thresholds.concentration_alert_pct === "number"
              ? thresholds.concentration_alert_pct
              : null
          }
          caption={`最大行业 ${sector?.top_sectors?.[0]?.sector === "UNCLASSIFIED" ? "未分类" : sector?.top_sectors?.[0]?.sector ?? "—"}`}
        />
        <ScoreCard
          label="最大回撤"
          state={ratioState(
            drawdown?.max_drawdown_pct ?? null,
            typeof thresholds.drawdown_alert_pct === "number"
              ? thresholds.drawdown_alert_pct
              : null,
          )}
          value={drawdown?.max_drawdown_pct ?? null}
          threshold={
            typeof thresholds.drawdown_alert_pct === "number"
              ? thresholds.drawdown_alert_pct
              : null
          }
          caption={`当前回撤 ${drawdown?.current_drawdown_pct != null ? `${Number(drawdown.current_drawdown_pct).toFixed(2)}%` : "—"}`}
        />
        <ScoreCard
          label="止损检查"
          state={(stopLoss?.triggered_count ?? 0) > 0 ? "breach" : (stopLoss?.near_count ?? 0) > 0 ? "near" : "ok"}
          value={stopLoss?.triggered_count ?? 0}
          threshold={0}
          unit="只"
          caption={`接近止损 ${stopLoss?.near_count ?? 0} 只 · 阈值 -${thresholds.stop_loss_alert_pct ?? "—"}%`}
          hideGauge
        />
      </div>

      {/* concentration detail */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-sm font-semibold">持仓集中度明细</h2>
          <StatusBadge
            state={ratioState(
              concentration?.top_weight_pct ?? null,
              typeof thresholds.concentration_alert_pct === "number"
                ? thresholds.concentration_alert_pct
                : null,
            )}
          />
        </div>
        <div className="mt-4 space-y-3">
          {(concentration?.top_positions ?? []).map((pos) => (
            <div key={pos.symbol} className="flex items-center gap-3">
              <span className="text-foreground/80 w-24 text-sm font-medium">{pos.symbol}</span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full", pos.is_alert ? "bg-[#b91c1c]" : "bg-[#3f6218]")}
                  style={{ width: `${Math.min(100, pos.weight_pct ?? 0)}%` }}
                />
              </div>
              <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
                {pos.weight_pct != null ? `${Number(pos.weight_pct).toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* sector detail */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-sm font-semibold">行业集中度明细</h2>
          <StatusBadge
            state={ratioState(
              sector?.top_weight_pct ?? null,
              typeof thresholds.concentration_alert_pct === "number"
                ? thresholds.concentration_alert_pct
                : null,
            )}
          />
        </div>
        <div className="mt-4 space-y-3">
          {(sector?.top_sectors ?? []).map((s) => (
            <div key={s.sector} className="flex items-center gap-3">
              <span className="text-foreground/80 w-24 text-sm font-medium">
                {s.sector === "UNCLASSIFIED" ? "未分类" : s.sector}
              </span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full", s.is_alert ? "bg-[#b91c1c]" : "bg-[#3f6218]")}
                  style={{ width: `${Math.min(100, s.weight_pct ?? 0)}%` }}
                />
              </div>
              <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
                {s.weight_pct != null ? `${Number(s.weight_pct).toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        证据包 {pack.pack_id.slice(0, 8)} · 数据截至 {pack.as_of} · 阈值可被投资者画像覆盖
      </p>
    </div>
  );
}

function ScoreCard({
  label,
  state,
  value,
  threshold,
  caption,
  unit = "%",
  hideGauge = false,
}: {
  label: string;
  state: RiskState;
  value: number | null;
  threshold: number | null;
  caption: string;
  unit?: string;
  hideGauge?: boolean;
}) {
  const meta = STATE_META[state];
  const ratio =
    value != null && threshold != null && threshold > 0
      ? Math.min(100, (value / threshold) * 100)
      : 0;

  return (
    <section className="border-border bg-card rounded-2xl border p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-sm font-semibold">{label}</h3>
        <StatusBadge state={state} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn("font-serif text-3xl tabular-nums", meta.text)}>
          {value != null ? Number(value).toFixed(unit === "%" ? 2 : 0) : "—"}
        </span>
        <span className="text-muted-foreground text-xs">{unit}</span>
        {threshold != null && !hideGauge ? (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            阈值 {threshold}
            {unit}
          </span>
        ) : null}
      </div>
      {hideGauge ? null : (
        <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full", meta.bar)}
            style={{ width: `${ratio}%` }}
          />
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs">{caption}</p>
    </section>
  );
}
