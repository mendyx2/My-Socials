import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";
import { existingVisuals, renderProfileVersionVisuals } from "@/src/lib/visuals/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  return Response.json({ files: await existingVisuals("profile", (await ctx.params).id) });
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    return Response.json({ files: await renderProfileVersionVisuals((await ctx.params).id) });
  } catch (err) {
    return errorResponse(err);
  }
}
