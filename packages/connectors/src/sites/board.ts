import type { JobSourceId } from "@jobia/shared";
import { fillForm } from "../forms";
import { extractEmails, jitter, normalizeWhitespace } from "../text";
import type {
  Applicant,
  ApplyResult,
  ConnectorContext,
  DiscoveredOffer,
  JobSourceConnector,
  LoginResult,
  OfferRef,
  SearchQuery,
} from "../types";

/**
 * Declarative description of a "classic" job board (login form, search
 * page, offer page with an apply button + form). Most national job boards
 * follow this shape, so a new site is usually just a new profile.
 */
export interface BoardProfile {
  id: JobSourceId;
  displayName: string;
  baseUrl: string;
  minActionDelayMs: number;
  login: { url: string; user: string; password: string; submit: string; loggedInMarker: string; errorMarker: string };
  search: {
    /** `{q}` is replaced by the URL-encoded keywords, `{page}` by the page number. */
    urlTemplate: string;
    pages: number;
    card: string;
    link: string;
    title: string;
    company: string;
    location?: string;
  };
  offer: {
    description: string;
    applyButton: string;
    form: string;
    cvInput: string;
    coverLetterInput?: string;
    submit: string;
    successMarker: string;
    alreadyAppliedMarker?: string;
  };
}

export class BoardConnector implements JobSourceConnector {
  readonly id: JobSourceId;
  readonly displayName: string;
  readonly minActionDelayMs: number;

  constructor(private readonly p: BoardProfile) {
    this.id = p.id;
    this.displayName = p.displayName;
    this.minActionDelayMs = p.minActionDelayMs;
  }

  async isLoggedIn({ page }: ConnectorContext): Promise<boolean> {
    await page.goto(this.p.baseUrl, { waitUntil: "domcontentloaded" });
    return (await page.locator(this.p.login.loggedInMarker).count()) > 0;
  }

  async login(ctx: ConnectorContext): Promise<LoginResult> {
    if (await this.isLoggedIn(ctx)) return { status: "ok" };
    const { page, credentials } = ctx;
    if (!credentials) return { status: "invalid_credentials" };

    const l = this.p.login;
    await page.goto(l.url, { waitUntil: "domcontentloaded" });
    await page.locator(l.user).fill(credentials.login);
    await page.locator(l.password).fill(credentials.password);
    await page.locator(l.submit).click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(jitter(2_000));

    if ((await page.locator("iframe[src*='captcha'], .g-recaptcha, .h-captcha").count()) > 0) {
      return { status: "challenge", reason: `${this.displayName} affiche un captcha` };
    }
    if ((await page.locator(l.errorMarker).count()) > 0) return { status: "invalid_credentials" };
    return (await page.locator(l.loggedInMarker).count()) > 0 ? { status: "ok" } : { status: "invalid_credentials" };
  }

  async search({ page, logger }: ConnectorContext, query: SearchQuery): Promise<DiscoveredOffer[]> {
    const s = this.p.search;
    const links = new Map<string, Pick<DiscoveredOffer, "title" | "company" | "location">>();

    for (const keyword of query.keywords.slice(0, 4)) {
      for (let pageNo = 1; pageNo <= s.pages && links.size < query.limit; pageNo++) {
        const url = s.urlTemplate.replace("{q}", encodeURIComponent(keyword)).replace("{page}", String(pageNo));
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(jitter(this.minActionDelayMs));

        const cards = page.locator(s.card);
        for (let i = 0; i < (await cards.count()); i++) {
          const card = cards.nth(i);
          const href = await card.locator(s.link).first().getAttribute("href");
          if (!href) continue;
          const absolute = new URL(href, this.p.baseUrl).toString();
          if (links.has(absolute)) continue;
          links.set(absolute, {
            title: normalizeWhitespace(await card.locator(s.title).first().innerText().catch(() => "")),
            company: normalizeWhitespace(await card.locator(s.company).first().innerText().catch(() => "")) || "N/A",
            location: s.location
              ? normalizeWhitespace(await card.locator(s.location).first().innerText().catch(() => "")) || null
              : null,
          });
        }
      }
    }

    const offers: DiscoveredOffer[] = [];
    for (const [url, card] of [...links].slice(0, query.limit)) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(jitter(this.minActionDelayMs));
        const description = normalizeWhitespace(await page.locator(this.p.offer.description).first().innerText());
        const hasForm = (await page.locator(this.p.offer.applyButton).count()) > 0;
        const email = extractEmails(description)[0] ?? null;
        if (!hasForm && !email) continue; // nothing we can apply through
        offers.push({
          source: this.p.id,
          externalId: new URL(url).pathname,
          url,
          ...card,
          description,
          applyChannel: hasForm ? "site_form" : "email",
          applyEmail: email,
          postedAt: null,
        });
      } catch (error) {
        logger.warn(`${this.id}: cannot read offer`, { url, error: String(error) });
      }
    }
    return offers;
  }

  async apply({ page }: ConnectorContext, offer: OfferRef, applicant: Applicant): Promise<ApplyResult> {
    const o = this.p.offer;
    const response = await page.goto(offer.url, { waitUntil: "domcontentloaded" });
    if (response?.status() === 404 || response?.status() === 410) return { status: "offer_closed" };
    await page.waitForTimeout(jitter(this.minActionDelayMs));

    if (o.alreadyAppliedMarker && (await page.locator(o.alreadyAppliedMarker).count()) > 0) {
      return { status: "already_applied" };
    }
    const apply = page.locator(o.applyButton).first();
    if ((await apply.count()) === 0) return { status: "offer_closed" };
    await apply.click();

    const form = page.locator(o.form).first();
    await form.waitFor({ state: "visible", timeout: 15_000 });

    const cv = form.locator(o.cvInput);
    if ((await cv.count()) > 0) await cv.first().setInputFiles(applicant.cvFilePath);
    if (o.coverLetterInput && applicant.coverLetter) {
      const letter = form.locator(o.coverLetterInput);
      if ((await letter.count()) > 0) await letter.first().fill(applicant.coverLetter);
    }

    const filled = await fillForm(form, applicant.answerQuestions);
    if (!filled.complete) {
      return { status: "needs_user_action", reason: "Questions sans réponse", pendingQuestions: filled.missing };
    }

    await form.locator(o.submit).first().click();
    try {
      await page.locator(o.successMarker).first().waitFor({ state: "visible", timeout: 20_000 });
      return { status: "submitted", confirmation: null };
    } catch {
      return { status: "failed", reason: "No confirmation after submit", retryable: true };
    }
  }
}
