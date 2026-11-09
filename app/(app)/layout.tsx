import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Nav } from "@/app/components/Nav";
import { authState, SESSION_COOKIE } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

/** Every app page goes through here: no valid login, no page. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const state = authState({ host: h.get("host"), cookie: c.get(SESSION_COOKIE)?.value });
  if (!state.ok && state.reason === "login") redirect("/login");

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-ring" aria-hidden="true" />
          <span className="brand-name">My Socials</span>
        </Link>
        {state.ok && <Nav canLogOut={!!process.env.APP_PASSWORD} />}
      </header>
      <main>
        {state.ok ? (
          children
        ) : (
          <div className="notice error" role="alert">
            {state.message}
          </div>
        )}
      </main>
    </div>
  );
}
