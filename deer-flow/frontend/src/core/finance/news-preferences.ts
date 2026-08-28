import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { accountStorageKey } from "@/core/auth/account-storage";

import type { NewsEventSummary } from "./news";

export const NEWS_TOPICS = [
  "人工智能",
  "芯片",
  "机器人",
  "经济",
  "足球",
  "篮球",
] as const;

export type NewsTopic = (typeof NEWS_TOPICS)[number];

export interface NewsPreferences {
  followedTopics: NewsTopic[];
  savedEvents: NewsEventSummary[];
  notificationsEnabled: boolean;
  lastNotifiedAt: string | null;
}

export const DEFAULT_NEWS_PREFERENCES: NewsPreferences = {
  followedTopics: [],
  savedEvents: [],
  notificationsEnabled: false,
  lastNotifiedAt: null,
};

const STORAGE_SUFFIX = "news.preferences.v1";
const PREFERENCES_API = "/api/v1/news-preferences";

interface RemoteNewsPreferences {
  configured: boolean;
  followedTopics: NewsTopic[];
  savedEventIds: string[];
  notificationsEnabled: boolean;
  lastNotifiedAt: string | null;
}

export async function readRemoteNewsPreferences(): Promise<RemoteNewsPreferences> {
  const response = await fetchWithAuth(PREFERENCES_API, { cache: "no-store" });
  if (!response.ok) throw new Error(`新闻偏好加载失败：${response.status}`);
  return (await response.json()) as RemoteNewsPreferences;
}

export async function writeRemoteNewsPreferences(
  preferences: NewsPreferences,
): Promise<RemoteNewsPreferences> {
  const response = await fetchWithAuth(PREFERENCES_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      followedTopics: preferences.followedTopics,
      savedEventIds: preferences.savedEvents.map((event) => event.id),
      notificationsEnabled: preferences.notificationsEnabled,
    }),
  });
  if (!response.ok) throw new Error(`新闻偏好保存失败：${response.status}`);
  return (await response.json()) as RemoteNewsPreferences;
}

export function readNewsPreferences(
  userId: string,
  storage?: Storage,
): NewsPreferences {
  if (!storage || !userId) return DEFAULT_NEWS_PREFERENCES;
  try {
    const parsed = JSON.parse(
      storage.getItem(accountStorageKey(userId, STORAGE_SUFFIX)) ?? "{}",
    ) as Partial<NewsPreferences>;
    return {
      followedTopics: Array.isArray(parsed.followedTopics)
        ? parsed.followedTopics.filter((topic) => NEWS_TOPICS.includes(topic))
        : [],
      savedEvents: Array.isArray(parsed.savedEvents)
        ? parsed.savedEvents.filter(isStoredEvent).slice(0, 100)
        : [],
      notificationsEnabled: parsed.notificationsEnabled === true,
      lastNotifiedAt:
        typeof parsed.lastNotifiedAt === "string"
          ? parsed.lastNotifiedAt
          : null,
    };
  } catch {
    return DEFAULT_NEWS_PREFERENCES;
  }
}

export function writeNewsPreferences(
  userId: string,
  preferences: NewsPreferences,
  storage?: Storage,
): void {
  if (!storage || !userId) return;
  storage.setItem(
    accountStorageKey(userId, STORAGE_SUFFIX),
    JSON.stringify(preferences),
  );
}

export function toggleTopic(
  preferences: NewsPreferences,
  topic: NewsTopic,
): NewsPreferences {
  const followedTopics = preferences.followedTopics.includes(topic)
    ? preferences.followedTopics.filter((value) => value !== topic)
    : [...preferences.followedTopics, topic];
  return { ...preferences, followedTopics };
}

export function toggleSavedEvent(
  preferences: NewsPreferences,
  event: NewsEventSummary,
): NewsPreferences {
  const exists = preferences.savedEvents.some((item) => item.id === event.id);
  return {
    ...preferences,
    savedEvents: exists
      ? preferences.savedEvents.filter((item) => item.id !== event.id)
      : [event, ...preferences.savedEvents].slice(0, 100),
  };
}

export function matchesFollowedTopic(
  event: NewsEventSummary,
  topics: NewsTopic[],
): boolean {
  if (topics.length === 0) return false;
  const text = `${event.title} ${event.summary}`.toLocaleLowerCase("zh-CN");
  return topics.some((topic) =>
    text.includes(topic.toLocaleLowerCase("zh-CN")),
  );
}

export function rankPersonalizedEvents(
  events: NewsEventSummary[],
  topics: NewsTopic[],
): NewsEventSummary[] {
  const unique = new Map(events.map((event) => [event.id, event]));
  return [...unique.values()].sort((left, right) => {
    const topicDelta =
      Number(matchesFollowedTopic(right, topics)) -
      Number(matchesFollowedTopic(left, topics));
    if (topicDelta !== 0) return topicDelta;
    if (right.headlineScore !== left.headlineScore)
      return right.headlineScore - left.headlineScore;
    return Date.parse(right.lastPublishedAt) - Date.parse(left.lastPublishedAt);
  });
}

function isStoredEvent(value: unknown): value is NewsEventSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<NewsEventSummary>;
  return typeof item.id === "string" && typeof item.title === "string";
}
