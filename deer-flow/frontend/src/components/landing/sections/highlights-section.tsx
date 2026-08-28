const HIGHLIGHTS = [
  { value: "A股 · 港股 · 美股", label: "三地市场统一视图" },
  { value: "分钟级", label: "行情与资讯更新" },
  { value: "多模型协同", label: "分析与研判引擎" },
  { value: "全链路留痕", label: "研究结论可回溯" },
] as const;

export function HighlightsSection() {
  return (
    <section className="border-line bg-paper relative w-full border-b">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-6 py-10 md:grid-cols-4 md:py-12">
        {HIGHLIGHTS.map((item) => (
          <div key={item.label}>
            <p className="text-ink font-[family-name:var(--font-mi-serif)] text-xl font-normal tracking-[-0.01em] md:text-2xl">
              {item.value}
            </p>
            <p className="text-ink/60 mt-1.5 text-[13px]">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
