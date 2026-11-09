import { z } from "zod";
import { STATUSES } from "@/src/lib/ideas/schema";
import { IdeaStore } from "@/src/lib/ideas/store";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

const PatchSchema = z.object({ status: z.enum(STATUSES).optional(), notes: z.string().max(5000).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    return Response.json({ idea: await new IdeaStore().update(id, parsed.data) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
