import { z } from "zod";
import { ProfileContentSchema } from "@/src/lib/profiles/schema";
import { addLaunchPostsToIdeas, duplicateProfile, rewriteProfileSection, updateProfile } from "@/src/lib/profiles/service";
import { errorResponse } from "@/src/lib/server/errors";
import { rejectIfNotLocal } from "@/src/lib/server/local-only";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

const Selected = z.object({ headline: z.number().int().min(0), bio: z.number().int().min(0) });
const Patch = z.object({ content: ProfileContentSchema.optional(), selected: Selected.optional(), status: z.enum(["draft", "live"]).optional() });

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return Response.json(await updateProfile(id, Patch.parse(await req.json().catch(() => ({})))));
  } catch (err) {
    return errorResponse(err);
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rewrite"), section: z.string().min(1), instruction: z.string().max(500).optional() }),
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("launchPosts"), indexes: z.union([z.literal("all"), z.array(z.number().int().min(0))]) }),
]);

export async function POST(req: Request, ctx: Ctx) {
  const denied = rejectIfNotLocal(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const body = Action.parse(await req.json().catch(() => ({})));
    if (body.action === "rewrite") return Response.json(await rewriteProfileSection(id, body.section, body.instruction));
    if (body.action === "duplicate") return Response.json(await duplicateProfile(id));
    return Response.json({ ideas: await addLaunchPostsToIdeas(id, body.indexes) });
  } catch (err) {
    return errorResponse(err);
  }
}
