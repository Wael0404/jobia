import type { Page } from "playwright";
import { fillForm } from "../forms";
import { extractEmails, jitter, looksLikeJobPost, normalizeWhitespace } from "../text";
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
 * LinkedIn connector.
 *
 * Used for DISCOVERY only: the submit pipeline never calls `apply()` for
 * Easy Apply offers (recruiter email or one-click by the user instead).
 *
 * ⚠️  LinkedIn offers no public API to search or apply to jobs, and its User
 * Agreement (§8.2) forbids automated access. This connector drives the
 * user's OWN session in a real browser, at human pace, with strict daily
 * caps, and is disabled by default (FEATURE_LINKEDIN_AUTOMATION). Accounts
 * can still be restricted by LinkedIn: the user must opt in explicitly
 * after reading the warning in the app. See docs/COMPLIANCE.md.
 *
 * Selectors live in one object so they can be updated quickly when the
 * LinkedIn UI changes (it does, often). Cover them with the smoke test in
 * apps/worker/scripts/smoke-connector.ts before every release.
 */
const SEL = {
  loginUser: "#username",
  loginPassword: "#password",
  loginSubmit: "button[type=submit]",
  loggedInMarker: "nav.global-nav, #global-nav",
  jobCard: "li[data-occludable-job-id]",
  jobCardTitle: ".job-card-list__title, .job-card-container__link",
  jobCardCompany: ".artdeco-entity-lockup__subtitle",
  jobCardLocation: ".artdeco-entity-lockup__caption",
  jobDescription: "#job-details, .jobs-description__content",
  easyApplyButton: "button.jobs-apply-button",
  appliedBadge: ".artdeco-inline-feedback--success, .jobs-details-top-card__apply-error",
  modal: "div.jobs-easy-apply-modal, [data-test-modal][role=dialog]",
  resumeInput: "input[type=file]",
  nextButton: "button[aria-label*='next' i], button[aria-label*='suivant' i]",
  reviewButton: "button[aria-label*='review' i], button[aria-label*='vérifier' i]",
  submitButton: "button[aria-label*='submit application' i], button[aria-label*='envoyer la candidature' i]",
  postContainer: "div.feed-shared-update-v2",
  postText: ".update-components-text, .feed-shared-text",
  postAuthor: ".update-components-actor__title, .feed-shared-actor__title",
} as const;

const BASE = "https://www.linkedin.com";
const MAX_EASY_APPLY_STEPS = 8;

export class LinkedInConnector implements JobSourceConnector {
  readonly id = "linkedin" as const;
  readonly displayName = "LinkedIn";
  readonly minActionDelayMs = 4_000;

  async isLoggedIn({ page }: ConnectorContext): Promise<boolean> {
    await page.goto(`${BASE}/feed/`, { waitUntil: "domcontentloaded" });
    return !page.url().includes("/login") && (await page.locator(SEL.loggedInMarker).count()) > 0;
  }

  async login(ctx: ConnectorContext): Promise<LoginResult> {
    const { page, credentials } = ctx;
    if (await this.isLoggedIn(ctx)) return { status: "ok" };
    if (!credentials) return { status: "invalid_credentials" };

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator(SEL.loginUser).pressSequentially(credentials.login, { delay: 60 });
    await page.locator(SEL.loginPassword).pressSequentially(credentials.password, { delay: 60 });
    await Promise.all([page.waitForLoadState("domcontentloaded"), page.locator(SEL.loginSubmit).click()]);
    await page.waitForTimeout(jitter(3_000));

    const url = page.url();
    if (url.includes("/checkpoint/") || url.includes("/challenge")) {
      return { status: "challenge", reason: "LinkedIn asks for a verification (2FA / captcha)" };
    }
    if (url.includes("/login") || url.includes("/uas/")) return { status: "invalid_credentials" };
    return { status: "ok" };
  }

  async search(ctx: ConnectorContext, query: SearchQuery): Promise<DiscoveredOffer[]> {
    // Sequential on purpose: one tab per user, human-like navigation.
    const jobs = await this.searchEasyApplyJobs(ctx, query);
    const posts = await this.searchHiringPosts(ctx, query);
    return [...jobs, ...posts].slice(0, query.limit);
  }

