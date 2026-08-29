"use client";

import { Fragment } from "react";

import { cn } from "@/lib/utils";

export const PIPELINE_STEPS = [
  "读取数据",
  "确定性计算",
  "规则检查",
  "AI 解读",
] as const;

export type PipelineStage =
  | "idle"
  | "fetching"
  | "interpreting"
  | "done"
  | "error";

type StepState = "pending" | "active" | "done" | "error";

function stepStates(stage: PipelineStage, hasPack: boolean): StepState[] {
  switch (stage) {
    case "idle":
      return ["pending", "pending", "pending", "pending"];
    case "fetching":
      return ["active", "pending", "pending", "pending"];
    case "interpreting":
      return ["done", "done", "done", "active"];
    case "done":
      return ["done", "done", "done", "done"];
    case "error":
      return hasPack
        ? ["done", "done", "done", "error"]
        : ["error", "pending", "pending", "pending"];
    default:
      return ["pending", "pending", "pending", "pending"];
  }
}

/** Editorial pipeline indicator: numbered small steps on a hairline. */
export function PipelineStepper({
  stage,
  hasPack,
  note,
}: {
  stage: PipelineStage;
  hasPack: boolean;
  note?: string;
}) {
  const states = stepStates(stage, hasPack);
  return (
    <div>
      <div className="flex items-center gap-3">
        {PIPELINE_STEPS.map((label, index) => {
          const state = states[index];
          return (
            <Fragment key={label}>
              {index > 0 ? <span className="bg-border h-px flex-1" /> : null}
              <span
                className={cn(
                  "flex items-baseline gap-1.5 whitespace-nowrap text-xs",
                  state === "done" && "text-foreground/75",
                  state === "active" && "text-foreground font-medium",
                  state === "pending" && "text-foreground/35",
                  state === "error" && "text-[#b91c1c]",
                )}
              >
                <span className="text-[10px] tabular-nums opacity-60">
                  0{index + 1}
                </span>
                {label}
                {state === "active" ? (
                  <span className="bg-foreground ml-0.5 inline-block size-1 animate-pulse rounded-full" />
                ) : null}
              </span>
            </Fragment>
          );
        })}
      </div>
      {note ? (
        <p className="text-muted-foreground mt-1.5 text-[11px] tabular-nums">
          {note}
        </p>
      ) : null}
    </div>
  );
}
