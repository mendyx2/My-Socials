import { randomUUID } from "node:crypto";
import { generateJsonWithFallback, type LlmProvider } from "../llm";
import type { FeedsConfig } from "../news/config";
import type { ScoredNews } from "../news/select";
import { buildIdeasPrompt, SYSTEM_PROMPT } from "./prompt";
import { GeneratedIdeaSchema, type GeneratedIdea, type StoredIdea } from "./schema";

/** Keeps every idea that validates; drops malformed ones instead of failing the whole batch. */
export function parseIdeas(raw: unknown): { ideas: GeneratedIdea[]; dropped: number } {
  const list = (raw as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) throw new Error('AI response has no "ideas" array');
  const ideas: GeneratedIdea[] = [];
  let dropped = 0;
  for (const item of list) {
    const r = GeneratedIdeaSchema.safeParse(item);
    if (r.success) ideas.push(r.data);
    else dropped++;
  }
  return { ideas, dropped };
}

/** Turns AI output into stored ideas: links real sources only and fixes unknown pillars. */
export function toStoredIdeas(
  ideas: GeneratedIdea[],
  news: ScoredNews[],
  cfg: FeedsConfig,
  meta: { now: Date; generatedBy: string },
): StoredIdea[] {
  const byId = new Map(news.map((n) => [n.id, n]));
  const pillarIds = Object.keys(cfg.pillars);
  return ideas.map(({ sourceIds, ...idea }) => {
    // Only keep source ids that were really in the prompt, so links can't be made up.
    const sources = sourceIds
      .map((id) => byId.get(id.replace(/[[\]\s]/g, "")))
      .filter((n): n is ScoredNews => Boolean(n))
      .map((n) => ({ title: n.title, url: n.url, source: n.source }));
    const pillar = pillarIds.includes(idea.pillar)
      ? idea.pillar
      : (sources.length ? byId.get(sourceIds[0].replace(/[[\]\s]/g, ""))?.feedPillar : undefined) ?? pillarIds[0];
    return {
      ...idea,
      pillar,
      platforms: [...new Set(idea.platforms)],
      id: randomUUID(),
      createdAt: meta.now.toISOString(),
      runDate: meta.now.toISOString().slice(0, 10),
      status: "new" as const,
      sources,
      generatedBy: meta.generatedBy,
    };
  });
}

/**
 * Asks each provider in turn. A provider that errors, or returns JSON we can't use,
 * hands over to the next one.
 */
export async function generateIdeas(args: {
  providers: LlmProvider[];
  kbText: string;
  cfg: FeedsConfig;
  news: ScoredNews[];
  count: number;
  recent: Pick<StoredIdea, "title" | "status">[];
  now: Date;
}): Promise<{ ideas: StoredIdea[]; dropped: number; generatedBy: string }> {
  const { providers, count, now } = args;
  const { value, generatedBy } = await generateJsonWithFallback(
    providers,
    { system: SYSTEM_PROMPT, prompt: buildIdeasPrompt(args), temperature: 0.8 },
    (raw) => {
      const parsed = parseIdeas(raw);
      if (parsed.ideas.length === 0) throw new Error(`no valid ideas (${parsed.dropped} malformed)`);
      return parsed;
    },
  );
  return {
    ideas: toStoredIdeas(value.ideas.slice(0, count), args.news, args.cfg, { now, generatedBy }),
    dropped: value.dropped,
    generatedBy,
  };
}
