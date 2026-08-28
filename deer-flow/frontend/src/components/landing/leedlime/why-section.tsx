import { CheckIcon, ClockIcon, BoxIcon } from "lucide-react";

import { Reveal } from "./reveal";

const ICP_POINTS = ["A股 / 港股 / 美股", "市值 50-2000 亿", "行业龙头", "近期放量"];

const MATCH_ROWS = [
  { name: "贵州茅台", match: "98% 匹配", ok: true },
  { name: "某弱势股", match: "30% 匹配", ok: false },
];

const SYNC_ROWS = [
  { name: "贵州茅台", state: "同步中...", tone: "sync" },
  { name: "宁德时代", state: "就绪", tone: "ready" },
  { name: "英伟达", state: "就绪", tone: "ready" },
  { name: "苹果公司", state: "就绪", tone: "ready" },
];

export function WhySection() {
  return (
    <section className="border-border bg-background w-full border-b px-8 py-16 md:px-12 md:py-24">
      <Reveal className="mb-20 max-w-2xl">
        <div className="mb-6 inline-flex items-center gap-2">
          <span className="text-eyebrow text-foreground/50">
            为什么选择 MetaInsight
          </span>
        </div>
        <h2 className="text-foreground mb-6 font-serif font-normal text-4xl leading-tight tracking-[-0.02em] md:text-5xl">
          建立在准确，而非数量之上。
        </h2>
        <p className="text-foreground/60 max-w-lg text-lg leading-relaxed">
          多数工具只是堆砌海量信息 ——{" "}
          <span>泛化、未核验、过时</span>
          。我们提供真正值得参考的研究结论。
        </p>
      </Reveal>

      <div className="grid gap-12 md:grid-cols-2 md:gap-8 lg:gap-12">
        {/* Tailored */}
        <Reveal className="group flex flex-col">
          <div className="relative mb-8 flex h-[350px] w-full flex-col items-end justify-end overflow-hidden rounded-sm border border-black/[0.04] bg-[#F8F9F8] pt-12 pb-0 pl-10 sm:h-[380px] sm:pt-14 sm:pl-12">
            <div className="absolute inset-0 z-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/landing/field-paint.jpg"
                alt=""
                className="h-full w-full scale-110 object-cover object-left opacity-70"
              />
            </div>
            <div className="relative z-10 h-full w-full translate-x-px translate-y-1 rounded-tl-[20px] rounded-tr-none rounded-b-none border border-white/60 border-r-0 border-b-0 bg-white/40 pt-2 pr-0 pb-0 pl-2 shadow-[0_-10px_50px_-15px_rgba(0,0,0,0.15)] backdrop-blur-md">
              <div className="flex h-full w-full flex-col rounded-tl-[16px] rounded-tr-none rounded-b-none border border-black/[0.02] bg-white p-6 pb-8 shadow-sm sm:p-7">
                <div className="flex flex-col gap-2 pb-6">
                  <div className="mb-2 text-[9px] font-semibold tracking-widest text-black/30 uppercase">
                    研究范围
                  </div>
                  {ICP_POINTS.map((point) => (
                    <div
                      key={point}
                      className="flex items-center gap-2.5 text-xs font-medium text-black/70"
                    >
                      <span className="font-bold text-lime-500">✓</span> {point}
                    </div>
                  ))}
                </div>
                <div className="relative -mt-3 mb-2 flex justify-center">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <div className="w-full border-t border-black/5" />
                  </div>
                  <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/5 bg-white text-black/30 shadow-sm">
                    ↓
                  </div>
                </div>
                <div className="flex flex-col gap-2.5 pt-1">
                  {MATCH_ROWS.map((row) => (
                    <div
                      key={row.name}
                      className={`flex items-center justify-between rounded-[10px] border bg-white px-3.5 py-2.5 shadow-sm ${
                        row.ok ? "border-black/[0.06]" : "border-black/[0.04] opacity-60"
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold ${row.ok ? "text-black/80" : "text-black/50"}`}
                      >
                        {row.name}
                      </div>
                      <div
                        className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide ${
                          row.ok
                            ? "bg-lime-500/10 text-lime-700"
                            : "bg-red-500/10 text-red-700"
                        }`}
                      >
                        {row.match} {row.ok ? "✓" : "✕"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-blue-100 bg-blue-50/50 text-blue-500">
              <BoxIcon className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-foreground font-serif text-2xl font-normal tracking-[-0.02em]">
              量身定制，而非泛泛而谈
            </h3>
          </div>
          <p className="text-foreground/70 leading-relaxed font-light">
            每条结论都对照你的具体研究范围，而非一个碰巧包含你关注标的的宽泛行业筛选。
          </p>
        </Reveal>

        {/* Current */}
        <Reveal delay={120} className="group flex flex-col">
          <div className="relative mb-8 flex h-[350px] w-full flex-col items-end justify-end overflow-hidden rounded-sm border border-black/[0.04] bg-[#F8F9F8] pt-12 pb-0 pl-10 sm:h-[380px] sm:pt-14 sm:pl-12">
            <div className="absolute inset-0 z-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/landing/hills-smudge-art.jpg"
                alt=""
                className="h-full w-full scale-110 object-cover object-right opacity-70"
              />
            </div>
            <div className="relative z-10 h-full w-full translate-x-px translate-y-1 rounded-tl-[20px] rounded-tr-none rounded-b-none border border-white/60 border-r-0 border-b-0 bg-white/40 pt-2 pr-0 pb-0 pl-2 shadow-[0_-10px_50px_-15px_rgba(0,0,0,0.15)] backdrop-blur-md">
              <div className="flex h-full w-full flex-col rounded-tl-[16px] rounded-tr-none rounded-b-none border border-black/[0.02] bg-white p-6 pb-8 shadow-sm sm:p-7">
                <div className="mt-1 mb-6 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B83F6]" />
                    <div className="text-[10px] font-bold tracking-widest text-[#8B83F6] uppercase">
                      更新中..
                    </div>
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-black/30 uppercase">
                    1 秒前更新
                  </div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {SYNC_ROWS.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-[10px] border border-black/[0.06] bg-white px-4 py-3 text-xs font-semibold shadow-sm"
                    >
                      <span className="text-black/80">{row.name}</span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide ${
                          row.tone === "sync"
                            ? "bg-[#EEEDFE] text-[#8B83F6]"
                            : "bg-lime-500/10 text-lime-700"
                        }`}
                      >
                        {row.state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-purple-100 bg-purple-50/50 text-[#8B83F6]">
              <ClockIcon className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-foreground font-serif text-2xl font-normal tracking-[-0.02em]">
              实时更新，而非陈旧档案
            </h3>
          </div>
          <p className="text-foreground/70 leading-relaxed font-light">
            数据实时来源于行情终端，而非从一个建成后就不再更新的静态数据库中调取。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
