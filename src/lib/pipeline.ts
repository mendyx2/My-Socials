import { promises as fs } from "node:fs";
import path from "node:path";
import { kbToPrompt, loadKnowledgeBase } from "./kb";
import { providersFromEnv, type FetchLike, type LlmProvider } from "./llm";
import { loadFeedsConfig, type FeedsConfig } from "./news/config";
import { fetchAllFeeds, type FeedResult } from "./news/fetch";
import { dedupe, selectTopNews } from "./news/select";
import { renderDigest } from "./ideas/digest";
import { generateIdeas } from "./ideas/generate";
import type { StoredIdea } from "./ideas/schema";
import { IdeaStore } from "./ideas/store";
import { DIGESTS_DIR, PROFILE_DIR } from "./paths";

export interface RunResult {
  ideas: StoredIdea[];
  feeds: FeedResult[];
  newsRead: number;
  newsUsed: number;
  dropped: number;
  generatedBy: string;
  digestPath: string | null;
  skippedProviders: string[];
}

export interface RunOptions {
  now?: Date;
  count?: number;
  providers?: LlmProvider[];
  fetch?: FetchLike;
  cfg?: FeedsConfig;
  store?: IdeaStore;
  profileDir?: string;
  digestsDir?: string | null; // null = don't write a digest file
}

/** The daily job: news → filter → AI ideas → save + Markdown digest. */
export async function runIdeasPipeline(opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const count = opts.count ?? Number(process.env.IDEAS_PER_DAY || 5);
  const cfg = opts.cfg ?? (await loadFeedsConfig());
  const store = opts.store ?? new IdeaStore();
  const fromEnv = opts.providers ? { providers: opts.providers, skipped: [] } : providersFromEnv();

  const [kb, seen, existing] = await Promise.all([
    loadKnowledgeBase(opts.profileDir ?? PROFILE_DIR),
    store.seenNewsIds(),
    store.list(),
  ]);

  const { items, results } = await fetchAllFeeds(cfg.feeds, { maxItems: cfg.maxItemsPerFeed, fetch: opts.fetch });
  const news = selectTopNews(dedupe(items, seen), cfg, now, 25);

  const { ideas, dropped, generatedBy } = await generateIdeas({
    providers: fromEnv.providers,
    kbText: kbToPrompt(kb),
    cfg,
    news,
    count,
    recent: existing.slice(0, 40).map(({ title, status }) => ({ title, status })),
    now,
  });

  await store.add(ideas);
  await store.markNewsSeen(ideas.flatMap((i) => i.sources.map((s) => news.find((n) => n.url === s.url)?.id ?? "")).filter(Boolean));

  let digestPath: string | null = null;
  const digestsDir = opts.digestsDir === undefined ? DIGESTS_DIR : opts.digestsDir;
  if (digestsDir) {
    await fs.mkdir(digestsDir, { recursive: true });
    const date = now.toISOString().slice(0, 10);
    digestPath = path.join(digestsDir, `${date}.md`);
    // A second run on the same day is appended, not overwritten.
    const body = renderDigest(date, ideas, results);
    const prior = await fs.readFile(digestPath, "utf8").catch(() => "");
    await fs.writeFile(digestPath, prior ? `${prior}\n${body.replace(/^# .*\n/, `# More ideas: ${date}\n`)}` : body, "utf8");
  }

  return {
    ideas,
    feeds: results,
    newsRead: items.length,
    newsUsed: news.length,
    dropped,
    generatedBy,
    digestPath,
    skippedProviders: fromEnv.skipped,
  };
}
