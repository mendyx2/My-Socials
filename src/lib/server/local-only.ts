/**
 * This app reads and writes files on your computer and spends your AI quota.
 * It has no login, so API routes refuse requests that don't come from this machine.
 */
export function rejectIfNotLocal(req: Request): Response | null {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (local || process.env.ALLOW_REMOTE === "true") return null;
  return Response.json({ error: "This tool only accepts requests from localhost." }, { status: 403 });
}
