import {
  BriefcaseIcon,
  DownloadIcon,
  LineChartIcon,
  SearchIcon,
  ShieldCheckIcon,
  SquareCheckBigIcon,
} from "lucide-react";
import Link from "next/link";

import { Reveal } from "./reveal";

const FEATURES = [
  {
    icon: LineChartIcon,
    tint: "bg-blue-500/10 text-blue-600",
    title: "实时市场洞察",
    body: "行情、资金与结构变化集中呈现，异动第一时间进入视野。",
    badge: null,
  },
  {
    icon: SearchIcon,
    tint: "bg-indigo-500/10 text-indigo-600",
    title: "智能标的发现",
    body: "按主题、板块与信号扫描全市场，定位真正符合逻辑的标的。",
    badge: null,
  },
  {
    icon: ShieldCheckIcon,
    tint: "bg-purple-500/10 text-purple-600",
    title: "结论来源核验",
    body: "每条判断都标注引用来源，可逐条回溯到原始数据。",
    badge: "即将上线",
  },
  {
    icon: SquareCheckBigIcon,
    tint: "bg-pink-500/10 text-pink-600",
    title: "相关性过滤",
    body: "多模型协同过滤噪音，只保留与研究目标真正相关的信息。",
    badge: null,
  },
  {
    icon: DownloadIcon,
    tint: "bg-rose-500/10 text-rose-600",
    title: "研报一键导出",
    body: "把分析过程与结论导出为可分享的研究报告。",
    badge: null,
  },
  {
    icon: BriefcaseIcon,
    tint: "bg-emerald-500/10 text-emerald-600",
    title: "组合跟踪管理",
    body: "自选与组合统一管理，跟踪持仓与研究进展。",
    badge: null,
  },
] as const;

export function Features() {
  return (
    <section className="border-border bg-background relative flex w-full flex-col items-center overflow-hidden border-b py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, #d1d5db 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="via-background/50 to-background pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-transparent" />

      <div className="relative z-10 mx-auto mb-12 w-full max-w-3xl px-6 text-center md:px-12">
        <Reveal>
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="text-eyebrow text-foreground/50">
              一体化投研平台
            </span>
          </div>
          <h2 className="text-foreground mx-auto max-w-2xl font-serif font-normal text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
            完成研究所需的一切，
            <br />
            尽在一个工作台。
          </h2>
          <Link
            href="/workspace"
            className="bg-foreground text-background text-md mt-5 inline-block rounded-sm border px-6 py-3 font-medium shadow-lg transition-opacity hover:opacity-90"
          >
            免费进入工作台
          </Link>
        </Reveal>
      </div>

      <div className="border-border relative mb-16 flex w-full justify-center border-y py-8 md:mb-24 md:py-24">
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/landing/field-paint.jpg"
            alt=""
            className="h-full w-full object-cover opacity-90"
          />
        </div>
        <Reveal
          delay={120}
          className="relative z-10 mx-auto w-full max-w-7xl px-6 md:px-12"
        >
          <div className="flex flex-col overflow-hidden rounded-[14px] border border-white/40 bg-white/10 p-1 shadow-2xl backdrop-blur-sm md:rounded-[20px] md:p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/landing/dashboard-ui.webp"
              alt="MetaInsight 工作台"
              className="h-auto w-full rounded-[10px] border border-black/5 object-cover md:rounded-[14px]"
            />
          </div>
        </Reveal>
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 px-6 md:grid-cols-2 md:gap-8 md:px-12 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <Reveal
            key={feature.title}
            delay={i * 80}
            className="group flex flex-col items-start rounded-2xl border border-black/5 bg-white p-8"
          >
            <div
              className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${feature.tint}`}
            >
              <feature.icon width={20} height={20} />
            </div>
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <h3 className="text-foreground text-lg font-bold tracking-tight">
                {feature.title}
              </h3>
              {feature.badge ? (
                <span className="text-foreground/60 rounded-md bg-black/5 px-2 py-1 text-[9px] font-bold tracking-widest uppercase">
                  {feature.badge}
                </span>
              ) : null}
            </div>
            <p className="text-foreground/60 text-[14px] leading-relaxed">
              {feature.body}
            </p>
            <a
              href="#"
              className="text-foreground/80 hover:text-foreground mt-6 flex items-center gap-1.5 text-[13px] font-bold transition-all hover:gap-2"
            >
              了解更多 <span className="text-lime-600">→</span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
