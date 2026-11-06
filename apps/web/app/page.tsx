"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { RobotAgent } from "../components/RobotAgent";
import { api, hasSession } from "../lib/api";

const FEATURES = [
  { icon: "🧠", tone: "var(--primary)", title: "Comprend votre CV", text: "Compétences, expériences et postes visés sont extraits automatiquement." },
  { icon: "🔎", tone: "var(--accent)", title: "Cherche en continu", text: "L'agent parcourt les offres en arrière-plan, même quand vous êtes déconnecté." },
  { icon: "🎯", tone: "var(--primary-2)", title: "Garde le meilleur", text: "Chaque offre reçoit un score : seules celles qui vous correspondent sont retenues." },
  { icon: "📨", tone: "var(--success)", title: "Suit vos réponses", text: "Vues, entretiens, refus : votre tableau de bord se met à jour depuis Gmail." },
];

const STEPS = [
  { title: "Connectez-vous", text: "Avec votre compte Google, en un clic." },
  { title: "Déposez votre CV", text: "PDF ou Word, l'agent l'analyse en quelques secondes." },
  { title: "Lancez l'agent", text: "Il cherche, trie et vous présente les meilleures offres." },
];

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    void hasSession().then((signedIn) => signedIn && router.replace("/dashboard"));
  }, [router]);

  const signIn = () => window.location.assign(api.googleSignInUrl(`${window.location.origin}/auth/callback`));

  return (
    <>
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow reveal">
              <span className="live-dot" aria-hidden="true" />
              Agent IA de candidature
            </span>
            <h1 className="reveal" style={delay(1)}>
              Votre robot qui <span className="gradient-text">cherche un emploi</span> pour vous
            </h1>
            <p className="lead muted reveal" style={delay(2)}>
              Déposez votre CV : Jobia trouve les offres qui vous correspondent, prépare vos candidatures, détecte vos
              entretiens dans Gmail et vous montre l&apos;avancement de chaque candidature.
            </p>
            <div className="row reveal" style={delay(3)}>
              <button className="btn primary lg" onClick={signIn}>
                Commencer avec Google →
              </button>
              <Link href="/pricing" className="btn lg">
                Voir les forfaits
              </Link>
            </div>
            <ul className="chips reveal" style={delay(4)} aria-label="Points clés">
              <li>⚡ Recherche en arrière-plan</li>
              <li>🔒 Données chiffrées</li>
              <li>✅ Vous validez chaque envoi</li>
            </ul>
          </div>

          {/* Decorative illustration: hidden from assistive technology. */}
          <div className="hero-visual reveal" style={delay(2)} aria-hidden="true">
            <div className="orb-scene">
              <div className="orb" />
              <div className="orbit">
                <span className="orbit-item">💼</span>
                <span className="orbit-item b">📄</span>
              </div>
              <div className="orbit inner">
                <span className="orbit-item">⭐</span>
              </div>
              <RobotAgent state="sending" size={230} />
              <div className="toast t1">
                <span className="t-icon">🔎</span>
                <span>
                  <strong>Nouvelle offre trouvée</strong>
                  <span className="muted">Développeur Full-Stack · 92 %</span>
                </span>
              </div>
              <div className="toast t2">
                <span className="t-icon">📨</span>
                <span>
                  <strong>Candidature envoyée</strong>
                  <span className="muted">CV + lettre personnalisée</span>
                </span>
              </div>
              <div className="toast t3">
                <span className="t-icon">📅</span>
                <span>
                  <strong>Entretien détecté</strong>
                  <span className="muted">Ajouté à votre tableau de bord</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="features-title">
          <div className="section-title on-scroll">
            <h2 id="features-title">Un agent qui travaille pendant que vous vivez</h2>
            <p className="muted">Tout ce qu&apos;une recherche d&apos;emploi demande, automatisé.</p>
          </div>
          <div className="features">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="card lift feature on-scroll" style={{ ...delay(i), "--tone": f.tone } as CSSProperties}>
                <div className="stat-icon" aria-hidden="true">
                  {f.icon}
                </div>
                <h3>{f.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {f.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="steps-title">
          <div className="section-title on-scroll">
            <h2 id="steps-title">Prêt en 3 étapes</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="on-scroll" style={delay(i + 1)}>
                <div className="step-num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section">
          <div className="cta-band on-scroll">
            <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)" }}>Laissez votre robot postuler pour vous</h2>
            <p style={{ opacity: 0.9, marginTop: 0 }}>Vous gardez le contrôle à chaque étape : rien n&apos;est envoyé sans votre accord en mode Validation.</p>
            <button className="btn lg" onClick={signIn}>
              Commencer maintenant →
            </button>
          </div>
        </section>
      </main>
      <footer className="footer muted">
        Jobia demande l&apos;accès à Gmail pour envoyer vos candidatures et lire les réponses des recruteurs.
      </footer>
    </>
  );
}
