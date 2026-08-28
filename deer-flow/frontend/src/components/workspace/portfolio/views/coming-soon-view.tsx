"use client";

import { SparklesIcon } from "lucide-react";

const DESCRIPTIONS: Record<string, string> = {
  forecast: "基于历史净值与持仓趋势，预测组合未来表现区间。",
  review: "让 AI 对持仓个股逐一复盘，生成诊断与操作建议。",
  strategy: "基于当前配置与风险，给出调仓与再平衡建议。",
  sandbox: "模拟调仓，预览不同操作对组合净值与风险的影响。",
};

export function ComingSoonView({ view }: { view: string }) {
  return (
    <div className="border-border flex min-h-[430px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
      <div className="bg-card text-foreground flex size-14 items-center justify-center rounded-2xl border shadow-sm">
        <SparklesIcon className="size-6" />
      </div>
      <h2 className="mt-5 font-serif text-xl font-normal tracking-[-0.02em]">
        即将上线
      </h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
        {DESCRIPTIONS[view] ?? "该功能正在建设中。"}
      </p>
      <span className="bg-muted text-muted-foreground mt-4 rounded-full px-3 py-1 text-xs font-medium">
        需要 AI 能力，即将接入
      </span>
    </div>
  );
}
