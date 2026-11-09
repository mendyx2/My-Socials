import { z } from "zod";
import { authState, createSessionToken, passwordMatches, sessionCookie } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

const isHttps = (req: Request) => (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";

export async function POST(req: Request) {
  const parsed = z.object({ password: z.string().max(500) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter your password." }, { status: 400 });

  // Configuration problems are reported before checking the password.
  const state = authState({ host: req.headers.get("host"), cookie: undefined });
  if (!state.ok && state.reason !== "login") return Response.json({ error: state.message }, { status: 403 });
  if (!process.env.APP_PASSWORD) return Response.json({ error: "No password is set. On your laptop the app works without one." }, { status: 400 });

  if (!passwordMatches(parsed.data.password)) {
    await new Promise((r) => setTimeout(r, 800)); // slows down guessing
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(createSessionToken(), isHttps(req)) } });
}
