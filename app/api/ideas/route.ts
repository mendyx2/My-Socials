import { IdeaStore } from "@/src/lib/ideas/store";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  return Response.json({ ideas: await new IdeaStore().list() });
}
