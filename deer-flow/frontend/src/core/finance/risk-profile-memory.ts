import {
  createMemoryFact,
  deleteMemoryFact,
  loadMemory,
  updateMemoryFact,
} from "@/core/memory/api";
import type { UserMemory } from "@/core/memory/types";

import {
  buildRiskProfileMemoryContent,
  isRiskProfileMemoryFact,
  type RiskProfileRecord,
} from "./risk-profile";

type MemorySyncApi = {
  loadMemory: typeof loadMemory;
  createMemoryFact: typeof createMemoryFact;
  updateMemoryFact: typeof updateMemoryFact;
  deleteMemoryFact: typeof deleteMemoryFact;
};

const defaultApi: MemorySyncApi = {
  loadMemory,
  createMemoryFact,
  updateMemoryFact,
  deleteMemoryFact,
};

function matchingFacts(memory: UserMemory) {
  return memory.facts.filter((fact) => isRiskProfileMemoryFact(fact.content));
}

export async function syncRiskProfileToMemory(
  record: RiskProfileRecord,
  locale: string | null | undefined,
  api: MemorySyncApi = defaultApi,
): Promise<void> {
  const content = buildRiskProfileMemoryContent(record, locale);
  const memory = await api.loadMemory();
  const [primary, ...duplicates] = matchingFacts(memory);
  for (const extra of duplicates) {
    await api.deleteMemoryFact(extra.id);
  }
  if (primary) {
    if (
      primary.content === content &&
      primary.category === "preference" &&
      primary.confidence === 1
    ) {
      return;
    }
    await api.updateMemoryFact(primary.id, {
      content,
      category: "preference",
      confidence: 1,
    });
    return;
  }
  await api.createMemoryFact({
    content,
    category: "preference",
    confidence: 1,
  });
}

export async function removeRiskProfileFromMemory(
  api: MemorySyncApi = defaultApi,
): Promise<void> {
  const memory = await api.loadMemory();
  for (const fact of matchingFacts(memory)) {
    await api.deleteMemoryFact(fact.id);
  }
}
