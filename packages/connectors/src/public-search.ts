import type { JobSourceId } from "@jobia/shared";
import { load, type CheerioAPI } from "cheerio";
import { extractEmails, jitter, normalizeWhitespace } from "./text";
import type { ConnectorLogger, DiscoveredOffer, SearchQuery } from "./types";

/**
 * Browserless job discovery: reads the PUBLIC search-result pages of job
 * boards over plain HTTP (no login, no Playwright) and parses them with
 * cheerio. Only boards whose listing pages are allowed by robots.txt and
 * served without an anti-bot challenge are listed here; a board that starts
 * blocking us must be removed, never worked around.
 *
 * The listing card is enough for discovery and matching (title, company,
 * location, excerpt); applying still happens on the board itself.
 */
export interface PublicBoardProfile {
  id: JobSourceId;
  baseUrl: string;
  /** `{q}` → URL-encoded keyword, `{page}` → page number. */
  searchUrl: string;
  pages: number;
  card: string;
  link: string;
  title: string;
  company: string;
  location: string;
  excerpt: string;
}

export const PUBLIC_BOARDS: PublicBoardProfile[] = [
  {
    id: "tanitjobs",
    baseUrl: "https://www.tanitjobs.com",
    searchUrl: "https://www.tanitjobs.com/jobs/?keywords={q}&page={page}",
    pages: 1,
    card: ".sj-job-card",
    link: ".sj-card-title a",
    title: ".sj-card-title",
    company: ".sj-card-company a",
    location: ".sj-card-tag.sj-loc",
    excerpt: ".sj-card-desc",
  },
  {
    id: "keejob",
    baseUrl: "https://www.keejob.com",
    searchUrl: "https://www.keejob.com/offres-emploi/?keywords={q}&page={page}",
    pages: 1,
    card: "article",
    link: "h2 a[href*='/offres-emploi/']",
    title: "h2",
    company: "a[href*='/offres-emploi/entreprises/'].font-medium",
    location: ".fa-map-marker-alt + span",
    excerpt: "p.leading-relaxed",
  },
];

const USER_AGENT = "Mozilla/5.0 (compatible; JobiaBot/0.1; job search assistant)";
const REQUEST_DELAY_MS = 1_500;

export class PublicBoardSearcher {
  constructor(
    private readonly logger: ConnectorLogger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  static supports(source: JobSourceId): boolean {
    return PUBLIC_BOARDS.some((b) => b.id === source);
  }

  async search(source: JobSourceId, query: SearchQuery): Promise<DiscoveredOffer[]> {
    const board = PUBLIC_BOARDS.find((b) => b.id === source);
    if (!board) return [];

    const offers = new Map<string, DiscoveredOffer>();
    let first = true;
    for (const keyword of query.keywords) {
      for (let page = 1; page <= board.pages && offers.size < query.limit; page++) {
        if (!first) await sleep(jitter(REQUEST_DELAY_MS));
        first = false;
        const url = board.searchUrl.replace("{q}", encodeURIComponent(keyword)).replace("{page}", String(page));
        const html = await this.get(url);
        if (!html) break;
        const found = parseListing(board, load(html));
        if (found.length === 0) break;
        for (const offer of found) if (!offers.has(offer.externalId)) offers.set(offer.externalId, offer);
      }
      if (offers.size >= query.limit) break;
    }
    return [...offers.values()].slice(0, query.limit);
  }

  private async get(url: string): Promise<string | null> {
    try {
      const res = await this.fetchFn(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        this.logger.warn("public search: HTTP error", { url, status: res.status });
        return null;
      }
      return await res.text();
    } catch (error) {
      this.logger.warn("public search: request failed", { url, error: String(error) });
      return null;
    }
  }
}

export function parseListing(board: PublicBoardProfile, $: CheerioAPI): DiscoveredOffer[] {
  const offers: DiscoveredOffer[] = [];
  $(board.card).each((_, el) => {
    const card = $(el);
    const href = card.find(board.link).first().attr("href");
    const title = normalizeWhitespace(card.find(board.title).first().text());
    if (!href || !title) return;

    const url = new URL(href, board.baseUrl);
    url.search = ""; // drop tracking params like ?source=search
    const description = normalizeWhitespace(card.find(board.excerpt).first().text());
    const email = extractEmails(description)[0] ?? null;
    offers.push({
      source: board.id,
      externalId: url.pathname,
      url: url.toString(),
      title,
      company: normalizeWhitespace(card.find(board.company).first().text()) || "N/A",
      location: normalizeWhitespace(card.find(board.location).first().text()) || null,
      description: description || title,
      applyChannel: email ? "email" : "site_form",
      applyEmail: email,
      postedAt: null,
    });
  });
  return offers;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
