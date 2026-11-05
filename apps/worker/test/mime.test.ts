import { describe, expect, it } from "vitest";
import { buildMime } from "../src/infra/gmail";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("buildMime", () => {
  const mail = {
    from: { name: "Wael Hanfi", email: "wael@example.com" },
    to: "rh@acme.tn",
    subject: "Candidature — Développeur Full-Stack",
    text: "Bonjour,\nveuillez trouver mon CV ci-joint.",
    attachment: { fileName: "cv.pdf", mimeType: "application/pdf", content: Buffer.from("%PDF-1.7") },
  };

  it("encodes non-ASCII subjects (RFC 2047) and attaches the CV", () => {
    const mime = decode(buildMime(mail));
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain('Content-Disposition: attachment; filename="cv.pdf"');
    expect(mime).toContain(Buffer.from("%PDF-1.7").toString("base64"));
  });

  it("prevents header injection through user-controlled fields", () => {
    const mime = decode(buildMime({ ...mail, to: "rh@acme.tn\r\nBcc: victim@evil.com" }));
    expect(mime).not.toMatch(/^Bcc:/m);
  });
});
