import { BoardPatchSchema, MediaStore } from "@/src/lib/media/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    const board = await new MediaStore().updateBoard((await ctx.params).id, BoardPatchSchema.parse(await req.json().catch(() => ({}))));
    return Response.json({ board });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  await new MediaStore().removeBoard((await ctx.params).id);
  return Response.json({ ok: true });
}
