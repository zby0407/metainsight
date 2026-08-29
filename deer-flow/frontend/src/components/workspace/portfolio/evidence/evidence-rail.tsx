"use client";

import { MessageCircleQuestionIcon } from "lucide-react";

import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import { cn } from "@/lib/utils";

/** Right-rail panel for insight views: the evidence ledger of the current
 * report plus a follow-up entry. Replaces the generic marketing cards. */
export function EvidenceRail({
  pack,
  onFollowUp,
}: {
  pack: EvidencePack | null;
  onFollowUp?: () => void;
}) {
  if (!pack) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-xs leading-5">
          生成报告后，这里会列出
          <br />
          支撑结论的全部证据
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-5 py-4">
        <div className="text-foreground text-sm font-semibold">报告证据</div>
        <div className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
          {pack.facts.length} 事实 · {pack.rules.length} 规则 · {pack.gaps.length} 缺口
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <RailGroup title="关键事实">
          {pack.facts.map((fact) => (
            <RailItem key={fact.id} id={fact.id}>
              <span className="text-foreground/80">{fact.label}</span>
              <span className="text-foreground ml-auto shrink-0 font-medium tabular-nums">
                {fact.value == null ? "—" : String(fact.value)}
                {fact.unit ? <span className="text-muted-foreground text-[10px]"> {fact.unit}</span> : null}
              </span>
            </RailItem>
          ))}
        </RailGroup>

        {pack.rules.length > 0 ? (
          <RailGroup title="规则判定">
            {pack.rules.map((rule) => (
              <RailItem key={rule.id} id={rule.id}>
                <span
                  className={cn(
                    "mr-1 inline-block size-1.5 rounded-full",
                    rule.triggered ? "bg-[#b91c1c]" : "bg-[#478433]",
                  )}
                />
                <span className="text-foreground/80">{rule.rule_name}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums">
                  {rule.current_value} {rule.operator} {rule.threshold}
                </span>
              </RailItem>
            ))}
          </RailGroup>
        ) : null}

        {pack.gaps.length > 0 ? (
          <RailGroup title="数据缺口">
            {pack.gaps.map((gap) => (
              <RailItem key={gap.id} id={gap.id} tone={gap.severity}>
                <span className="text-foreground/70 leading-4">{gap.description}</span>
              </RailItem>
            ))}
          </RailGroup>
        ) : null}

        <RailGroup title="数据输入">
          {pack.inputs.map((input) => (
            <RailItem key={input.id} id={input.id}>
              <span className="text-foreground/70 leading-4">{input.description}</span>
              {input.stale ? (
                <span className="text-[#8a5a00] ml-auto shrink-0 text-[10px]">缓存</span>
              ) : null}
            </RailItem>
          ))}
        </RailGroup>
      </div>

      {onFollowUp ? (
        <div className="border-border border-t p-4">
          <button
            type="button"
            onClick={onFollowUp}
            className="bg-foreground text-background flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <MessageCircleQuestionIcon className="size-4" />
            针对本报告追问
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[10px] font-bold tracking-[0.18em] uppercase">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RailItem({
  id,
  tone,
  children,
}: {
  id: string;
  tone?: "info" | "warning" | "critical";
  children: React.ReactNode;
}) {
  return (
    <div
      id={`evidence-${id}`}
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-shadow",
        tone === "warning" && "bg-[#FDF6E7]",
        tone === "critical" && "bg-[#FFF2F2]",
      )}
    >
      <span className="text-muted-foreground/70 mt-0.5 shrink-0 text-[10px] font-medium tabular-nums">
        {id}
      </span>
      {children}
    </div>
  );
}
