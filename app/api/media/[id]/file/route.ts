import { MediaStore } from "@/src/lib/media/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const { item, data } = await new MediaStore().fileOf((await ctx.params).id);
    return new Response(new Uint8Array(data), {
      headers: { "content-type": item.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
