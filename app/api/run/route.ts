import { runIdeasPipeline } from "@/src/lib/pipeline";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const r = await runIdeasPipeline();
    return Response.json({
      ideas: r.ideas,
      generatedBy: r.generatedBy,
      newsRead: r.newsRead,
      newsUsed: r.newsUsed,
      failedFeeds: r.feeds.filter((f) => !f.ok).map((f) => `${f.feed.name}: ${f.error}`),
      skippedProviders: r.skippedProviders,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
