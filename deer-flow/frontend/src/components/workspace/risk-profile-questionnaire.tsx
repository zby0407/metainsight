"use client";

import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandLockup } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  RISK_PROFILE_QUESTIONS,
  buildRiskProfileRecord,
  concludeRiskProfile,
  readStoredRiskProfile,
  riskProfileCopy,
  riskProfileFramework,
  riskProfileStorageKey,
  riskProfileText,
  writeStoredRiskProfile,
  type RiskProfileRecord,
} from "@/core/finance/risk-profile";
import {
  removeRiskProfileFromMemory,
  syncRiskProfileToMemory,
} from "@/core/finance/risk-profile-memory";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

type Stage = "intro" | "questions" | "conclusion";

function percentLabel(weight: string) {
  return `${Math.round(Number(weight) * 100)}%`;
}

export function RiskProfileQuestionnaire() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale } = useI18n();
  const [stage, setStage] = useState<Stage | "loading">("loading");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [record, setRecord] = useState<RiskProfileRecord | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const stored = readStoredRiskProfile(user.id);
    if (stored) {
      setRecord(stored);
      setAnswers(stored.answers);
      setStage("conclusion");
      return;
    }
    setStage("intro");
  }, [user?.id]);

  const question = RISK_PROFILE_QUESTIONS[index];
  const selected = question ? answers[question.id] : undefined;
  const progress =
    ((index + 1) / RISK_PROFILE_QUESTIONS.length) * 100;
  const conclusion = record
    ? concludeRiskProfile(record.profileId, locale)
    : null;

  const saveAndConclude = () => {
    if (!user?.id) return;
    const next = buildRiskProfileRecord(answers);
    writeStoredRiskProfile(user.id, next);
    setRecord(next);
    setStage("conclusion");
    void syncRiskProfileToMemory(next, locale).catch(() => {
      // Local questionnaire result is already saved; memory can retry on next workspace entry.
    });
  };

  const retake = () => {
    setAnswers({});
    setIndex(0);
    setRecord(null);
    setStage("intro");
    if (user?.id && typeof window !== "undefined") {
      window.localStorage.removeItem(riskProfileStorageKey(user.id));
    }
    void removeRiskProfileFromMemory().catch(() => {
      // Local record is already cleared; a later sync will replace a stale memory fact.
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[linear-gradient(165deg,#F7FBFF_0%,#EEF5FF_45%,#E4EEFF_100%)]">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        <BrandLockup
          markClassName="h-8 w-auto"
          nameClassName="text-xl text-[#0B2A5B]"
        />

        {stage === "loading" ? (
          <p className="mt-16 text-sm text-[#0B2A5B]/60">正在准备测评…</p>
        ) : null}

        {stage === "intro" ? (
          <section className="mt-10 rounded-3xl border border-[#0B2A5B]/10 bg-white/85 p-6 shadow-[0_24px_80px_rgba(11,42,91,0.08)] backdrop-blur-md sm:p-8">
            <Badge
              variant="outline"
              className="border-[#0B2A5B]/15 bg-[#EBF2FF] text-[#0B2A5B]"
            >
              <ShieldCheckIcon />
              {riskProfileCopy("eyebrow", locale)}
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#0B2A5B] sm:text-3xl">
              {riskProfileCopy("title", locale)}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#0B2A5B]/70">
              {riskProfileCopy("description", locale)}
            </p>
            <div className="mt-6 rounded-2xl border border-[#0B2A5B]/8 bg-[#F7FBFF] p-4">
              <p className="text-xs font-medium tracking-wide text-[#0B2A5B]/80">
                {riskProfileCopy("frameworkTitle", locale)}
              </p>
              <ul className="mt-3 space-y-3 text-xs leading-6 text-[#0B2A5B]/65">
                {riskProfileFramework(locale).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <Button
              className="mt-8 h-11 bg-[#0B2A5B] px-6 text-white hover:bg-[#0B2A5B]/90"
              onClick={() => {
                setIndex(0);
                setStage("questions");
              }}
            >
              {riskProfileCopy("start", locale)}
              <ChevronRightIcon />
            </Button>
          </section>
        ) : null}

        {stage === "questions" && question ? (
          <section className="mt-10 rounded-3xl border border-[#0B2A5B]/10 bg-white/85 p-6 shadow-[0_24px_80px_rgba(11,42,91,0.08)] backdrop-blur-md sm:p-8">
            <div className="mb-5 flex items-center justify-between gap-4 text-xs text-[#0B2A5B]/60">
              <span>
                {riskProfileCopy("stepOf", locale, {
                  current: index + 1,
                  total: RISK_PROFILE_QUESTIONS.length,
                })}
              </span>
              <Badge
                variant="outline"
                className="border-[#0B2A5B]/15 bg-[#EBF2FF] text-[#0B2A5B]"
              >
                {riskProfileText(question.dimension, locale)}
              </Badge>
            </div>
            <Progress value={progress} className="h-1.5 bg-[#0B2A5B]/10" />
            <h2 className="mt-6 text-xl font-semibold leading-8 text-[#0B2A5B]">
              {riskProfileText(question.title, locale)}
            </h2>
            <div className="mt-5 space-y-3">
              {question.options.map((option) => {
                const active = selected === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: option.id,
                      }))
                    }
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3.5 text-left text-sm leading-6 transition",
                      active
                        ? "border-[#0B2A5B] bg-[#EBF2FF] text-[#0B2A5B] shadow-sm"
                        : "border-[#0B2A5B]/10 bg-white text-[#0B2A5B]/80 hover:border-[#0B2A5B]/25 hover:bg-[#F7FBFF]",
                    )}
                  >
                    {riskProfileText(option.label, locale)}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 rounded-2xl border border-dashed border-[#0B2A5B]/15 bg-[#F7FBFF] px-4 py-3">
              <p className="text-xs font-medium text-[#0B2A5B]/70">
                {riskProfileCopy("questionBasis", locale)}
              </p>
              <p className="mt-1 text-xs leading-6 text-[#0B2A5B]/60">
                {riskProfileText(question.basis, locale)}
              </p>
            </div>
            <div className="mt-8 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                className="border-[#0B2A5B]/15"
                disabled={index === 0}
                onClick={() => setIndex((current) => Math.max(0, current - 1))}
              >
                <ChevronLeftIcon />
                {riskProfileCopy("back", locale)}
              </Button>
              {index === RISK_PROFILE_QUESTIONS.length - 1 ? (
                <Button
                  className="bg-[#0B2A5B] text-white hover:bg-[#0B2A5B]/90"
                  disabled={!selected || !user?.id}
                  onClick={saveAndConclude}
                >
                  {riskProfileCopy("submit", locale)}
                  <CheckCircle2Icon />
                </Button>
              ) : (
                <Button
                  className="bg-[#0B2A5B] text-white hover:bg-[#0B2A5B]/90"
                  disabled={!selected}
                  onClick={() =>
                    setIndex((current) =>
                      Math.min(RISK_PROFILE_QUESTIONS.length - 1, current + 1),
                    )
                  }
                >
                  {riskProfileCopy("next", locale)}
                  <ChevronRightIcon />
                </Button>
              )}
            </div>
          </section>
        ) : null}

        {stage === "conclusion" && record && conclusion ? (
          <section className="mt-10 rounded-3xl border border-[#0B2A5B]/10 bg-white/85 p-6 shadow-[0_24px_80px_rgba(11,42,91,0.08)] backdrop-blur-md sm:p-8">
            <Badge
              variant="outline"
              className="border-[#0B2A5B]/15 bg-[#EBF2FF] text-[#0B2A5B]"
            >
              {riskProfileCopy("conclusionEyebrow", locale)}
            </Badge>
            <p className="mt-4 text-sm text-[#0B2A5B]/60">
              {riskProfileCopy("conclusionTitle", locale)}
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#0B2A5B]">
              {conclusion.rating} {conclusion.title}
            </h2>
            <p className="mt-2 text-sm text-[#0B2A5B]/55">
              {riskProfileCopy("scoreLabel", locale)} {record.score} / {record.maxScore}
            </p>
            <p className="mt-4 text-sm leading-7 text-[#0B2A5B]/75">
              {conclusion.summary}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <ConstraintCard
                label={riskProfileCopy("matchedRating", locale)}
                value={`${conclusion.rating} · ${conclusion.title}`}
              />
              <ConstraintCard
                label={riskProfileCopy("cashFloor", locale)}
                value={percentLabel(conclusion.minCashWeight)}
              />
              <ConstraintCard
                label={riskProfileCopy("singleCap", locale)}
                value={percentLabel(conclusion.maxSingleWeight)}
              />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ListCard
                title={riskProfileCopy("suitable", locale)}
                items={conclusion.suitable}
              />
              <ListCard
                title={riskProfileCopy("unsuitable", locale)}
                items={conclusion.unsuitable}
              />
            </div>

            <p className="mt-5 text-xs leading-6 text-[#0B2A5B]/55">
              {riskProfileCopy("constraintHint", locale)} {conclusion.objective}；
              {conclusion.horizon}。
            </p>
            <p className="mt-2 text-xs leading-6 text-[#0B2A5B]/45">
              {riskProfileCopy("disclaimer", locale)}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                className="h-11 bg-[#0B2A5B] px-6 text-white hover:bg-[#0B2A5B]/90"
                onClick={() => router.push("/workspace")}
              >
                {riskProfileCopy("enterWorkspace", locale)}
              </Button>
              <Button
                variant="outline"
                className="h-11 border-[#0B2A5B]/15"
                onClick={retake}
              >
                {riskProfileCopy("retake", locale)}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ConstraintCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#0B2A5B]/10 bg-[#F7FBFF] px-4 py-3">
      <p className="text-xs text-[#0B2A5B]/55">{label}</p>
      <p className="mt-1 text-sm font-medium text-[#0B2A5B]">{value}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#0B2A5B]/10 bg-white px-4 py-4">
      <p className="text-sm font-medium text-[#0B2A5B]">{title}</p>
      <ul className="mt-2 space-y-2 text-xs leading-6 text-[#0B2A5B]/65">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
