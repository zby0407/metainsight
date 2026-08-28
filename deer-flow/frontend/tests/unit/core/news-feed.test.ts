import { expect, test } from "@rstest/core";

import {
  buildNewsContextMessage,
  createNewsArticleFollowUpHref,
  createNewsFollowUpHref,
  newsCoverageLabel,
  newsFeedPath,
  parseNewsContextMessage,
  readNewsFollowUpContext,
  summaryStatusLabel,
  type NewsArticle,
  type NewsEventSummary,
} from "@/core/finance/news";
import {
  DEFAULT_NEWS_PREFERENCES,
  rankPersonalizedEvents,
  toggleSavedEvent,
  toggleTopic,
} from "@/core/finance/news-preferences";

test("news feed paths stay on the source-backed finance aggregation API", () => {
  expect(newsFeedPath("technology", "latest")).toBe(
    "/api/v1/news/feed?channel=technology&sort=latest&limit=24",
  );
  expect(newsFeedPath("sports", "top", "next page", 12)).toBe(
    "/api/v1/news/feed?channel=sports&sort=top&limit=12&cursor=next+page",
  );
});

const event = (id: string, title: string, headlineScore: number) =>
  ({
    id,
    title,
    summary: "",
    headlineScore,
    lastPublishedAt: "2026-07-17T08:00:00Z",
  }) as never;

test("news preferences toggle followed topics and persist complete saved cards", () => {
  const followed = toggleTopic(DEFAULT_NEWS_PREFERENCES, "芯片");
  expect(followed.followedTopics).toEqual(["芯片"]);
  expect(toggleTopic(followed, "芯片").followedTopics).toEqual([]);

  const saved = toggleSavedEvent(followed, event("1", "芯片新进展", 1));
  expect(saved.savedEvents[0]?.title).toBe("芯片新进展");
  expect(toggleSavedEvent(saved, saved.savedEvents[0]!).savedEvents).toEqual(
    [],
  );
});

test("personalized ranking prioritizes followed topics and removes duplicates", () => {
  const ordinary = event("1", "市场动态", 100);
  const followed = event("2", "国产芯片发布", 10);
  expect(
    rankPersonalizedEvents([ordinary, followed, ordinary], ["芯片"]).map(
      (item) => item.id,
    ),
  ).toEqual(["2", "1"]);
});

test("news summary labels distinguish synthesis, fallback, and single source", () => {
  expect(summaryStatusLabel("ready", 3)).toBe("综合报道");
  expect(summaryStatusLabel("fallback", 2)).toBe("综合报道");
  expect(summaryStatusLabel("pending", 2)).toBe("报道更新中");
  expect(summaryStatusLabel("single_source", 1)).toBe("单家报道");
});

const followUpEvent: NewsEventSummary = {
  id: "event-123",
  channel: "technology",
  title: "AI 新进展\0",
  summary: "多家媒体确认了进展。",
  imageUrl: null,
  representativeSource: "示例媒体",
  representativeUrl: "https://news.example.com/event-123",
  sourceCount: 3,
  articleCount: 4,
  firstPublishedAt: "2026-07-17T08:00:00Z",
  lastPublishedAt: "2026-07-17T09:00:00Z",
  headlineScore: 10,
  summaryStatus: "ready",
  summaryGeneratedAt: "2026-07-17T09:05:00Z",
  summarySourceCount: 3,
  contentUpdatedAt: "2026-07-17T09:05:00Z",
};

const followUpArticle: NewsArticle = {
  id: "article-456",
  title: "媒体解读 AI 新进展",
  summary: "该报道补充了时间和参与方。",
  url: "https://news.example.com/article-456",
  imageUrl: null,
  publishedAt: "2026-07-17T08:30:00Z",
  sourceName: "另一家媒体",
  urlStatus: "reachable",
  isReprint: false,
  evidenceLevel: "body",
};

test("news coverage uses one consistent user-facing count", () => {
  expect(newsCoverageLabel(followUpEvent)).toBe("3 家媒体 · 4 篇报道");
  expect(
    newsCoverageLabel({
      ...followUpEvent,
      representativeSource: "示例媒体",
      sourceCount: 1,
      articleCount: 1,
    }),
  ).toBe("示例媒体");
});

test("news follow-up links open a new chat with bounded source context", () => {
  const href = createNewsFollowUpHref(followUpEvent);
  const url = new URL(href, "https://mem.example.com");
  const context = readNewsFollowUpContext(url.searchParams);

  expect(url.pathname).toBe("/workspace/chats/new");
  expect(url.searchParams.get("source")).toBe("news");
  expect(url.searchParams.get("autostart")).toBeNull();
  expect(url.searchParams.get("prompt")).toBeNull();
  expect(context).toMatchObject({
    eventId: "event-123",
    title: "AI 新进展",
    sourceUrl: "https://news.example.com/event-123",
  });
});

test("individual source reports get their own follow-up context", () => {
  const href = createNewsArticleFollowUpHref(followUpEvent, followUpArticle);
  const url = new URL(href, "https://mem.example.com");
  const context = readNewsFollowUpContext(url.searchParams);

  expect(context).toMatchObject({
    kind: "article",
    eventTitle: "AI 新进展",
    sourceName: "另一家媒体",
    sourceUrl: "https://news.example.com/article-456",
  });
});

test("news context messages round-trip while keeping the user's question separate", () => {
  const href = createNewsFollowUpHref(followUpEvent);
  const url = new URL(href, "https://mem.example.com");
  const context = readNewsFollowUpContext(url.searchParams)!;
  const message = buildNewsContextMessage(context, "这会影响哪些行业？");
  const parsed = parseNewsContextMessage(message);

  expect(parsed?.question).toBe("这会影响哪些行业？");
  expect(parsed?.context.title).toBe("AI 新进展");
  expect(message).toContain("<news_context>");
  expect(parseNewsContextMessage("普通用户消息")).toBeNull();
});
