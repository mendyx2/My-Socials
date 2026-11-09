import { rejectIfUnauthorized } from "@/src/lib/server/guard";
import { fontCss } from "@/src/lib/visuals/render";
import { loadTheme } from "@/src/lib/visuals/theme";

export const dynamic = "force-dynamic";

/** Theme + embedded fonts, so the editor can preview slides exactly as they'll render. */
export async function GET(req: Request) {
  const denied = rejectIfUnauthorized(req);
  if (denied) return denied;
  return Response.json({ theme: await loadTheme(), fontCss: await fontCss() });
}
