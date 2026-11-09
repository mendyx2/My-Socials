import { z } from "zod";
import { draftCopyFromTranscript } from "@/src/lib/drafts/service";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ transcript: z.string().max(20000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const { transcript } = Body.parse(await req.json().catch(() => ({})));
    return Response.json(await draftCopyFromTranscript(id, transcript));
  } catch (err) {
    return errorResponse(err);
  }
}
