import { describe, expect, it } from "vitest";
import { extractEmails, looksLikeJobPost } from "../src/text";

describe("extractEmails", () => {
  it("extracts and de-duplicates recruiter emails", () => {
    const text = "Nous recrutons ! Envoyez votre CV à RH@Acme.tn ou rh@acme.tn. Merci.";
    expect(extractEmails(text)).toEqual(["rh@acme.tn"]);
  });

  it("ignores platform addresses", () => {
    expect(extractEmails("contact: noreply@linkedin.com")).toEqual([]);
  });
});

describe("looksLikeJobPost", () => {
  it("detects French, English and Arabic hiring posts", () => {
    expect(looksLikeJobPost("Nous recrutons un développeur")).toBe(true);
    expect(looksLikeJobPost("Bonne année à tous")).toBe(false);
    expect(looksLikeJobPost("Recrutement: développeur React")).toBe(true);
    expect(looksLikeJobPost("We're hiring a DevOps engineer")).toBe(true);
    expect(looksLikeJobPost("مطلوب مهندس برمجيات")).toBe(true);
  });
});
