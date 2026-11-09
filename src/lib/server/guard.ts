import { authState, readCookie } from "../auth";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Every API route calls this first. Returns a response to send back if the request isn't
 * allowed, or null to continue.
 */
export function rejectIfUnauthorized(req: Request): Response | null {
  const state = authState({ host: req.headers.get("host"), cookie: readCookie(req.headers.get("cookie")) });
  if (!state.ok) {
    return Response.json({ error: state.message, reason: state.reason }, { status: state.reason === "login" ? 401 : 403 });
  }
  // Changes must come from this app's own pages (blocks other websites submitting on your behalf).
  if (WRITE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (originHost !== host) return Response.json({ error: "Cross-site request refused." }, { status: 403 });
    }
  }
  return null;
}
