"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { ArtifactsProvider } from "@/components/workspace/artifacts";
import { SubtasksProvider } from "@/core/tasks/context";

function cleanContextValue(value: string | null, maxLength: number) {
  return value?.replace(/[\r\n\0]+/g, " ").trim().slice(0, maxLength) || "";
}

export function ChatProviders({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const initialInput = useMemo(() => {
    const stock = cleanContextValue(searchParams.get("stock"), 32);
    const name = cleanContextValue(searchParams.get("name"), 80);
    const recordId = cleanContextValue(searchParams.get("recordId"), 24);
    const market = cleanContextValue(searchParams.get("market"), 24);
    const symbols = cleanContextValue(searchParams.get("symbols"), 512);
    const names = cleanContextValue(searchParams.get("names"), 1024);

    if (symbols) {
      const symbolList = symbols.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
      const nameList = names.split(",").map((item) => item.trim()).slice(0, symbolList.length);
      const labels = symbolList.map((symbol, index) =>
        nameList[index] && nameList[index] !== symbol
          ? `${nameList[index]}（${symbol}）`
          : symbol,
      );
      return `【Daily Stock Analyze 多标的研究上下文】\n标的：${labels.join("、")}\n\n请结合这些标的的实时行情、最新资讯、公告、基本面、行业环境和相对表现继续研究。先给结论，再比较关键驱动、风险与引用证据。我的问题是：`;
    }

    if (stock) {
      const stockLabel = name ? `${name}（${stock}）` : stock;
      const recordLine = /^\d+$/.test(recordId)
        ? `\nDSA 分析记录：#${recordId}`
        : "";
      return `【Daily Stock Analyze 研究上下文】\n标的：${stockLabel}${recordLine}\n\n请结合该标的的实时行情、最新资讯、公告、基本面和行业环境继续研究。先给结论，再给关键驱动与引用证据。我的问题是：`;
    }

    if (market === "cn") {
      return "【Daily Stock Analyze 研究上下文】\n范围：中国股票市场整体\n\n请结合最新指数行情、市场宽度、成交额、板块表现和重要资讯继续研究。先给结论，再给关键驱动与引用证据。我的问题是：";
    }

    return "";
  }, [searchParams]);

  return (
    <SubtasksProvider>
      <ArtifactsProvider>
        <PromptInputProvider initialInput={initialInput}>
          {children}
        </PromptInputProvider>
      </ArtifactsProvider>
    </SubtasksProvider>
  );
}
