import { ArrowRightIcon, BellIcon, CircleHelpIcon, CheckIcon } from "lucide-react";
import Link from "next/link";

import { Reveal } from "./reveal";

const TRUST_POINTS = ["实时行情接入", "多模型协同分析"];

const LEADS = [
  { name: "贵州茅台", role: "600519 · A股", company: "白酒龙头", status: "上涨", tone: "up" },
  { name: "宁德时代", role: "300750 · A股", company: "新能源电池", status: "上涨", tone: "up" },
  { name: "英伟达", role: "NVDA · 美股", company: "AI 芯片", status: "关注", tone: "watch" },
  { name: "苹果公司", role: "AAPL · 美股", company: "消费电子", status: "回调", tone: "down" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  up: "bg-[#F1F9EE] text-[#478433]",
  watch: "bg-[#EEEDFE] text-[#8B83F6]",
  down: "bg-[#FFF2F2] text-[#DD7B7B]",
};

export function LandingHero() {
  return (
    <section className="border-border bg-background relative flex min-h-[90vh] w-full flex-col items-stretch border-b lg:flex-row">
      {/* Left — copy */}
      <div className="border-border relative z-10 flex w-full flex-col justify-center border-b px-8 pt-24 pb-24 md:px-12 md:pt-42 md:pb-32 lg:w-1/2 lg:border-r lg:border-b-0">
        <Reveal className="w-full max-w-2xl lg:ml-auto">
          <h1 className="text-foreground mb-6 font-serif text-5xl leading-[1.05] font-normal tracking-[-0.02em] md:text-6xl lg:text-[72px]">
            从市场数据，到投资判断
          </h1>
          <p className="text-foreground/70 mb-10 max-w-lg text-lg leading-relaxed font-light md:text-xl">
            MetaInsight 接入实时行情与多模型协同分析，把政策信号、资金异动与
            研究结论串成一条可回溯的投研链路。
          </p>
          <div className="mb-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <Link
              href="/workspace"
              className="buttonfloat bg-foreground text-background group inline-flex w-full items-center justify-center gap-2 rounded-md border-[0.1px] border-neutral-800 px-8 py-4 text-lg font-medium ring-foreground ring-2 transition-all hover:opacity-90 sm:w-auto"
            >
              免费进入工作台
              <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="text-foreground/70 flex flex-wrap items-center gap-4 text-xs font-medium md:gap-6">
            {TRUST_POINTS.map((point) => (
              <div key={point} className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#c5e69e] text-[#55841b]">
                  <CheckIcon width={10} height={10} strokeWidth={3.5} />
                </div>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Right — product card over painting */}
      <div className="bg-muted/20 relative flex min-h-[60vh] w-full items-center justify-center overflow-hidden p-8 md:p-12 lg:min-h-0 lg:w-1/2 lg:p-16">
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/landing/hills-smudge-art.jpg"
            alt="背景"
            className="h-full w-full scale-110 object-cover opacity-90 saturate-90"
          />
          <div className="bg-background/40 absolute inset-0 mix-blend-overlay" />
        </div>

        <div className="relative mx-auto mt-12 flex min-h-[400px] w-full max-w-[560px] flex-col justify-start pt-12 pb-12 lg:mt-0">
          <Reveal
            delay={150}
            className="relative z-10 mt-24 ml-auto w-[95%] max-w-[95%] rounded-[16px] border border-white/40 bg-white/10 p-1.5 shadow-2xl backdrop-blur-sm"
          >
            <div className="flex w-full flex-col overflow-hidden rounded-[12px] border border-black/5 bg-[#fafafa] shadow-sm">
              {/* window chrome */}
              <div className="flex h-12 items-center justify-between border-b border-black/5 bg-[#fafafa] px-4">
                <div className="flex items-center gap-3">
                  <div className="bg-foreground flex h-4 w-4 items-center justify-center rounded-[4px]">
                    <div className="bg-background h-2 w-2 rounded-[2px]" />
                  </div>
                  <span className="text-foreground/90 text-[11px] font-medium tracking-widest uppercase">
                    市场脉搏
                  </span>
                </div>
                <div className="text-foreground/40 flex items-center gap-3">
                  <BellIcon width={14} height={14} />
                  <CircleHelpIcon width={14} height={14} />
                  <div className="bg-foreground/10 text-foreground/70 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium">
                    MI
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-foreground mb-0.5 text-sm font-medium tracking-tight">
                      自选跟踪
                    </h2>
                    <p className="text-foreground/50 text-[10px]">
                      共覆盖{" "}
                      <strong className="text-foreground/70 font-medium">
                        1,482
                      </strong>{" "}
                      只标的
                    </p>
                  </div>
                  <button className="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium shadow-sm">
                    导出研报
                  </button>
                </div>

                <div className="text-foreground/40 mb-2 grid grid-cols-12 gap-3 border-b border-black/5 px-1 pb-2 text-[9px] font-bold tracking-widest uppercase">
                  <div className="col-span-1" />
                  <div className="col-span-5">标的</div>
                  <div className="col-span-4">行业</div>
                  <div className="col-span-2 text-right">状态</div>
                </div>

                <div className="flex flex-col gap-1">
                  {LEADS.map((lead) => (
                    <div
                      key={lead.name}
                      className="grid grid-cols-12 items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-black/5"
                    >
                      <div className="col-span-1">
                        <div className="h-3 w-3 rounded-[3px] border border-black/10 bg-white" />
                      </div>
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="text-foreground/60 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-black/5 text-[10px] font-medium">
                          {lead.name.slice(0, 1)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-foreground/90 text-[12px] leading-none font-medium">
                            {lead.name}
                          </span>
                          <span className="text-foreground/50 text-[9px]">
                            {lead.role}
                          </span>
                        </div>
                      </div>
                      <div className="text-foreground/60 col-span-4 text-[11px]">
                        {lead.company}
                      </div>
                      <div className="col-span-2 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[lead.tone]}`}
                        >
                          {lead.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
