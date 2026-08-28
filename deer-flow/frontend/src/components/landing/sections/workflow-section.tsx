const STEPS = [
  {
    step: "01",
    title: "接入与筛选",
    body: "汇总多市场行情与资讯，按自选、板块与主题过滤出真正需要关注的标的。",
  },
  {
    step: "02",
    title: "分析与验证",
    body: "在对话中调用数据与模型完成推演，每条结论都标注引用来源，便于逐条核对。",
  },
  {
    step: "03",
    title: "沉淀与复用",
    body: "把研判结果归档为可检索的研究记录，下一次决策直接从既有结论继续推进。",
  },
] as const;

export function WorkflowSection() {
  return (
    <section className="border-line bg-paper w-full border-y">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <p className="text-ink/50 text-[11px] font-semibold tracking-[0.22em] uppercase">
          Workflow
        </p>
        <h2 className="text-ink mt-4 max-w-xl font-[family-name:var(--font-mi-serif)] text-3xl leading-[1.1] font-normal tracking-[-0.02em] md:text-[2.75rem]">
          三步完成一次完整研究
        </h2>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((item) => (
            <li key={item.step} className="relative md:pr-6">
              <span className="text-ink/40 font-[family-name:var(--font-mi-serif)] text-sm font-normal tracking-[0.12em]">
                {item.step}
              </span>
              <div className="from-ink/20 mt-4 h-px w-full bg-linear-to-r to-transparent" />
              <h3 className="text-ink mt-5 text-lg font-semibold">
                {item.title}
              </h3>
              <p className="text-ink/70 mt-3 text-[15px] leading-7">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
