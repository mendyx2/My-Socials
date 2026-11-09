"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ideas" },
  { href: "/drafts", label: "Drafts" },
  { href: "/profile", label: "Profiles" },
  { href: "/library", label: "Library" },
  { href: "/knowledge", label: "Knowledge base" },
];

export function Nav({ canLogOut = false }: { canLogOut?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      {canLogOut && (
        <button
          type="button"
          className="nav-logout"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Log out
        </button>
      )}
    </nav>
  );
}
