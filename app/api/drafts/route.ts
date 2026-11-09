import { z } from "zod";
import { draftIdea } from "@/src/lib/drafts/service";
import { DraftStore } from "@/src/lib/drafts/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  return Response.json({ drafts: await new DraftStore().list() });
}

const CreateSchema = z.object({ ideaId: z.string().min(1), targetSeconds: z.number().int().optional() });

export async function POST(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    const body = CreateSchema.parse(await req.json().catch(() => ({})));
    return Response.json(await draftIdea(body.ideaId, { targetSeconds: body.targetSeconds }));
  } catch (err) {
    return errorResponse(err);
  }
}
