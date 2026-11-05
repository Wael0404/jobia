import { z } from "zod";

/**
 * Structured representation of a CV, produced by the AI CV parser and
 * used by the matcher, the cover-letter writer and the form-filling agent.
 */
export const CandidateProfileSchema = z.object({
  fullName: z.string(),
  headline: z.string().describe("One-line professional title, e.g. 'Senior Full-Stack Engineer'"),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string(),
  yearsOfExperience: z.number(),
  skills: z.array(z.string()),
  languages: z.array(z.object({ name: z.string(), level: z.string() })),
  experiences: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      description: z.string(),
    }),
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      school: z.string(),
      year: z.string().nullable(),
    }),
  ),
  targetRoles: z.array(z.string()).describe("Job titles this candidate should apply to"),
  searchKeywords: z.array(z.string()).describe("Keywords to use on job boards"),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
