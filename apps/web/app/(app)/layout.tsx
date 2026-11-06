"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "../../components/Logo";
import { api, hasSession } from "../../lib/api";

/** 24×24 stroke icons (inline SVG: crisp, themable with currentColor). */
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11",
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const LINKS = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: ICONS.home },
  { href: "/applications", label: "Candidatures", short: "Candidatures", icon: ICONS.list },
  { href: "/settings", label: "Paramètres", short: "Réglages", icon: ICONS.gear },
  { href: "/pricing", label: "Abonnement", short: "Forfait", icon: ICONS.star },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hasSession().then(async (ok) => {
      if (!ok) return router.replace("/");
      // Users who never picked a plan finish onboarding first.
      const me = await api.me().catch(() => null);
      if (me && !me.planSelected) return router.replace("/pricing?onboarding=1");
      setReady(true);
    });
  }, [router]);

  if (!ready) return null;
  const current = (href: string) => (pathname.startsWith(href) ? "page" : undefined);

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        <Link href="/dashboard" className="brand" aria-label="Jobia, tableau de bord">
          <Logo />
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link" aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
        </div>
        <button
          className="btn icon-btn"
          aria-label="Déconnexion"
          title="Déconnexion"
          onClick={() => void api.signOut().then(() => router.replace("/"))}
        >
          <Icon d={ICONS.logout} />
          <span className="hide-mobile" aria-hidden="true">
            Déconnexion
          </span>
        </button>
      </nav>

      <main className="container app-main">{children}</main>

      {/* Mobile: thumb-friendly tab bar (hidden on larger screens). */}
      <nav className="tabbar" aria-label="Navigation mobile">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="tab" aria-current={current(l.href)}>
            <Icon d={l.icon} />
            <span>{l.short}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
