import { z } from "zod";
import { setChecklistItem } from "@/src/lib/profiles/service";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export async function PUT(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const { id, done } = z.object({ id: z.string().min(1).max(60), done: z.boolean() }).parse(await req.json().catch(() => ({})));
    return Response.json({ checklist: await setChecklistItem(id, done) });
  } catch (err) {
    return errorResponse(err);
  }
}
