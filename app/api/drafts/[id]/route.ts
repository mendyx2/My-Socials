import { z } from "zod";
import { DRAFT_STATUSES, DraftContentSchema } from "@/src/lib/drafts/schema";
import { NotFoundError, warningsFor } from "@/src/lib/drafts/service";
import { DraftStore } from "@/src/lib/drafts/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const draft = await new DraftStore().get(id);
  if (!draft) return errorResponse(new NotFoundError(`Draft not found: ${id}`));
  return Response.json({ draft, warnings: await warningsFor(draft) });
}

const PatchSchema = z.object({
  content: DraftContentSchema.optional(),
  status: z.enum(DRAFT_STATUSES).optional(),
  inspirationIds: z.array(z.string().max(60)).max(10).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const patch = PatchSchema.parse(await req.json().catch(() => ({})));
    const store = new DraftStore();
    if (!(await store.get(id))) throw new NotFoundError(`Draft not found: ${id}`);
    const draft = await store.update(id, patch);
    return Response.json({ draft, warnings: await warningsFor(draft) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  await new DraftStore().delete(id);
  return Response.json({ ok: true });
}
