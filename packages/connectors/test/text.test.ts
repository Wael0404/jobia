import { describe, expect, it } from "vitest";
import { extractEmails, isRecruitmentCandidateEmail, looksLikeJobPost } from "../src/text";

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

describe("isRecruitmentCandidateEmail", () => {
  it("keeps HR and general application addresses", () => {
    expect(isRecruitmentCandidateEmail("rh@acme.tn")).toBe(true);
    expect(isRecruitmentCandidateEmail("recrutement@acme.tn")).toBe(true);
    expect(isRecruitmentCandidateEmail("contact@acme.tn")).toBe(true);
  });

  it("rejects addresses that never receive applications", () => {
    expect(isRecruitmentCandidateEmail("noreply@acme.tn")).toBe(false);
    expect(isRecruitmentCandidateEmail("no-reply@acme.tn")).toBe(false);
    expect(isRecruitmentCandidateEmail("sales@acme.tn")).toBe(false);
    expect(isRecruitmentCandidateEmail("broken@localhost")).toBe(false);
  });
});
