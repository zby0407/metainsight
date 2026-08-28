"use client";

import { PortfolioDashboard } from "./portfolio-dashboard";

export function AgentGallery() {
  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <PortfolioDashboard />
        </main>
      </div>
    </div>
  );
}
