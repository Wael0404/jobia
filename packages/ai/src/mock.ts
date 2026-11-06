/**
 * Local heuristic stand-ins for every AI capability, used when the LLM
 * provider is "mock" (AI_PROVIDER=mock). They let the whole pipeline run
 * for free on a laptop. They are deliberately simple and never invent data:
 * anything they cannot find is left empty or null.
 */
import type { CandidateProfile } from "@jobia/shared";
import { extractText, getDocumentProxy } from "unpdf";
import type { CvDocument } from "./cv-parser";
import type { FormQuestion } from "./form-answerer";
import type { InboundEmail, OpenApplicationRef } from "./email-classifier";
import type { MatchableOffer } from "./job-matcher";

/** Skills recognised in a CV (case-insensitive, whole word). */
const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "React", "Angular", "Vue", "Next.js", "Node.js", "Express", "NestJS",
  "PHP", "Laravel", "Symfony", "Python", "Django", "Flask", "Java", "Spring", "Kotlin", "Swift",
  "C#", ".NET", "C++", "Go", "Rust", "Ruby", "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis",
  "Docker", "Kubernetes", "AWS", "Azure", "GCP", "Firebase", "Git", "Linux", "HTML", "CSS",
  "Tailwind", "Bootstrap", "Flutter", "React Native", "GraphQL", "REST", "Figma", "Jira", "Scrum",
  "Agile", "DevOps", "CI/CD", "Excel", "Power BI", "SAP", "Salesforce", "WordPress", "Machine Learning",
];

const LANGUAGES: Array<[RegExp, string]> = [
  [/\b(fran[cç]ais|french)\b/i, "Français"],
  [/\b(anglais|english)\b/i, "Anglais"],
  [/\b(arabe|arabic)\b/i, "Arabe"],
  [/\b(allemand|german)\b/i, "Allemand"],
  [/\b(espagnol|spanish)\b/i, "Espagnol"],
  [/\b(italien|italian)\b/i, "Italien"],
];

const ROLE_HINTS: Array<[RegExp, string]> = [
  [/full[\s-]?stack/i, "Développeur Full-Stack"],
  [/front[\s-]?end|react|angular|vue/i, "Développeur Front-End"],
  [/back[\s-]?end|node\.js|laravel|symfony|django|spring/i, "Développeur Back-End"],
  [/mobile|flutter|react native|android|ios/i, "Développeur Mobile"],
  [/devops|kubernetes|docker|ci\/cd/i, "Ingénieur DevOps"],
  [/data|machine learning|power bi|python/i, "Data Analyst"],
  [/chef de projet|project manager|scrum/i, "Chef de projet"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

async function cvText(doc: CvDocument): Promise<string> {
  if (doc.kind === "text") return doc.text;
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(doc.base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function mockParseCv(doc: CvDocument): Promise<CandidateProfile> {
  const text = await cvText(doc);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  const phone = text.match(/(\+?\d[\d\s.-]{7,}\d)/)?.[0]?.trim() ?? null;
  const fullName =
    lines.find((l) => /^[\p{L}' -]{3,40}$/u.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 4) ??
    "Candidat";
  const skills = KNOWN_SKILLS.filter((s) => hasWord(text, s));
  const languages = LANGUAGES.filter(([re]) => re.test(text)).map(([, name]) => ({ name, level: "Non précisé" }));
  const targetRoles = [...new Set(ROLE_HINTS.filter(([re]) => re.test(text)).map(([, role]) => role))].slice(0, 6);
  const years = [...text.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
  const yearsOfExperience = years.length >= 2 ? Math.max(0, Math.min(40, Math.max(...years) - Math.min(...years))) : 0;
  const headline = targetRoles[0] ?? lines.find((l) => l !== fullName && l.length < 60) ?? "Profil";

  return {
    fullName,
    headline,
    email,
    phone,
    location: /tunis/i.test(text) ? "Tunisie" : null,
    summary: `Profil extrait automatiquement en mode test (sans IA) : ${skills.length} compétence(s) reconnue(s).`,
    yearsOfExperience,
    skills,
    languages,
    experiences: [],
    education: [],
    targetRoles: targetRoles.length > 0 ? targetRoles : [headline],
    searchKeywords: [...new Set([...skills.slice(0, 8), ...targetRoles.slice(0, 4)])].slice(0, 12),
  };
}

export function mockScore(profile: CandidateProfile, offers: MatchableOffer[]) {
  const terms = [...new Set([...profile.skills, ...profile.searchKeywords, ...profile.targetRoles])];
  return {
    results: offers.map((o) => {
      const haystack = `${o.title} ${o.description}`;
      const hits = terms.filter((t) => hasWord(haystack, t));
      const titleHit = profile.targetRoles.some((r) => hasWord(o.title, r.split(" ").at(-1) ?? r));
      // Listing excerpts are short: ~2 shared keywords + a matching job title is already a good fit.
      const score = Math.min(100, hits.length * 20 + (titleHit ? 30 : 0));
      return {
        offerId: o.id,
        score,
        reasons: hits.length > 0 ? [`Mots-clés communs : ${hits.slice(0, 5).join(", ")}`, "Score calculé en mode test (sans IA)"] : ["Aucun mot-clé commun", "Score calculé en mode test (sans IA)"],
        dealBreaker: null,
      };
    }),
  };
}

export function mockApplicationEmail(profile: CandidateProfile, offer: MatchableOffer) {
  const skills = profile.skills.slice(0, 3).join(", ");
  return {
    language: "fr" as const,
    subject: `Candidature — ${offer.title}`,
    body: [
      "Madame, Monsieur,",
      "",
      `Je vous adresse ma candidature pour le poste de ${offer.title} chez ${offer.company}.`,
      skills ? `Mes compétences en ${skills} correspondent aux besoins décrits dans votre offre.` : "",
      "Vous trouverez mon CV en pièce jointe. Je reste à votre disposition pour un entretien.",
      "",
      "Cordialement,",
      profile.fullName,
    ]
      .filter((l, i, all) => l !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}

export function mockFormAnswers(profile: CandidateProfile, saved: Record<string, string>, questions: FormQuestion[]) {
  const fromProfile = (label: string): string | null => {
    const l = label.toLowerCase();
    if (/e-?mail/.test(l)) return profile.email;
    if (/t[ée]l[ée]phone|phone|mobile/.test(l)) return profile.phone;
    if (/nom complet|full name|^nom$|name/.test(l)) return profile.fullName;
    return null;
  };
  return {
    answers: questions.map((q) => {
      const savedValue = saved[q.label] ?? saved[q.id] ?? null;
      let value = savedValue ?? fromProfile(q.label);
      if (value && q.options?.length && !q.options.includes(value)) value = null;
      return { questionId: q.id, value };
    }),
  };
}

export function mockClassifyEmail(email: InboundEmail, open: OpenApplicationRef[]) {
  const text = `${email.subject}\n${email.text}`;
  const match = open.find((a) => hasWord(text, a.company));
  const kind = /entretien|interview|rencontrer/i.test(text)
    ? "interview_invitation"
    : /malheureusement|regret|unfortunately|pas retenu|not been selected/i.test(text)
      ? "rejection"
      : /offre d'emploi|job offer|nous avons le plaisir/i.test(text)
        ? "offer"
        : "other";
  return {
    isRecruitmentRelated: Boolean(match) || kind !== "other",
    applicationId: match?.applicationId ?? null,
    kind: kind as "interview_invitation" | "rejection" | "offer" | "other",
    interview: null,
    summary: `${email.subject} (classé en mode test, sans IA)`,
  };
}
