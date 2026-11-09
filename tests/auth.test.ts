import { describe, expect, it } from "vitest";
import { authState, createSessionToken, passwordMatches, readCookie, safeNext, sessionCookie, verifySessionToken } from "@/src/lib/auth";
import { rejectIfUnauthorized } from "@/src/lib/server/guard";

const PW = "correct horse battery staple";
const hosted = { APP_PASSWORD: PW, NETLIFY_BLOBS_CONTEXT: "x" };

describe("session tokens", () => {
  it("verifies its own tokens and rejects tampered, expired or foreign ones", () => {
    const t = createSessionToken(hosted);
    expect(verifySessionToken(t, hosted)).toBe(true);
    expect(verifySessionToken(t.slice(0, -2) + "xx", hosted)).toBe(false);
    const [exp, sig] = t.split(".");
    expect(verifySessionToken(`${Number(exp) + 999}.${sig}`, hosted)).toBe(false); // can't extend expiry
    expect(verifySessionToken(t, hosted, Date.now() + 31 * 86400_000)).toBe(false); // expired after 30 days
    expect(verifySessionToken(t, { ...hosted, APP_PASSWORD: "a different password!" })).toBe(false); // password change logs out
    expect(verifySessionToken(t, { ...hosted, SESSION_SECRET: "other" })).toBe(false);
    expect(verifySessionToken(undefined, hosted)).toBe(false);
    expect(verifySessionToken("garbage", hosted)).toBe(false);
  });

  it("checks passwords exactly", () => {
    expect(passwordMatches(PW, hosted)).toBe(true);
    expect(passwordMatches(PW + " ", hosted)).toBe(false);
    expect(passwordMatches("", {})).toBe(false);
  });
});

describe("who gets in", () => {
  const cookie = createSessionToken(hosted);
  it("hosted with a password: needs a valid login", () => {
    expect(authState({ host: "mysocials.netlify.app", cookie: undefined }, hosted)).toMatchObject({ ok: false, reason: "login" });
    expect(authState({ host: "mysocials.netlify.app", cookie }, hosted)).toEqual({ ok: true });
  });
  it("hosted without a password: nobody gets in", () => {
    expect(authState({ host: "x.netlify.app", cookie }, { NETLIFY_BLOBS_CONTEXT: "x" })).toMatchObject({ ok: false, reason: "misconfigured" });
  });
  it("hosted with a short password: refused until it's longer", () => {
    expect(authState({ host: "x", cookie: undefined }, { APP_PASSWORD: "short", NETLIFY_BLOBS_CONTEXT: "x" })).toMatchObject({ reason: "weak-password" });
  });
  it("local without a password: localhost only", () => {
    expect(authState({ host: "localhost:3000", cookie: undefined }, {})).toEqual({ ok: true });
    expect(authState({ host: "192.168.1.20:3000", cookie: undefined }, {})).toMatchObject({ ok: false, reason: "local-only" });
  });
  it("local with a password: login needed even on localhost", () => {
    expect(authState({ host: "localhost:3000", cookie: undefined }, { APP_PASSWORD: "x" })).toMatchObject({ reason: "login" });
  });
});

describe("helpers", () => {
  it("reads cookies and builds secure ones", () => {
    expect(readCookie("a=1; ms_session=abc.def; b=2")).toBe("abc.def");
    expect(readCookie(null)).toBeUndefined();
    const c = sessionCookie("t", true);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(sessionCookie("t", false)).not.toContain("Secure");
  });
  it("only redirects within the app", () => {
    expect(safeNext("/drafts/1")).toBe("/drafts/1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("API guard", () => {
  const withEnv = async (env: Record<string, string>, fn: () => void) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      fn();
    } finally {
      for (const k of Object.keys(env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  };
  it("returns 401 without login, passes with it, and refuses cross-site writes", async () => {
    await withEnv(hosted, () => {
      const token = createSessionToken();
      expect(rejectIfUnauthorized(new Request("https://me.netlify.app/api/ideas", { headers: { host: "me.netlify.app" } }))?.status).toBe(401);
      const ok = new Request("https://me.netlify.app/api/ideas", { headers: { host: "me.netlify.app", cookie: `ms_session=${token}` } });
      expect(rejectIfUnauthorized(ok)).toBeNull();
      const cross = new Request("https://me.netlify.app/api/drafts", {
        method: "POST",
        headers: { host: "me.netlify.app", cookie: `ms_session=${token}`, origin: "https://evil.example" },
      });
      expect(rejectIfUnauthorized(cross)?.status).toBe(403);
      const same = new Request("https://me.netlify.app/api/drafts", {
        method: "POST",
        headers: { host: "me.netlify.app", cookie: `ms_session=${token}`, origin: "https://me.netlify.app" },
      });
      expect(rejectIfUnauthorized(same)).toBeNull();
    });
  });
});
