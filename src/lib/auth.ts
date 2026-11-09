import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-person login: a password (APP_PASSWORD) and a signed, HttpOnly cookie.
 *
 * - Password set: a valid session cookie is required everywhere (laptop, phone, hosted).
 * - No password, running locally: only requests to localhost are allowed (as before).
 * - No password, hosted: everything is refused. It never runs open on the internet.
 */

export const SESSION_COOKIE = "ms_session";
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 12;

type Env = Record<string, string | undefined>;

export function isHosted(env: Env = process.env): boolean {
  if (env.STORAGE === "file") return false;
  return (
    env.STORAGE === "netlify" ||
    !!env.NETLIFY_BLOBS_CONTEXT ||
    (!!env.NETLIFY && !!env.SITE_ID) ||
    (env === process.env && !!(globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext)
  );
}

function secretKey(env: Env): Buffer {
  // A separate SESSION_SECRET is optional. Without it, the key comes from the password,
  // so changing the password logs out every device.
  const material = env.SESSION_SECRET || `pw:${env.APP_PASSWORD ?? ""}`;
  return createHash("sha256").update(`my-socials-session:${material}`).digest();
}

const sign = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function createSessionToken(env: Env = process.env, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  return `${exp}.${sign(secretKey(env), `v1.${exp}`)}`;
}

export function verifySessionToken(token: string | undefined, env: Env = process.env, now = Date.now()): boolean {
  if (!token || !env.APP_PASSWORD) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(secretKey(env), `v1.${exp}`));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Constant-time password check (hashing first makes the lengths equal). */
export function passwordMatches(input: string, env: Env = process.env): boolean {
  const pw = env.APP_PASSWORD;
  if (!pw) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

export function readCookie(header: string | null | undefined, name = SESSION_COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function hostnameOf(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

export type AuthState =
  | { ok: true }
  | { ok: false; reason: "login" | "misconfigured" | "weak-password" | "local-only"; message: string };

/** The single decision used by pages and API routes. */
export function authState(input: { host: string | null; cookie: string | undefined }, env: Env = process.env): AuthState {
  if (env.APP_PASSWORD) {
    if (isHosted(env) && env.APP_PASSWORD.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, reason: "weak-password", message: `APP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters when the app is online.` };
    }
    return verifySessionToken(input.cookie, env) ? { ok: true } : { ok: false, reason: "login", message: "Please log in." };
  }
  if (isHosted(env)) {
    return { ok: false, reason: "misconfigured", message: "This app is online without a password. Set APP_PASSWORD in Netlify (Site configuration → Environment variables) and redeploy." };
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostnameOf(input.host ?? "")) || env.ALLOW_REMOTE === "true";
  return local ? { ok: true } : { ok: false, reason: "local-only", message: "Set APP_PASSWORD to use the app from another device." };
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Only same-site relative paths, so a login link can't send you elsewhere. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
