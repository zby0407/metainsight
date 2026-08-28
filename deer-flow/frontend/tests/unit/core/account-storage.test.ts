import { describe, expect, test } from "@rstest/core";

import {
  accountStorageKey,
  clearLegacyAccountStorage,
  migrateLegacyAccountStorage,
} from "@/core/auth/account-storage";

describe("account-scoped browser storage", () => {
  test("uses a stable user id namespace", () => {
    expect(accountStorageKey("user-a", "portfolio.setup.v1")).toBe(
      "deepmem.user.user-a.portfolio.setup.v1",
    );
    expect(accountStorageKey("user-b", "portfolio.setup.v1")).not.toBe(
      accountStorageKey("user-a", "portfolio.setup.v1"),
    );
  });

  test("removes only known unscoped legacy keys", () => {
    const removed: string[] = [];
    const storage = {
      removeItem(key: string) {
        removed.push(key);
      },
    } as Pick<Storage, "removeItem">;

    clearLegacyAccountStorage(storage);

    expect(removed).toEqual([
      "deerflow.news.preferences.v1",
      "zhiheng.investment-workspace.setup.v1",
    ]);
  });

  test("moves a legacy value into the current account namespace once", () => {
    const values = new Map<string, string>([
      ["deerflow.news.preferences.v1", '{"followedTopics":["芯片"]}'],
    ]);
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    } as Pick<Storage, "getItem" | "setItem" | "removeItem">;

    migrateLegacyAccountStorage("user-a", storage);

    expect(values.get("deepmem.user.user-a.news.preferences.v1")).toBe(
      '{"followedTopics":["芯片"]}',
    );
    expect(values.has("deerflow.news.preferences.v1")).toBe(false);
  });
});
