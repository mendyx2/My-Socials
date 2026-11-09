import { z } from "zod";
import { profileOverview, writeProfiles } from "@/src/lib/profiles/service";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  return Response.json(await profileOverview());
}

export async function POST(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    const { instruction } = z.object({ instruction: z.string().max(1000).optional() }).parse(await req.json().catch(() => ({})));
    return Response.json(await writeProfiles(instruction));
  } catch (err) {
    return errorResponse(err);
  }
}
