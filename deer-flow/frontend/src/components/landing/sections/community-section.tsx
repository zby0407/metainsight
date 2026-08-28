"use client";

import Link from "next/link";

import { AuroraText } from "@/components/ui/aurora-text";
import { Button } from "@/components/ui/button";

import { Section } from "../section";

export function CommunitySection() {
  return (
    <Section
      title={
        <AuroraText colors={["#60A5FA", "#A5FA60", "#A560FA"]}>
          Start with MetaInsight
        </AuroraText>
      }
      subtitle="Bring news, market signals, research notes, and portfolio decisions into one continuous workspace."
    >
      <div className="flex justify-center">
        <Button className="text-xl" size="lg" asChild>
          <Link href="/workspace">Open MetaInsight</Link>
        </Button>
      </div>
    </Section>
  );
}
