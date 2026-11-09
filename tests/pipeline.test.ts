import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LlmProvider, LlmRequest } from "@/src/lib/llm";
import { parseIdeas, toStoredIdeas } from "@/src/lib/ideas/generate";
import { IdeaStore } from "@/src/lib/ideas/store";
import { runIdeasPipeline } from "@/src/lib/pipeline";
import { cfg } from "./fixtures/config";
import { FileStorage } from "@/src/lib/storage";

const rss = readFileSync("tests/fixtures/rss.xml", "utf8");
const atom = readFileSync("tests/fixtures/atom.xml", "utf8");
const fakeFetch = (async (url: string) => new Response(url.includes("rss") ? rss : atom)) as typeof fetch;
const now = new Date("2026-11-09T08:00:00Z");

function idea(over: Record<string, unknown> = {}) {
  return {
    title: "AI automation for small shops",
    pillar: "ai-automation",
    format: "Carousel",
    platforms: ["LinkedIn", "instagram", "linkedin"],
    audience: "clients",
    hook: "You're losing 5 hours a week to admin.",
    angle: "Start with one workflow.",
    outline: ["Hook", "Step 1", "CTA"],
    whyMe: "I build automations.",
    cta: "Book a call",
    sourceIds: [],
    ...over,
  };
}

/** Fake AI that cites the first real news id it sees in the prompt, plus a made-up one. */
function fakeProvider(name = "fake", capture?: (r: LlmRequest) => void): LlmProvider {
  return {
    name,
    model: "test",
    async generate(req) {
      capture?.(req);
      const ids = [...req.prompt.matchAll(/^\[([0-9a-f]{12})\]/gm)].map((m) => m[1]);
      return {
        provider: name,
        model: "test",
        text: JSON.stringify({
          ideas: [
            idea({ sourceIds: [ids[0], "deadbeef0000"] }),
            idea({ title: "Flutter for startups", pillar: "nonsense", format: "video", sourceIds: [`[${ids[1]}]`] }),
            { title: "broken" },
          ],
        }),
      };
    },
  };
}

function tempWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), "my-socials-"));
  mkdirSync(path.join(dir, "profile"));
  writeFileSync(path.join(dir, "profile/about.md"), "# About\nWendy, OI.Dev\n<!-- secret comment -->");
  return dir;
}

describe("parseIdeas / toStoredIdeas", () => {
  it("normalizes case, keeps valid ideas and drops malformed ones", () => {
    const { ideas, dropped } = parseIdeas({ ideas: [idea(), { title: "x" }] });
    expect(ideas).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(ideas[0].format).toBe("carousel");
  });

  it("only links sources that were really given to the AI, and fixes unknown pillars", () => {
    const news = [{ id: "aaaaaaaaaaaa", title: "Real", url: "https://real", source: "S", feedPillar: "flutter", publishedAt: null, summary: "", score: 1, pillars: ["flutter"] }];
    const { ideas } = parseIdeas({ ideas: [idea({ pillar: "made-up", sourceIds: ["aaaaaaaaaaaa", "ffffffffffff"] })] });
    const [stored] = toStoredIdeas(ideas, news, cfg, { now, generatedBy: "x" });
    expect(stored.sources).toEqual([{ title: "Real", url: "https://real", source: "S" }]);
    expect(stored.pillar).toBe("flutter");
    expect(stored.platforms).toEqual(["linkedin", "instagram"]);
    expect(stored.status).toBe("new");
  });
});

describe("runIdeasPipeline (end to end, no network)", () => {
  it("fetches, selects, generates, stores and writes a digest", async () => {
    const dir = tempWorkspace();
    let prompt = "";
    const storage = new FileStorage(dir);
    const store = new IdeaStore(storage);
    const r = await runIdeasPipeline({
      now,
      count: 5,
      cfg,
      fetch: fakeFetch,
      providers: [fakeProvider("fake", (req) => (prompt = req.prompt))],
      store,
      storage,
    });

    expect(r.ideas).toHaveLength(2);
    expect(r.dropped).toBe(1);
    expect(r.generatedBy).toBe("fake/test");
    expect(r.ideas[0].sources).toHaveLength(1); // made-up id removed
    expect(r.ideas[1].pillar).toBe("ai-automation"); // unknown pillar fixed
    expect(prompt).toContain("Wendy, OI.Dev");
    expect(prompt).not.toContain("secret comment");
    expect(prompt).not.toContain("Celebrity gossip");

    expect(await store.list()).toHaveLength(2);
    expect((await store.seenNewsIds()).size).toBe(2);
    expect(r.digestPath).toBe("digests/2026-11-09.md");
    const digest = readFileSync(path.join(dir, r.digestPath!), "utf8");
    expect(digest).toContain("# Content ideas: 2026-11-09");
    expect(digest).toContain("🖼️ Carousel");

    // Second run the same day: previous ideas are passed as "don't repeat", digest is appended.
    await runIdeasPipeline({ now, count: 5, cfg, fetch: fakeFetch, providers: [fakeProvider("fake", (req) => (prompt = req.prompt))], store, storage });
    expect(prompt).toContain("- AI automation for small shops");
    expect(readFileSync(path.join(dir, r.digestPath!), "utf8")).toContain("# More ideas: 2026-11-09");
    expect(await store.list()).toHaveLength(4);
  });

  it("falls back when the first provider returns unusable output", async () => {
    const dir = tempWorkspace();
    const junk: LlmProvider = { name: "junk", model: "x", generate: async () => ({ text: "sorry, I can't", provider: "junk", model: "x" }) };
    const r = await runIdeasPipeline({ now, cfg, fetch: fakeFetch, providers: [junk, fakeProvider("backup")], storage: new FileStorage(dir), writeDigest: false });
    expect(r.generatedBy).toBe("backup/test");
    expect(r.digestPath).toBeNull();
  });
});

describe("IdeaStore", () => {
  it("updates status and rejects bad input", async () => {
    const dir = tempWorkspace();
    const store = new IdeaStore(new FileStorage(dir));
    const { ideas } = parseIdeas({ ideas: [idea()] });
    const [s] = toStoredIdeas(ideas, [], cfg, { now, generatedBy: "x" });
    await store.add([s]);
    expect((await store.update(s.id, { status: "saved" })).status).toBe("saved");
    await expect(store.update(s.id, { status: "bogus" as never })).rejects.toThrow("Invalid status");
    await expect(store.update("nope", { status: "used" })).rejects.toThrow("Idea not found");
  });
});
