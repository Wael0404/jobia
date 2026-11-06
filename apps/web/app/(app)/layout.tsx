"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, hasSession } from "../../lib/api";

const LINKS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/applications", label: "Candidatures" },
  { href: "/settings", label: "Paramètres" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hasSession().then((ok) => (ok ? setReady(true) : router.replace("/")));
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark" aria-hidden="true">
            🤖
          </span>
          <span>Jobia</span>
        </Link>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-link"
            aria-current={pathname.startsWith(l.href) ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
        <button
          className="btn"
          aria-label="Déconnexion"
          onClick={() => void api.signOut().then(() => router.replace("/"))}
        >
          <span className="hide-mobile" aria-hidden="true">
            Déconnexion
          </span>
          <span aria-hidden="true">↪</span>
        </button>
      </nav>
      <main className="container">{children}</main>
    </>
  );
}
