"use client";

import { ArrowLeftIcon, BotIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAgents } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";

import { AgentCard } from "./agent-card";

export function CustomAgentGallery() {
  const { t } = useI18n();
  const { agents, isLoading } = useAgents();
  const router = useRouter();
  const labels = t.investmentAgent;

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Button asChild variant="ghost" className="mb-3 -ml-3">
                <Link href="/workspace/agents">
                  <ArrowLeftIcon />
                  {labels.backToPortfolios}
                </Link>
              </Button>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {labels.customTitle}
              </h1>
              <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
                {labels.customDescription}
              </p>
            </div>
            <Button onClick={() => router.push("/workspace/agents/new")}>
              <PlusIcon />
              {t.agents.newAgent}
            </Button>
          </header>

          <section className="pt-6" aria-label={labels.customTitle}>
            {isLoading ? (
              <div className="text-muted-foreground flex h-32 items-center justify-center border-y text-sm">
                {t.common.loading}
              </div>
            ) : agents.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-3 border-y p-6 text-center">
                <BotIcon className="text-muted-foreground size-5" />
                <div>
                  <p className="text-sm font-medium">{t.agents.emptyTitle}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t.agents.emptyDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {agents.map((agent) => (
                  <AgentCard key={agent.name} agent={agent} />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
