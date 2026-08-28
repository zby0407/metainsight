"use client";

import { type PortfolioDashboardItem } from "@/core/finance";

import { HoldingsCard } from "../holdings-card";
import { NetWorthCard } from "../net-worth-card";

export function OverviewView({ item }: { item: PortfolioDashboardItem }) {
  return (
    <div className="w-full space-y-6">
      <NetWorthCard item={item} />
      <HoldingsCard item={item} />
    </div>
  );
}
