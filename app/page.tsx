import { IdeaStore } from "@/src/lib/ideas/store";
import { IdeasBoard } from "./components/IdeasBoard";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const ideas = await new IdeaStore().list();
  return (
    <>
      <h1>Content ideas</h1>
      <p className="lede">
        From today&apos;s industry news, matched to your services, for small businesses, startups and recruiters.
        Rejecting ideas teaches the tool what to avoid.
      </p>
      <IdeasBoard initialIdeas={ideas} />
    </>
  );
}