  /** Jobs with the "Easy Apply" filter (f_AL=true) — the only ones we can apply to in-platform. */
  private async searchEasyApplyJobs({ page, logger }: ConnectorContext, query: SearchQuery): Promise<DiscoveredOffer[]> {
    const params = new URLSearchParams({
      keywords: query.keywords.slice(0, 3).join(" OR "),
      location: query.location ?? countryName(query.countryCode),
      f_AL: "true",
      f_TPR: `r${query.postedWithinDays * 86_400}`,
      sortBy: "DD",
    });
    if (query.remoteOk) params.set("f_WT", "1,2,3");

    await page.goto(`${BASE}/jobs/search/?${params}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(jitter(this.minActionDelayMs));

    const cards = page.locator(SEL.jobCard);
    const count = Math.min(await cards.count(), query.limit);
    const offers: DiscoveredOffer[] = [];

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const jobId = await card.getAttribute("data-occludable-job-id");
      if (!jobId) continue;
      try {
        await card.scrollIntoViewIfNeeded();
        await card.click();
        await page.waitForTimeout(jitter(2_000));
        offers.push({
          source: "linkedin",
          externalId: `job:${jobId}`,
          url: `${BASE}/jobs/view/${jobId}/`,
          title: normalizeWhitespace(await card.locator(SEL.jobCardTitle).first().innerText()),
          company: normalizeWhitespace(await card.locator(SEL.jobCardCompany).first().innerText()),
          location: normalizeWhitespace(await card.locator(SEL.jobCardLocation).first().innerText().catch(() => "")) || null,
          description: normalizeWhitespace(await page.locator(SEL.jobDescription).first().innerText().catch(() => "")),
          applyChannel: "easy_apply",
          applyEmail: null,
          postedAt: null,
        });
      } catch (error) {
        logger.warn("linkedin: skipping job card", { jobId, error: String(error) });
      }
    }
    return offers;
  }

  /**
   * Recruiter posts ("We're hiring… send your CV to hr@acme.tn").
   * Only posts that contain an email address become offers; they are
   * applied to by email (Gmail API), never by messaging the recruiter.
   */
  private async searchHiringPosts({ page }: ConnectorContext, query: SearchQuery): Promise<DiscoveredOffer[]> {
    const keywords = `(${query.keywords.slice(0, 3).join(" OR ")}) AND (recrutement OR hiring OR "envoyez votre CV")`;
    const params = new URLSearchParams({ keywords, datePosted: '"past-week"', sortBy: '"date_posted"' });
    await page.goto(`${BASE}/search/results/content/?${params}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(jitter(this.minActionDelayMs));
    await autoScroll(page, 3);

    const posts = page.locator(SEL.postContainer);
    const offers: DiscoveredOffer[] = [];
    for (let i = 0; i < Math.min(await posts.count(), 30); i++) {
      const post = posts.nth(i);
      const text = normalizeWhitespace(await post.locator(SEL.postText).first().innerText().catch(() => ""));
      const email = extractEmails(text)[0];
      if (!email || !looksLikeJobPost(text)) continue;
      const urn = (await post.getAttribute("data-urn")) ?? `post:${hash(text)}`;
      const author = normalizeWhitespace(await post.locator(SEL.postAuthor).first().innerText().catch(() => ""));
      offers.push({
        source: "linkedin",
        externalId: urn,
        url: urn.startsWith("urn:") ? `${BASE}/feed/update/${urn}/` : page.url(),
        title: text.slice(0, 120),
        company: author || email.split("@")[1] || "Unknown",
        location: null,
        description: text,
        applyChannel: "email",
        applyEmail: email,
        postedAt: null,
      });
    }
    return offers;
  }

  async apply({ page, logger }: ConnectorContext, offer: OfferRef, applicant: Applicant): Promise<ApplyResult> {
    await page.goto(offer.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(jitter(this.minActionDelayMs));

    if ((await page.locator(SEL.appliedBadge).count()) > 0) return { status: "already_applied" };
    const button = page.locator(SEL.easyApplyButton).first();
    if ((await button.count()) === 0) return { status: "offer_closed" };

    await button.click();
    const modal = page.locator(SEL.modal).first();
    await modal.waitFor({ state: "visible", timeout: 15_000 });

    for (let step = 0; step < MAX_EASY_APPLY_STEPS; step++) {
      await page.waitForTimeout(jitter(1_500));

      const resume = modal.locator(SEL.resumeInput);
      if ((await resume.count()) > 0) await resume.first().setInputFiles(applicant.cvFilePath);

      const filled = await fillForm(modal, applicant.answerQuestions);
      if (!filled.complete) {
        logger.info("linkedin: form needs user input", { missing: filled.missing });
        return { status: "needs_user_action", reason: "Questions sans réponse", pendingQuestions: filled.missing };
      }

      const submit = modal.locator(SEL.submitButton);
      if ((await submit.count()) > 0) {
        await submit.first().click();
        await page.waitForTimeout(jitter(3_000));
        return { status: "submitted", confirmation: null };
      }

      const next = modal.locator(`${SEL.reviewButton}, ${SEL.nextButton}`);
      if ((await next.count()) === 0) break;
      await next.first().click();
    }
    return { status: "failed", reason: "Easy Apply flow did not reach the submit step", retryable: false };
  }
}

async function autoScroll(page: Page, screens: number): Promise<void> {
  for (let i = 0; i < screens; i++) {
    await page.mouse.wheel(0, 2_000);
    await page.waitForTimeout(jitter(1_500));
  }
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const COUNTRY_NAMES: Record<string, string> = { TN: "Tunisia", FR: "France", MA: "Morocco", DZ: "Algeria" };
function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
