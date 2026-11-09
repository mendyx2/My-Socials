import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalUrl, fetchAllFeeds, normalizeTitle, parseFeedXml, stripHtml } from "@/src/lib/news/fetch";
import { dedupe, scoreItem, selectTopNews } from "@/src/lib/news/select";
import { cfg } from "./fixtures/config";

const rss = readFileSync("tests/fixtures/rss.xml", "utf8");
const atom = readFileSync("tests/fixtures/atom.xml", "utf8");
const now = new Date("2026-11-09T08:00:00Z");


describe("url and text helpers", () => {
  it("strips tracking params, www, hash and trailing slash", () => {
    expect(canonicalUrl("https://www.example.com/a/?utm_source=x&id=2#top")).toBe("https://example.com/a?id=2");
  });
  it("drops the publisher suffix from headlines", () => {
    expect(normalizeTitle("Big News Today - Example News")).toBe("big news today");
  });
  it("strips html and decodes entities", () => {
    expect(stripHtml("<p>A &amp; B<script>x()</script></p>")).toBe("A & B");
  });
});

describe("feed parsing", () => {
  it("parses RSS and Atom", async () => {
    const a = await parseFeedXml(rss, cfg.feeds[0], 20);
    const b = await parseFeedXml(atom, cfg.feeds[1], 20);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(2);
    expect(a[0].summary).toBe("Owners say automation saves 5 hours a week.");
    expect(b[1].publishedAt).toBe("2026-11-08T09:00:00.000Z");
  });

  it("reports broken feeds without failing the run", async () => {
    const fakeFetch = (async (url: string) =>
      url.includes("rss") ? new Response(rss) : new Response("nope", { status: 500 })) as typeof fetch;
    const { items, results } = await fetchAllFeeds(cfg.feeds, { maxItems: 20, fetch: fakeFetch });
    expect(items).toHaveLength(4);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(results[1].error).toBe("HTTP 500");
  });
});

describe("selection", () => {
  it("dedupes by canonical url and headline, and skips seen items", async () => {
    const items = [...(await parseFeedXml(rss, cfg.feeds[0], 20)), ...(await parseFeedXml(atom, cfg.feeds[1], 20))];
    const out = dedupe(items);
    expect(out).toHaveLength(5);
    const seen = new Set([out[1].id]);
    expect(dedupe(items, seen).map((i) => i.title)).not.toContain(out[1].title);
  });

  it("matches whole words only ('ai' doesn't match 'said')", () => {
    const s = scoreItem(
      { id: "1", title: "Gossip", url: "u", source: "s", feedPillar: "web", publishedAt: null, summary: "he said" },
      cfg,
      now,
    );
    expect(s.score).toBe(0);
  });

  it("keeps fresh, relevant items and drops old or irrelevant ones", async () => {
    const items = dedupe([...(await parseFeedXml(rss, cfg.feeds[0], 20)), ...(await parseFeedXml(atom, cfg.feeds[1], 20))]);
    const top = selectTopNews(items, cfg, now, 10);
    const titles = top.map((t) => t.title);
    expect(titles).not.toContain("Old news about CSS");
    expect(titles).not.toContain("Celebrity gossip roundup");
    expect(titles).toContain("Flutter 4 released with faster rendering");
    expect(top.find((t) => t.title.startsWith("Flutter"))?.pillars).toContain("flutter");
  });
});
