import { z } from "zod";
import { MediaStore } from "@/src/lib/media/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export async function POST(req: Request) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    const { name, notes } = z.object({ name: z.string().max(80), notes: z.string().max(2000).optional() }).parse(await req.json().catch(() => ({})));
    return Response.json({ board: await new MediaStore().addBoard(name, notes) });
  } catch (err) {
    return errorResponse(err);
  }
}
