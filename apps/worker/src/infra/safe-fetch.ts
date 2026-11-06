import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

/**
 * URLs coming from the web (here: reported by the LLM) must never reach our
 * private network (Redis, Postgres, MinIO, cloud metadata…): SSRF guard.
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
  if (url.username || url.password) throw new Error("Credentials in URL");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("Private address");
  return url;
}

/** Fetches a public web page as text (size- and time-bounded, redirects re-checked). */
export async function fetchPublicText(raw: string, redirectsLeft = 3): Promise<string> {
  const url = await assertPublicUrl(raw);
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "JobiaBot/1.0 (+contact verification)", accept: "text/html,text/plain" },
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location || redirectsLeft === 0) throw new Error("Too many redirects");
    return fetchPublicText(new URL(location, url).toString(), redirectsLeft - 1);
  }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
