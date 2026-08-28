import { describe, expect, test } from "@rstest/core";

import {
  RISK_PROFILE_MEMORY_MARKER,
  RISK_PROFILE_QUESTIONS,
  buildRiskProfileMemoryContent,
  buildRiskProfileRecord,
  concludeRiskProfile,
  isRiskProfileMemoryFact,
  parseRiskProfileRecord,
  profileIdFromScore,
  riskProfileFramework,
  riskProfileScoreRange,
  scoreRiskProfile,
} from "@/core/finance/risk-profile";
import { syncRiskProfileToMemory } from "@/core/finance/risk-profile-memory";

function answersWithScore(score: number): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of RISK_PROFILE_QUESTIONS) {
    const option = question.options.find((item) => item.score === score);
    if (!option) {
      throw new Error(`No option with score ${score} on ${question.id}`);
    }
    answers[question.id] = option.id;
  }
  return answers;
}

describe("risk preference questionnaire", () => {
  test("every question has a cited basis and five scored options", () => {
    expect(RISK_PROFILE_QUESTIONS).toHaveLength(8);
    for (const question of RISK_PROFILE_QUESTIONS) {
      expect(question.basis["zh-CN"].length).toBeGreaterThan(12);
      expect(question.basis["en-US"].length).toBeGreaterThan(12);
      expect(question.options).toHaveLength(5);
      expect(question.options.map((option) => option.score)).toEqual([1, 2, 3, 4, 5]);
    }
    expect(riskProfileFramework("zh-CN").join("")).toContain("适当性管理办法");
    expect(riskProfileFramework("zh-CN").join("")).toContain("Grable");
  });

  test("maps total scores onto C1–C5 investor types", () => {
    const range = riskProfileScoreRange();
    expect(range).toEqual({ minScore: 8, maxScore: 40 });
    expect(scoreRiskProfile(answersWithScore(1)).score).toBe(8);
    expect(scoreRiskProfile(answersWithScore(5)).score).toBe(40);
    expect(profileIdFromScore(8)).toBe("conservative");
    expect(profileIdFromScore(14)).toBe("conservative");
    expect(profileIdFromScore(15)).toBe("steady");
    expect(profileIdFromScore(22)).toBe("balanced");
    expect(profileIdFromScore(29)).toBe("growth");
    expect(profileIdFromScore(35)).toBe("aggressive");
  });

  test("conclusion includes constraints and a written judgment", () => {
    const record = buildRiskProfileRecord(answersWithScore(3));
    expect(record.profileId).toBe("balanced");
    const conclusion = concludeRiskProfile(record.profileId, "zh-CN");
    expect(conclusion.rating).toBe("C3");
    expect(conclusion.title).toBe("平衡型");
    expect(conclusion.summary).toContain("平衡");
    expect(conclusion.minCashWeight).toBe("0.15");
    expect(conclusion.maxSingleWeight).toBe("0.18");
    expect(conclusion.changeBasis[0]).toContain("C3");
    expect(conclusion.suitable.length).toBeGreaterThan(0);
    expect(conclusion.unsuitable.length).toBeGreaterThan(0);
  });

  test("rejects incomplete answers and incomplete stored records", () => {
    expect(() => scoreRiskProfile({ age: "age-18" })).toThrow(/experience/);
    expect(parseRiskProfileRecord({ version: 1, profileId: "balanced" })).toBeNull();
    const valid = buildRiskProfileRecord(answersWithScore(4));
    expect(parseRiskProfileRecord(valid)?.profileId).toBe("growth");
  });

  test("writes strategy constraints from the conclusion", () => {
    const record = buildRiskProfileRecord(answersWithScore(1));
    const conclusion = concludeRiskProfile(record.profileId, "zh-CN");
    expect(conclusion.rating).toBe("C1");
    expect(conclusion.changeBasis).toEqual(
      expect.arrayContaining([
        expect.stringContaining("现金底仓"),
        expect.stringContaining("单一股票"),
      ]),
    );
  });

  test("writes a memory fact that later rebalancing must honor", () => {
    const record = buildRiskProfileRecord(answersWithScore(3));
    const content = buildRiskProfileMemoryContent(record, "zh-CN");
    expect(isRiskProfileMemoryFact(content)).toBe(true);
    expect(content).toContain(RISK_PROFILE_MEMORY_MARKER);
    expect(content).toContain("C3");
    expect(content).toContain("现金底仓");
    expect(content).toContain("改仓硬约束");
    expect(content).toContain("15%");
    expect(content).toContain("18%");
  });
});

describe("risk profile memory sync", () => {
  test("creates a preference fact when memory has none", async () => {
    const record = buildRiskProfileRecord(answersWithScore(2));
    const created: unknown[] = [];
    await syncRiskProfileToMemory(record, "zh-CN", {
      loadMemory: async () =>
        ({
          version: "1.0",
          lastUpdated: "",
          user: {
            workContext: { summary: "", updatedAt: "" },
            personalContext: { summary: "", updatedAt: "" },
            topOfMind: { summary: "", updatedAt: "" },
          },
          history: {
            recentMonths: { summary: "", updatedAt: "" },
            earlierContext: { summary: "", updatedAt: "" },
            longTermBackground: { summary: "", updatedAt: "" },
          },
          facts: [],
        }) as never,
      createMemoryFact: async (input) => {
        created.push(input);
        return { facts: [] } as never;
      },
      updateMemoryFact: async () => {
        throw new Error("should not update");
      },
      deleteMemoryFact: async () => {
        throw new Error("should not delete");
      },
    });
    expect(created).toEqual([
      expect.objectContaining({
        category: "preference",
        confidence: 1,
        content: expect.stringContaining(RISK_PROFILE_MEMORY_MARKER),
      }),
    ]);
  });

  test("updates the existing tagged fact instead of duplicating it", async () => {
    const record = buildRiskProfileRecord(answersWithScore(5));
    const updates: unknown[] = [];
    await syncRiskProfileToMemory(record, "zh-CN", {
      loadMemory: async () =>
        ({
          version: "1.0",
          lastUpdated: "",
          user: {
            workContext: { summary: "", updatedAt: "" },
            personalContext: { summary: "", updatedAt: "" },
            topOfMind: { summary: "", updatedAt: "" },
          },
          history: {
            recentMonths: { summary: "", updatedAt: "" },
            earlierContext: { summary: "", updatedAt: "" },
            longTermBackground: { summary: "", updatedAt: "" },
          },
          facts: [
            {
              id: "fact_old",
              content: `${RISK_PROFILE_MEMORY_MARKER} stale`,
              category: "context",
              confidence: 0.4,
              createdAt: "",
              source: "manual",
            },
          ],
        }) as never,
      createMemoryFact: async () => {
        throw new Error("should not create");
      },
      updateMemoryFact: async (factId, input) => {
        updates.push({ factId, input });
        return { facts: [] } as never;
      },
      deleteMemoryFact: async () => {
        throw new Error("should not delete");
      },
    });
    expect(updates).toEqual([
      {
        factId: "fact_old",
        input: expect.objectContaining({
          category: "preference",
          confidence: 1,
          content: expect.stringContaining("C5"),
        }),
      },
    ]);
  });
});
