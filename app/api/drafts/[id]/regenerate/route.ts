import { z } from "zod";
import { regenerateDraftSection } from "@/src/lib/drafts/service";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ section: z.string().min(1), instruction: z.string().max(500).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const { section, instruction } = Body.parse(await req.json().catch(() => ({})));
    return Response.json(await regenerateDraftSection(id, section, instruction));
  } catch (err) {
    return errorResponse(err);
  }
}
