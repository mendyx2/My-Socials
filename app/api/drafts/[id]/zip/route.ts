import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";
import { carouselZip } from "@/src/lib/visuals/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  try {
    const { data, filename, warnings } = await carouselZip((await ctx.params).id);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        // Encoded so any characters are header-safe; the editor shows these.
        "x-render-warnings": encodeURIComponent(JSON.stringify(warnings)),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
