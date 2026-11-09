import { ItemPatchSchema, MediaStore } from "@/src/lib/media/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const item = await new MediaStore().update((await ctx.params).id, ItemPatchSchema.parse(await req.json().catch(() => ({}))));
    return Response.json({ item });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  await new MediaStore().remove((await ctx.params).id);
  return Response.json({ ok: true });
}
