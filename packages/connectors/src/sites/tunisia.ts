import type { BoardProfile } from "./board";

/**
 * Profiles for the main Tunisian job boards.
 *
 * ⚠️  The selectors below are a starting point and MUST be validated against
 * the live websites (run `pnpm --filter @jobia/worker smoke <site>`) before
 * enabling a board in production: boards change their markup without notice.
 * Also check each site's terms of use / robots.txt and, where available,
 * prefer an official partner API or RSS feed over browser automation.
 */
export const TANITJOBS: BoardProfile = {
  id: "tanitjobs",
  displayName: "Tanitjobs",
  baseUrl: "https://www.tanitjobs.com",
  minActionDelayMs: 3_000,
  login: {
    url: "https://www.tanitjobs.com/login/",
    user: "input[name=username], input[type=email]",
    password: "input[name=password]",
    submit: "form button[type=submit], form input[type=submit]",
    loggedInMarker: "a[href*='logout'], a[href*='my-account']",
    errorMarker: ".alert-danger, .error",
  },
  search: {
    urlTemplate: "https://www.tanitjobs.com/jobs/?keywords={q}&page={page}",
    pages: 2,
    card: "article.listing-item, .listing-item",
    link: "a.link, h2 a, a[href*='/job/']",
    title: ".listing-item__title, h2",
    company: ".listing-item__info--item-company, .company",
    location: ".listing-item__info--item-location, .location",
  },
  offer: {
    description: ".details-body__content, .job-description",
    applyButton: "a[href*='apply'], button.apply, .btn-apply",
    form: "form#apply-form, form[action*='apply']",
    cvInput: "input[type=file]",
    coverLetterInput: "textarea",
    submit: "button[type=submit], input[type=submit]",
    successMarker: ".alert-success, .success",
    alreadyAppliedMarker: ".already-applied",
  },
};

export const KEEJOB: BoardProfile = {
  id: "keejob",
  displayName: "Keejob",
  baseUrl: "https://www.keejob.com",
  minActionDelayMs: 3_000,
  login: {
    url: "https://www.keejob.com/login/",
    user: "input[name=username], input[name=email]",
    password: "input[name=password]",
    submit: "form button[type=submit]",
    loggedInMarker: "a[href*='logout'], a[href*='deconnexion']",
    errorMarker: ".alert-danger, .errorlist",
  },
  search: {
    urlTemplate: "https://www.keejob.com/offres-emploi/?keywords={q}&page={page}",
    pages: 2,
    card: "div.block_white_a, article.job",
    link: "a[href*='/offres-emploi/']",
    title: "h6 a, h2 a",
    company: "a[href*='/entreprise/'], .company",
  },
  offer: {
    description: ".block_a, .job-description",
    applyButton: "a[href*='postuler'], .btn-apply",
    form: "form[action*='postuler'], form#apply",
    cvInput: "input[type=file]",
    coverLetterInput: "textarea",
    submit: "button[type=submit], input[type=submit]",
    successMarker: ".alert-success",
  },
};

export const EMPLOI_TUNISIE: BoardProfile = {
  id: "emploitunisie",
  displayName: "Emploitunisie",
  baseUrl: "https://www.emploitunisie.com",
  minActionDelayMs: 3_000,
  login: {
    url: "https://www.emploitunisie.com/user/login",
    user: "input[name=name], input[type=email]",
    password: "input[name=pass]",
    submit: "form#user-login input[type=submit], form button[type=submit]",
    loggedInMarker: "a[href*='/user/logout']",
    errorMarker: ".messages--error, .alert-danger",
  },
  search: {
    urlTemplate: "https://www.emploitunisie.com/recherche-jobs-tunisie/{q}?page={page}",
    pages: 2,
    card: ".card-job, .job-description-wrapper",
    link: "h3 a, a[href*='/offre-emploi-tunisie/']",
    title: "h3",
    company: ".card-job-company, .company-name",
    location: ".card-job-location, .location",
  },
  offer: {
    description: ".job-description, .content",
    applyButton: "a[href*='postuler'], .btn-apply",
    form: "form[id*='apply'], form[action*='postuler']",
    cvInput: "input[type=file]",
    coverLetterInput: "textarea",
    submit: "input[type=submit], button[type=submit]",
    successMarker: ".messages--status, .alert-success",
  },
};
