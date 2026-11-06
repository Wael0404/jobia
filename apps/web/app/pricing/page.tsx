"use client";

import { PLAN_IDS, PLANS, type BillingStatusDto, type PlanId } from "@jobia/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { PlanAdvisor } from "../../components/PlanAdvisor";
import { api, hasSession } from "../../lib/api";

const ICONS: Record<PlanId, string> = { free: "🌱", standard: "🚀", premium: "💎" };

const FAQ = [
  { q: "Puis-je changer de forfait plus tard ?", a: "Oui, à tout moment depuis la page Abonnement. Le changement est immédiat." },
  { q: "Que se passe-t-il quand la limite du jour est atteinte ?", a: "L'agent se met en pause et reprend automatiquement le lendemain : rien n'est perdu." },
  { q: "Est-ce que l'agent envoie des candidatures sans mon accord ?", a: "Non en mode Validation : vous acceptez chaque offre avant l'envoi." },
];

function Pricing() {
  const router = useRouter();
  const onboarding = useSearchParams().get("onboarding") === "1";
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [billing, setBilling] = useState<BillingStatusDto | null>(null);
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasSession().then(async (ok) => {
      setSignedIn(ok);
      if (ok) setBilling(await api.billing().catch(() => null));
    });
  }, []);

  const choose = async (plan: PlanId) => {
    setError(null);
    if (!signedIn) {
      // New visitor: sign in first; the callback brings them back here to confirm the plan.
      window.location.assign(api.googleSignInUrl(`${window.location.origin}/auth/callback`));
      return;
    }
    setPending(plan);
    try {
      await api.choosePlan(plan);
      router.replace("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  };

  const current = billing?.planSelected ? billing.plan : null;

  return (
    <>
      <header className="nav">
        <Link href={signedIn ? "/dashboard" : "/"} className="brand">
          <span className="brand-mark" aria-hidden="true">
            🤖
          </span>
          <span>Jobia</span>
        </Link>
        {signedIn && !onboarding && (
          <Link href="/dashboard" className="nav-link">
            ← Tableau de bord
          </Link>
        )}
      </header>

      <main className="container pricing">
        <div className="section-title reveal">
          {onboarding && <span className="eyebrow">Étape 2 sur 3 · Votre forfait</span>}
          <h1>
            Choisissez le <span className="gradient-text">rythme de votre agent</span>
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Sans engagement : changez de forfait quand vous voulez.
          </p>
        </div>

        {billing?.testMode && (
          <p className="test-banner reveal" role="note">
            🧪 Mode test : aucun paiement n&apos;est demandé, les forfaits payants s&apos;activent immédiatement.
          </p>
        )}

        <PlanAdvisor />

        <div className="plans">
          {PLAN_IDS.map((id, i) => {
            const p = PLANS[id];
            const isCurrent = current === id;
            return (
              <article
                key={id}
                className={`plan card reveal ${p.recommended ? "featured" : ""}`}
                style={{ "--i": i + 1 } as CSSProperties}
                aria-labelledby={`plan-${id}`}
              >
                {p.recommended && <span className="ribbon">⭐ Recommandé par votre agent</span>}
                <div className="plan-head">
                  <span className="plan-icon" aria-hidden="true">
                    {ICONS[id]}
                  </span>
                  <h2 id={`plan-${id}`}>{p.name}</h2>
                </div>
                <p className="muted plan-tagline">{p.tagline}</p>
                <div className="price">
                  {p.priceTnd === 0 ? (
                    <strong>Gratuit</strong>
                  ) : (
                    <>
                      <strong>{p.priceTnd}</strong> <span>TND / mois</span>
                    </>
                  )}
                </div>
                {p.dailyApplications && p.priceTnd > 0 && (
                  <p className="price-note">
                    ≈ {(p.priceTnd / (p.dailyApplications * 30)).toLocaleString("fr-TN", { maximumFractionDigits: 2 })} TND
                    par candidature
                  </p>
                )}
                <p className="pitch">{p.pitch}</p>
                <ul className="plan-features">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn lg ${p.recommended ? "primary" : ""}`}
                  disabled={isCurrent || pending !== null}
                  aria-busy={pending === id}
                  onClick={() => void choose(id)}
                >
                  {isCurrent
                    ? "Votre forfait actuel"
                    : pending === id
                      ? "Activation…"
                      : p.priceTnd === 0
                        ? "Commencer gratuitement"
                        : `Choisir ${p.name}`}
                </button>
              </article>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="test-banner" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <p className="muted footnote">
          * Un plafond de sécurité quotidien s&apos;applique à tous les forfaits pour protéger votre réputation auprès des
          recruteurs.
        </p>

        <section className="faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="on-scroll">
            Questions fréquentes
          </h2>
          {FAQ.map((f, i) => (
            <details key={f.q} className="card on-scroll" style={{ "--i": i } as CSSProperties}>
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </section>
      </main>
    </>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <Pricing />
    </Suspense>
  );
}
