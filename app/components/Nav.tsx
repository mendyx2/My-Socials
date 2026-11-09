"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ideas" },
  { href: "/drafts", label: "Drafts" },
  { href: "/knowledge", label: "Knowledge base" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
