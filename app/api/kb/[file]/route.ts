import { z } from "zod";
import { isKbFile, readKbFile, writeKbFile } from "@/src/lib/kb";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { file } = await ctx.params;
  if (!isKbFile(file)) return Response.json({ error: "Unknown file" }, { status: 404 });
  return Response.json({ file, content: await readKbFile(file) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { file } = await ctx.params;
  if (!isKbFile(file)) return Response.json({ error: "Unknown file" }, { status: 404 });
  const parsed = z.object({ content: z.string().max(200_000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  await writeKbFile(file, parsed.data.content);
  return Response.json({ ok: true });
}
