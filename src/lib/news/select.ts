import type { FeedsConfig } from "./config";
import { canonicalUrl, normalizeTitle, type NewsItem } from "./fetch";

export interface ScoredNews extends NewsItem {
  score: number;
  pillars: string[];
}

/** Removes repeats (same canonical URL or same headline) and anything already used. */
export function dedupe(items: NewsItem[], seenIds: Set<string> = new Set()): NewsItem[] {
  const urls = new Set<string>();
  const titles = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const u = canonicalUrl(it.url);
    const t = normalizeTitle(it.title);
    if (seenIds.has(it.id) || urls.has(u) || (t && titles.has(t))) continue;
    urls.add(u);
    if (t) titles.add(t);
    out.push(it);
  }
  return out;
}

export function isFresh(item: NewsItem, now: Date, maxAgeHours: number): boolean {
  // Items without a date are kept; the model can judge them.
  if (!item.publishedAt) return true;
  const ageH = (now.getTime() - new Date(item.publishedAt).getTime()) / 36e5;
  return ageH <= maxAgeHours && ageH >= -24;
}

function countMatches(text: string, keyword: string): number {
  const k = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Word boundaries so "ai" doesn't match "said".
  const re = new RegExp(`(^|[^a-z0-9])${k}(?=$|[^a-z0-9])`, "g");
  return text.match(re)?.length ?? 0;
}

/** Cheap keyword relevance score so only the best ~25 items go to the AI (saves free-tier quota). */
export function scoreItem(item: NewsItem, cfg: FeedsConfig, now: Date): ScoredNews {
  const titleText = item.title.toLowerCase();
  const bodyText = item.summary.toLowerCase();
  let score = 0;
  const pillars: string[] = [];
  for (const [id, pillar] of Object.entries(cfg.pillars)) {
    let p = 0;
    for (const kw of pillar.keywords) {
      p += countMatches(titleText, kw) * 3 + Math.min(countMatches(bodyText, kw), 3);
    }
    if (p > 0) pillars.push(id);
    score += p;
  }
  if (!pillars.includes(item.feedPillar)) pillars.push(item.feedPillar);
  // Small bonus for the most recent items, but only if they're relevant at all.
  if (score > 0 && item.publishedAt) {
    const ageH = (now.getTime() - new Date(item.publishedAt).getTime()) / 36e5;
    if (ageH < 24) score += 2;
  }
  return { ...item, score, pillars };
}

/**
 * Picks the top items while keeping a mix of pillars, so one busy feed
 * (e.g. Hacker News) can't crowd out Flutter or web news.
 */
export function selectTopNews(items: NewsItem[], cfg: FeedsConfig, now: Date, limit = 25): ScoredNews[] {
  const scored = items
    .filter((it) => isFresh(it, now, cfg.maxAgeHours))
    .map((it) => scoreItem(it, cfg, now))
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score);

  const perPillarCap = Math.max(3, Math.ceil(limit / Math.max(1, Object.keys(cfg.pillars).length)) + 2);
  const counts = new Map<string, number>();
  const picked: ScoredNews[] = [];
  const leftovers: ScoredNews[] = [];
  for (const it of scored) {
    const c = counts.get(it.feedPillar) ?? 0;
    if (c < perPillarCap) {
      picked.push(it);
      counts.set(it.feedPillar, c + 1);
    } else leftovers.push(it);
    if (picked.length >= limit) break;
  }
  for (const it of leftovers) {
    if (picked.length >= limit) break;
    picked.push(it);
  }
  return picked;
}
