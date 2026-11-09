import { z } from "zod";
import { MEDIA_KINDS, MediaStore } from "@/src/lib/media/store";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  return Response.json(await new MediaStore().read());
}

/** Upload one or more images (multipart form: "files", optional "kind" and "boardId"). */
export async function POST(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  try {
    const form = await req.formData();
    const kind = z.enum(MEDIA_KINDS).catch("inspiration").parse(form.get("kind"));
    const boardId = typeof form.get("boardId") === "string" ? (form.get("boardId") as string) : "";
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f);
    if (files.length === 0) throw new Error("No files received.");
    if (files.length > 30) throw new Error("Upload at most 30 images at a time.");
    const store = new MediaStore();
    const added = [];
    const errors: string[] = [];
    for (const f of files) {
      try {
        added.push(await store.add({ data: new Uint8Array(await f.arrayBuffer()), originalName: f.name || "image", kind }));
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    if (boardId && added.length) {
      await store.updateBoard(boardId, { addItemIds: added.map((a) => a.id) }).catch(() => undefined);
    }
    return Response.json({ added, errors, ...(await store.read()) }, { status: added.length ? 200 : 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
