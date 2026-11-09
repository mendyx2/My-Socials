import { clearedSessionCookie } from "@/src/lib/auth";

export async function POST(req: Request) {
  const https = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie(https) } });
}
