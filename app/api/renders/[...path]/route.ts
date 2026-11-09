import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";
import { readRendered } from "@/src/lib/visuals/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const { data, type, name } = await readRendered((await ctx.params).path);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": type,
        "cache-control": "no-store",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
