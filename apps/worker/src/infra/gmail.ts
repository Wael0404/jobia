import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import type { InboundEmail } from "@jobia/ai";

export interface OutgoingEmail {
  from: { name: string; email: string };
  to: string;
  subject: string;
  text: string;
  attachment: { fileName: string; mimeType: string; content: Buffer };
}

export class GmailAuthError extends Error {}

/** Gmail API client acting on behalf of ONE user (their own mailbox, their own refresh token). */
export class GmailMailbox {
  private readonly api: gmail_v1.Gmail;

  constructor(clientId: string, clientSecret: string, refreshToken: string) {
    const auth = new OAuth2Client({ clientId, clientSecret });
    auth.setCredentials({ refresh_token: refreshToken });
    this.api = gmail({ version: "v1", auth });
  }

  async send(mail: OutgoingEmail): Promise<{ messageId: string; threadId: string }> {
    const res = await this.call(() =>
      this.api.users.messages.send({ userId: "me", requestBody: { raw: buildMime(mail) } }),
    );
    if (!res.data.id || !res.data.threadId) throw new Error("Gmail send returned no id");
    return { messageId: res.data.id, threadId: res.data.threadId };
  }

  /** Current mailbox cursor, used to start incremental sync. */
  async currentHistoryId(): Promise<string> {
    const res = await this.call(() => this.api.users.getProfile({ userId: "me" }));
    return res.data.historyId ?? "0";
  }

  /**
   * Incremental sync: ids of messages added to INBOX since `historyId`.
   * Returns `null` when the cursor is too old (HTTP 404) → caller resets it.
   */
  async newInboxMessageIds(historyId: string): Promise<{ ids: string[]; historyId: string } | null> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latest = historyId;
    try {
      do {
        const res = await this.call(() =>
          this.api.users.history.list({
            userId: "me",
            startHistoryId: historyId,
            historyTypes: ["messageAdded"],
            labelId: "INBOX",
            pageToken,
          }),
        );
        for (const h of res.data.history ?? []) {
          for (const added of h.messagesAdded ?? []) if (added.message?.id) ids.add(added.message.id);
        }
        latest = res.data.historyId ?? latest;
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken && ids.size < 500);
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
    return { ids: [...ids], historyId: latest };
  }

  async read(messageId: string): Promise<InboundEmail> {
    const res = await this.call(() => this.api.users.messages.get({ userId: "me", id: messageId, format: "full" }));
    const headers = new Map((res.data.payload?.headers ?? []).map((h) => [h.name?.toLowerCase(), h.value ?? ""]));
    return {
      messageId,
      threadId: res.data.threadId ?? "",
      from: headers.get("from") ?? "",
      subject: headers.get("subject") ?? "",
      receivedAt: new Date(Number(res.data.internalDate ?? Date.now())).toISOString(),
      text: extractText(res.data.payload) || res.data.snippet || "",
    };
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const msg = String((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? "");
      if (msg === "invalid_grant") throw new GmailAuthError("Google access revoked by the user");
      throw error;
    }
  }
}

function extractText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const text = extractText(child);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url")
      .toString("utf8")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }
  return "";
}

/** RFC 2822 multipart message, UTF-8 safe headers (RFC 2047). */
export function buildMime(mail: OutgoingEmail): string {
  const boundary = `jobia_${randomUUID()}`;
  const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);
  const sanitize = (v: string) => v.replace(/[\r\n]+/g, " ");
  const wrap = (b64: string) => b64.replace(/.{76}/g, "$&\r\n");

  const lines = [
    `From: ${encodeHeader(sanitize(mail.from.name))} <${sanitize(mail.from.email)}>`,
    `To: ${sanitize(mail.to)}`,
    `Subject: ${encodeHeader(sanitize(mail.subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(Buffer.from(mail.text, "utf8").toString("base64")),
    `--${boundary}`,
    `Content-Type: ${mail.attachment.mimeType}; name="${encodeHeader(sanitize(mail.attachment.fileName))}"`,
    `Content-Disposition: attachment; filename="${encodeHeader(sanitize(mail.attachment.fileName))}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap(mail.attachment.content.toString("base64")),
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
