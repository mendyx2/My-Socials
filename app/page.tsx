import { DraftStore } from "@/src/lib/drafts/store";
import { IdeaStore } from "@/src/lib/ideas/store";
import { IdeasBoard } from "./components/IdeasBoard";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const [ideas, drafts] = await Promise.all([new IdeaStore().list(), new DraftStore().list()]);
  // Most recent draft per idea (drafts are stored newest first).
  const draftsByIdea: Record<string, string> = {};
  for (const d of drafts) draftsByIdea[d.ideaId] ??= d.id;
  return (
    <>
      <h1>Content ideas</h1>
      <p className="lede">
        From today&apos;s industry news, matched to your services, for small businesses, startups and recruiters.
        Rejecting ideas teaches the tool what to avoid.
      </p>
      <IdeasBoard initialIdeas={ideas} draftsByIdea={draftsByIdea} />
    </>
  );
}
