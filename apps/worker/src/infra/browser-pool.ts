import { chromium, type Browser, type BrowserContext } from "playwright";

export interface BrowserSession {
  context: BrowserContext;
  /** Serialised Playwright storageState (cookies + localStorage), to persist encrypted. */
  exportState(): Promise<string>;
}

/**
 * One Chromium process per worker pod, one isolated BrowserContext per
 * job. Contexts share nothing (cookies, cache, storage), so users can never
 * leak into each other's sessions.
 */
export class BrowserPool {
  private browser: Promise<Browser> | null = null;

  private launch(): Promise<Browser> {
    this.browser ??= chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
    return this.browser;
  }

  async withSession<T>(storageState: string | null, fn: (session: BrowserSession) => Promise<T>): Promise<T> {
    const browser = await this.launch();
    const context = await browser.newContext({
      storageState: storageState ? (JSON.parse(storageState) as Awaited<ReturnType<BrowserContext["storageState"]>>) : undefined,
      locale: "fr-FR",
      timezoneId: "Africa/Tunis",
      viewport: { width: 1366, height: 900 },
    });
    context.setDefaultTimeout(30_000);
    try {
      return await fn({ context, exportState: async () => JSON.stringify(await context.storageState()) });
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) await (await this.browser).close();
  }
}
