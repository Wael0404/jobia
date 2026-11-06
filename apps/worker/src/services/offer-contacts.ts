import type { ContactQuery, RecruiterContactFinder } from "@jobia/ai";
import { extractEmails, isRecruitmentCandidateEmail } from "@jobia/connectors";
import { eq, offerContacts, type Database, type JobOffer } from "@jobia/db";

export interface RecruiterContact {
  email: string;
  sourceUrl: string;
  foundVia: "offer_text" | "web";
}

/** A negative result is retried after this delay (the company may publish an address later). */
const NEGATIVE_TTL_MS = 7 * 86_400_000;

export type PageFetcher = (url: string) => Promise<string>;

/**
 * Finds a recruiter email for an offer that can only be applied to through
 * LinkedIn Easy Apply. Results (positive or negative) are cached per offer,
 * so the paid web research runs once per offer, not once per user.
 *
 * An address reported by the AI is used only if it is actually written on
 * the public page it came from: no hallucinated or guessed addresses.
 */
export class OfferContactResolver {
  constructor(
    private readonly db: Database,
    private readonly finder: Pick<RecruiterContactFinder, "find">,
    private readonly fetchPage: PageFetcher,
    private readonly logger: { warn(obj: object, msg: string): void },
  ) {}

  async resolve(offer: Pick<JobOffer, "id" | "url" | "title" | "company" | "location" | "description">): Promise<RecruiterContact | null> {
    const [cached] = await this.db.select().from(offerContacts).where(eq(offerContacts.jobOfferId, offer.id)).limit(1);
    if (cached?.email && cached.sourceUrl) {
      return { email: cached.email, sourceUrl: cached.sourceUrl, foundVia: cached.foundVia as RecruiterContact["foundVia"] };
    }
    if (cached && Date.now() - cached.checkedAt.getTime() < NEGATIVE_TTL_MS) return null;

    const contact = this.fromOfferText(offer) ?? (await this.fromWeb(offer));
    await this.db
      .insert(offerContacts)
      .values({ jobOfferId: offer.id, email: contact?.email ?? null, sourceUrl: contact?.sourceUrl ?? null, foundVia: contact?.foundVia ?? "none" })
      .onConflictDoUpdate({
        target: offerContacts.jobOfferId,
        set: { email: contact?.email ?? null, sourceUrl: contact?.sourceUrl ?? null, foundVia: contact?.foundVia ?? "none", checkedAt: new Date() },
      });
    return contact;
  }

  private fromOfferText(offer: { url: string; description: string }): RecruiterContact | null {
    const email = extractEmails(offer.description).find(isRecruitmentCandidateEmail);
    return email ? { email, sourceUrl: offer.url, foundVia: "offer_text" } : null;
  }

  private async fromWeb(offer: ContactQuery & { id: string }): Promise<RecruiterContact | null> {
    const report = await this.finder.find(offer);
    if (!report.email || !report.sourceUrl) return null;

    const email = report.email.trim().toLowerCase();
    if (!isRecruitmentCandidateEmail(email) || extractEmails(email)[0] !== email) return null;

    try {
      const page = (await this.fetchPage(report.sourceUrl)).toLowerCase();
      // Accept common obfuscations ("rh [at] acme.tn") as well as the plain address.
      const [local, domain] = email.split("@");
      const obfuscated = new RegExp(`${escape(local!)}\\s*(\\[at\\]|\\(at\\)|\\sat\\s)\\s*${escape(domain!)}`);
      if (page.includes(email) || obfuscated.test(page)) return { email, sourceUrl: report.sourceUrl, foundVia: "web" };
    } catch (error) {
      this.logger.warn({ offerId: offer.id, url: report.sourceUrl, err: String(error) }, "contact source page unreachable");
    }
    return null; // not verifiable → not used
  }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
