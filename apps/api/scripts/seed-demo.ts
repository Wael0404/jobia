/**
 * Seeds (or resets) the demo account used with DEMO_MODE=true:
 *   DATABASE_URL=… pnpm --filter @jobia/api seed:demo
 * Every application gets the timeline the real agent would have written.
 */
import { applicationEvents, applications, createDatabase, cvs, eq, interviews, jobOffers, users, inArray } from "@jobia/db";
import type { ApplicationStatus, CandidateProfile } from "@jobia/shared";
import { DEMO_USER_EMAIL } from "../src/modules/auth/auth.service";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, close } = createDatabase({ url, applicationName: "jobia-seed" });

const profile: CandidateProfile = {
  fullName: "Wael Demo",
  headline: "Développeur Full-Stack",
  email: DEMO_USER_EMAIL,
  phone: null,
  location: "Tunis",
  summary: "Développeur Full-Stack, 6 ans d'expérience en React, Node.js et PostgreSQL.",
  yearsOfExperience: 6,
  skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
  languages: [{ name: "Français", level: "courant" }, { name: "Anglais", level: "professionnel" }],
  experiences: [],
  education: [],
  targetRoles: ["Développeur Full-Stack", "Développeur React"],
  searchKeywords: ["react", "node.js", "typescript"],
};

const letter = (company: string) =>
  `Bonjour,\n\nDéveloppeur Full-Stack avec 6 ans d'expérience en React, Node.js et PostgreSQL, je souhaite rejoindre ${company}.` +
  ` J'ai notamment conçu des applications web à fort trafic et des API utilisées par des milliers d'utilisateurs.\n\n` +
  `Vous trouverez mon CV en pièce jointe. Je serais ravi d'échanger avec vous.\n\nCordialement,\nWael Demo`;

interface DemoOffer {
  key: string;
  title: string;
  company: string;
  location: string;
  status: ApplicationStatus;
  score: number;
  reasons: string[];
  appliedVia: "email" | "easy_apply";
  events: Array<{ actor: "agent" | "user" | "employer"; to: ApplicationStatus | null; message: string; hoursAgo: number }>;
}

const OFFERS: DemoOffer[] = [
  {
    key: "demo-1", title: "Développeur React Senior", company: "Entreprise A", location: "Tunis", status: "user_to_apply", score: 91,
    reasons: ["6 ans de React, l'offre en demande 5", "Même stack Node.js / TypeScript"], appliedVia: "easy_apply",
    events: [
      { actor: "agent", to: "queued", message: "Offre trouvée sur LinkedIn (Easy Apply), score 91/100", hoursAgo: 5 },
      { actor: "agent", to: "submitting", message: "Préparation de la candidature (linkedin)", hoursAgo: 4.9 },
      { actor: "agent", to: "user_to_apply", message: "Aucun email RH publié : candidature prête, à envoyer en un clic sur LinkedIn", hoursAgo: 4.8 },
    ],
  },
  {
    key: "demo-2", title: "Ingénieur Full-Stack Node.js", company: "Entreprise B", location: "Lac 2, Tunis", status: "user_to_apply", score: 84,
    reasons: ["API Node.js à grande échelle", "PostgreSQL demandé"], appliedVia: "easy_apply",
    events: [
      { actor: "agent", to: "queued", message: "Offre trouvée sur LinkedIn (Easy Apply), score 84/100", hoursAgo: 3 },
      { actor: "agent", to: "user_to_apply", message: "Aucun email RH publié : candidature prête, à envoyer en un clic sur LinkedIn", hoursAgo: 2.9 },
    ],
  },
  {
    key: "demo-3", title: "Développeur Front-End TypeScript", company: "Entreprise E", location: "Sousse (hybride)", status: "user_to_apply", score: 77,
    reasons: ["TypeScript avancé", "Télétravail partiel possible"], appliedVia: "easy_apply",
    events: [{ actor: "agent", to: "user_to_apply", message: "Aucun email RH publié : candidature prête, à envoyer en un clic sur LinkedIn", hoursAgo: 1 }],
  },
  {
    key: "demo-4", title: "Lead Developer TypeScript", company: "Entreprise C", location: "Tunis", status: "submitted", score: 88,
    reasons: ["Expérience de lead technique", "Stack identique"], appliedVia: "email",
    events: [
      { actor: "agent", to: "queued", message: "Offre trouvée sur LinkedIn (Easy Apply), score 88/100", hoursAgo: 30 },
      { actor: "agent", to: "submitted", message: "Email RH trouvé sur entreprise-c.tn : candidature envoyée à recrutement@entreprise-c.tn", hoursAgo: 29 },
    ],
  },
  {
    key: "demo-5", title: "Développeur Web Full-Stack", company: "Entreprise D", location: "Sfax", status: "interview", score: 79,
    reasons: ["React + Node.js", "Projet e-commerce"], appliedVia: "email",
    events: [
      { actor: "agent", to: "submitted", message: "Email RH trouvé dans l'offre : candidature envoyée à rh@entreprise-d.tn", hoursAgo: 96 },
      { actor: "employer", to: "interview", message: "Entreprise D vous invite à un entretien jeudi à 10h (Sfax)", hoursAgo: 20 },
    ],
  },
];

async function main(): Promise<void> {
  const old = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_USER_EMAIL));
  if (old.length) await db.delete(users).where(eq(users.email, DEMO_USER_EMAIL));
  await db.delete(jobOffers).where(inArray(jobOffers.externalId, OFFERS.map((o) => o.key)));

  const [user] = await db
    .insert(users)
    .values({ googleSub: "demo", email: DEMO_USER_EMAIL, name: "Wael Demo", agentMode: "autopilot" })
    .returning();
  const [cv] = await db
    .insert(cvs)
    .values({ userId: user!.id, storageKey: "demo", fileName: "CV_Wael_Demo.pdf", mimeType: "application/pdf", sizeBytes: 1, status: "ready", isActive: true, profile })
    .returning();

  for (const o of OFFERS) {
    const [offer] = await db
      .insert(jobOffers)
      .values({
        source: "linkedin",
        externalId: o.key,
        url: "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(o.title),
        title: o.title,
        company: o.company,
        location: o.location,
        description: `${o.title} — offre de démonstration.`,
        applyChannel: "easy_apply",
      })
      .returning();
    const sent = o.status !== "user_to_apply";
    const [app] = await db
      .insert(applications)
      .values({
        userId: user!.id,
        jobOfferId: offer!.id,
        cvId: cv!.id,
        status: o.status,
        matchScore: o.score,
        matchReasons: o.reasons,
        appliedVia: o.appliedVia,
        coverLetter: letter(o.company),
        submittedAt: sent ? new Date(Date.now() - o.events[0]!.hoursAgo * 3_600_000) : null,
      })
      .returning();
    let from: ApplicationStatus | null = null;
    for (const e of o.events) {
      await db.insert(applicationEvents).values({
        applicationId: app!.id,
        userId: user!.id,
        actor: e.actor,
        fromStatus: from,
        toStatus: e.to,
        message: e.message,
        occurredAt: new Date(Date.now() - e.hoursAgo * 3_600_000),
      });
      from = e.to ?? from;
    }
    if (o.status === "interview") {
      await db.insert(interviews).values({
        applicationId: app!.id,
        userId: user!.id,
        scheduledAt: new Date(Date.now() + 2 * 86_400_000),
        location: "Sfax",
        notes: "Entretien technique",
      });
    }
  }
  console.log(`Demo account ready: ${DEMO_USER_EMAIL} (${OFFERS.length} applications)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => close());
