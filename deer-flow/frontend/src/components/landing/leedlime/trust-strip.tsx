const ITEMS = [
  "A股 · 港股 · 美股",
  "分钟级行情更新",
  "多模型协同研判",
  "全链路研究留痕",
  "自选与组合管理",
  "结论可追溯",
] as const;

export function TrustStrip() {
  const row = [...ITEMS, ...ITEMS, ...ITEMS];
  return (
    <section className="relative overflow-hidden border-y border-white/5 bg-neutral-950 pt-10">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-center">
          <div className="mb-8 flex items-center gap-4 opacity-60">
            <span className="text-[10px] font-bold tracking-[0.4em] text-white uppercase">
              覆盖市场与能力
            </span>
          </div>
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-neutral-950 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-neutral-950 to-transparent" />
            <div className="flex overflow-hidden">
              <div className="marquee-container flex items-center gap-24 whitespace-nowrap">
                {row.map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="text-sm font-medium text-white/40 transition-colors duration-500 hover:text-white"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className="pointer-events-none left-0 mt-12 h-20 w-full border border-t border-white opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, transparent, transparent 23px, white 23px, white 24px)",
        }}
      />
    </section>
  );
}
