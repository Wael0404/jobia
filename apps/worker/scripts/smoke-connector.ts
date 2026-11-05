/**
 * Manual smoke test for a connector against the LIVE website, with a test
 * account. Run before enabling / after updating a board profile:
 *
 *   SMOKE_LOGIN=… SMOKE_PASSWORD=… pnpm --filter @jobia/worker smoke tanitjobs "développeur"
 *
 * It logs in and runs a search; it never submits an application.
 */
import { ConnectorRegistry } from "@jobia/connectors";
import type { JobSourceId } from "@jobia/shared";
import { chromium } from "playwright";

const [source = "tanitjobs", keyword = "développeur"] = process.argv.slice(2);
const registry = new ConnectorRegistry({ linkedinEnabled: true });
const connector = registry.get(source as JobSourceId);
if (!connector) throw new Error(`Unknown connector ${source}`);

const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });
const page = await (await browser.newContext({ locale: "fr-FR" })).newPage();
const ctx = {
  page,
  credentials:
    process.env.SMOKE_LOGIN && process.env.SMOKE_PASSWORD
      ? { login: process.env.SMOKE_LOGIN, password: process.env.SMOKE_PASSWORD }
      : null,
  logger: { info: console.log, warn: console.warn },
};

try {
  console.log("login:", await connector.login(ctx));
  const offers = await connector.search(ctx, {
    keywords: [keyword],
    location: null,
    countryCode: "TN",
    remoteOk: true,
    postedWithinDays: 14,
    limit: 5,
  });
  console.table(offers.map((o) => ({ title: o.title, company: o.company, channel: o.applyChannel, url: o.url })));
} finally {
  await browser.close();
}
