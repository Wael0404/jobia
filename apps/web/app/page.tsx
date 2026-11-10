"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, hasSession } from "../lib/api";

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    void hasSession().then((signedIn) => signedIn && router.replace("/dashboard"));
  }, [router]);

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const tryDemo = () => void api.demoLogin().then(() => router.replace("/dashboard"));
  const signIn = () => window.location.assign(api.googleSignInUrl(`${window.location.origin}/auth/callback`));

  return (
    <main className="hero">
      <h1>Votre agent IA de recherche d&apos;emploi</h1>
      <p className="muted" style={{ maxWidth: 620, margin: "0 auto 28px" }}>
        Déposez votre CV. Jobia trouve les offres qui vous correspondent sur LinkedIn et les sites de recrutement,
        postule à votre place, détecte vos entretiens dans Gmail et vous montre l&apos;avancement de chaque candidature.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn primary" onClick={signIn}>
          Continuer avec Google
        </button>
        {isDemo && (
          <button className="btn" onClick={tryDemo}>
            Essayer la démo
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        Jobia demande l&apos;accès à Gmail pour envoyer vos candidatures et lire les réponses des recruteurs.
      </p>
    </main>
  );
}
