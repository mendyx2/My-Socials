import Parser from "rss-parser";
import { createHash } from "node:crypto";
import type { Feed } from "./config";
import type { FetchLike } from "../llm/types";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  feedPillar: string;
  publishedAt: string | null;
  summary: string;
}

export interface FeedResult {
  feed: Feed;
  ok: boolean;
  count: number;
  error?: string;
}

const parser = new Parser();
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|source$)/i;

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.replace(/^www\./, "");
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+[-–|]\s+[^-–|]+$/, "") // drop " - Publisher" suffix (Google News)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function newsId(url: string): string {
  return createHash("sha1").update(canonicalUrl(url)).digest("hex").slice(0, 12);
}

export async function parseFeedXml(xml: string, feed: Feed, maxItems: number): Promise<NewsItem[]> {
  const parsed = await parser.parseString(xml);
  return (parsed.items ?? [])
    .filter((it) => it.link && it.title)
    .slice(0, maxItems)
    .map((it) => {
      const date = it.isoDate ?? it.pubDate;
      const parsedDate = date ? new Date(date) : null;
      const summary = stripHtml(it.contentSnippet ?? it.content ?? it.summary ?? "").slice(0, 500);
      return {
        id: newsId(it.link!),
        title: stripHtml(it.title!),
        url: it.link!,
        source: feed.name,
        feedPillar: feed.pillar,
        publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
        summary,
      };
    });
}

export async function fetchFeed(
  feed: Feed,
  opts: { maxItems: number; fetch?: FetchLike; timeoutMs?: number },
): Promise<NewsItem[]> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(feed.url, {
    headers: { "user-agent": "my-socials-news-reader/0.1 (+personal RSS reader)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeedXml(await res.text(), feed, opts.maxItems);
}

/** Fetches all feeds in parallel. A broken feed is reported, never fatal. */
export async function fetchAllFeeds(
  feeds: Feed[],
  opts: { maxItems: number; fetch?: FetchLike; timeoutMs?: number },
): Promise<{ items: NewsItem[]; results: FeedResult[] }> {
  const settled = await Promise.allSettled(feeds.map((f) => fetchFeed(f, opts)));
  const items: NewsItem[] = [];
  const results: FeedResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      items.push(...s.value);
      return { feed: feeds[i], ok: true, count: s.value.length };
    }
    return { feed: feeds[i], ok: false, count: 0, error: (s.reason as Error)?.message ?? String(s.reason) };
  });
  return { items, results };
}
