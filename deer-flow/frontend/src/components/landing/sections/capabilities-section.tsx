import { LayersIcon, LineChartIcon, TargetIcon } from "lucide-react";

const CAPABILITIES = [
  {
    icon: LineChartIcon,
    title: "市场洞察",
    body: "行情、资金与结构变化集中呈现，异动第一时间进入视野，不再在多个终端之间来回切换。",
    points: ["实时行情与板块热度", "异动信号与情绪指标"],
  },
  {
    icon: LayersIcon,
    title: "研究沉淀",
    body: "分析过程、引用来源与结论一并留存，历史判断随时调出复盘，让研究真正形成资产。",
    points: ["对话与报告全程留痕", "结论可追溯到原始数据"],
  },
  {
    icon: TargetIcon,
    title: "决策协同",
    body: "从自选列表到组合跟踪，用同一套工作台完成研究闭环，团队之间共享同一份上下文。",
    points: ["自选与组合统一管理", "研究结论一键共享"],
  },
] as const;

export function CapabilitiesSection() {
  return (
    <section className="bg-cream relative w-full">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <p className="text-ink/50 text-[11px] font-semibold tracking-[0.22em] uppercase">
          Capabilities
        </p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="text-ink max-w-xl font-[family-name:var(--font-mi-serif)] text-3xl leading-[1.1] font-normal tracking-[-0.02em] md:text-[2.75rem]">
            一条链路，从看见到决定
          </h2>
          <p className="text-ink/70 max-w-md text-[15px] leading-7">
            不是又一个看盘工具，而是把观察、验证与结论串在一起的研究工作台。
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <article
              key={item.title}
              className="group border-line shadow-card hover:shadow-card-hover relative flex flex-col rounded-2xl border bg-paper p-7 transition-all duration-300 hover:-translate-y-1"
            >
              <span className="bg-ink text-cream inline-flex size-11 items-center justify-center rounded-xl">
                <item.icon className="size-5" />
              </span>
              <h3 className="text-ink mt-6 text-lg font-semibold">
                {item.title}
              </h3>
              <p className="text-ink/70 mt-3 text-[15px] leading-7">
                {item.body}
              </p>
              <ul className="border-line text-ink/60 mt-6 space-y-2 border-t pt-5 text-[13px]">
                {item.points.map((point) => (
                  <li key={point} className="flex items-center gap-2.5">
                    <span className="bg-success size-1.5 shrink-0 rounded-full" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
