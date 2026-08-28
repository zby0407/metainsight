const LEGACY_ACCOUNT_STORAGE = [
  {
    legacyKey: "deerflow.news.preferences.v1",
    suffix: "news.preferences.v1",
  },
  {
    legacyKey: "zhiheng.investment-workspace.setup.v1",
    suffix: "portfolio.setup.v1",
  },
] as const;

type StorageReaderWriter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function accountStorageKey(userId: string, suffix: string): string {
  const normalizedUserId = userId.trim();
  const normalizedSuffix = suffix.trim();
  if (!normalizedUserId || !normalizedSuffix) {
    throw new Error("A user id and storage suffix are required");
  }
  return `deepmem.user.${encodeURIComponent(normalizedUserId)}.${normalizedSuffix}`;
}

export function clearLegacyAccountStorage(
  storage: Pick<Storage, "removeItem">,
): void {
  for (const item of LEGACY_ACCOUNT_STORAGE) {
    storage.removeItem(item.legacyKey);
  }
}

export function migrateLegacyAccountStorage(
  userId: string,
  storage: StorageReaderWriter,
): void {
  for (const item of LEGACY_ACCOUNT_STORAGE) {
    const legacyValue = storage.getItem(item.legacyKey);
    if (legacyValue === null) continue;
    const scopedKey = accountStorageKey(userId, item.suffix);
    if (storage.getItem(scopedKey) === null) {
      storage.setItem(scopedKey, legacyValue);
    }
    storage.removeItem(item.legacyKey);
  }
}
