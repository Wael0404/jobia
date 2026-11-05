const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IGNORED_EMAIL_DOMAINS = ["linkedin.com", "example.com", "sentry.io"];

/** Extracts recruiter emails from free text such as a LinkedIn "We're hiring" post. */
export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  const unique = new Set(
    found
      .map((e) => e.toLowerCase().replace(/[.,;:]+$/, ""))
      .filter((e) => !IGNORED_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`) || e.endsWith(`.${d}`))),
  );
  return [...unique];
}

const HIRING_MARKERS = [
  "hiring",
  "we are looking for",
  "recrut", // recrute, recrutons, recrutement
  "nous recherchons",
  "offre d'emploi",
  "poste à pourvoir",
  "envoyez votre cv",
  "send your cv",
  "توظيف",
  "مطلوب",
];

export function looksLikeJobPost(text: string): boolean {
  const lower = text.toLowerCase();
  return HIRING_MARKERS.some((m) => lower.includes(m));
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function jitter(baseMs: number): number {
  return Math.round(baseMs * (0.75 + Math.random() * 0.75));
}
