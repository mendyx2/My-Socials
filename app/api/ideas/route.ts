import { IdeaStore } from "@/src/lib/ideas/store";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  return Response.json({ ideas: await new IdeaStore().list() });
}
