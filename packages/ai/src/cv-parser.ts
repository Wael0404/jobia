import { CandidateProfileSchema, type CandidateProfile } from "@jobia/shared";
import type { Llm } from "./llm";
import { mockParseCv } from "./mock";

export type CvDocument = { kind: "pdf"; base64: string } | { kind: "text"; text: string };

const SYSTEM = `You extract a structured candidate profile from a CV.
Rules:
- Use only information present in the CV. Never invent employers, dates, degrees or skills.
- Use null for missing optional fields.
- yearsOfExperience: total professional experience, computed from the dates (0 if none).
- targetRoles: 3 to 6 job titles this person is realistically qualified for, in the CV's language.
- searchKeywords: 5 to 12 short keywords (technologies, domains, titles) for job-board searches,
  including French and English variants when the job market is bilingual.`;

export class CvParser {
  constructor(private readonly llm: Llm) {}

  parse(doc: CvDocument): Promise<CandidateProfile> {
    const source =
      doc.kind === "pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } } as const)
        : ({ type: "text", text: `<cv>\n${doc.text}\n</cv>` } as const);

    return this.llm.structured({
      system: SYSTEM,
      content: [source, { type: "text", text: "Extract the candidate profile from this CV." }],
      schema: CandidateProfileSchema,
      effort: "medium",
      mock: () => mockParseCv(doc),
    });
  }
}
