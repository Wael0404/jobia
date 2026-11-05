"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, hasSession } from "../../lib/api";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void hasSession().then((ok) => (ok ? setReady(true) : router.replace("/")));
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <nav className="nav">
        <Link href="/dashboard" className="brand">
          Jobia
        </Link>
        <Link href="/dashboard">Tableau de bord</Link>
        <Link href="/applications">Candidatures</Link>
        <Link href="/settings">Paramètres</Link>
        <button className="btn" onClick={() => void api.signOut().then(() => router.replace("/"))}>
          Déconnexion
        </button>
      </nav>
      <main className="container">{children}</main>
    </>
  );
}
