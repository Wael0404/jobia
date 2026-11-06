import {
  and,
  applicationEvents,
  applications,
  asc,
  desc,
  eq,
  jobOffers,
  lt,
  or,
  transitionApplication,
  type Database,
} from "@jobia/db";
import { jobId, type TypedQueue } from "@jobia/queue";
import type { ApplicationDetailDto, ApplicationDto, ListApplicationsQuery, Page } from "@jobia/shared";
import { Conflict, NotFound } from "../../http/errors";

/** Cursor = base64url("<updatedAt ISO>|<id>") — stable keyset pagination, no OFFSET scans. */
const encodeCursor = (updatedAt: Date, id: string) => Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const updatedAt = new Date(iso ?? "");
  return id && !Number.isNaN(updatedAt.getTime()) ? { updatedAt, id } : null;
}

export class ApplicationsService {
  constructor(
    private readonly db: Database,
    private readonly submitQueue: TypedQueue<"submit">,
  ) {}

  async list(userId: string, query: ListApplicationsQuery): Promise<Page<ApplicationDto>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.db
      .select({ app: applications, job: jobOffers })
      .from(applications)
      .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
      .where(
        and(
          eq(applications.userId, userId),
          query.status ? eq(applications.status, query.status) : undefined,
          query.source ? eq(jobOffers.source, query.source) : undefined,
          cursor
            ? or(
                lt(applications.updatedAt, cursor.updatedAt),
                and(eq(applications.updatedAt, cursor.updatedAt), lt(applications.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(applications.updatedAt), desc(applications.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ app, job }) => this.toDto(app, job, app.lastError)),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.app.updatedAt, last.app.id) : null,
    };
  }

  async get(userId: string, applicationId: string): Promise<ApplicationDetailDto> {
    const [row] = await this.db
      .select({ app: applications, job: jobOffers })
      .from(applications)
      .innerJoin(jobOffers, eq(jobOffers.id, applications.jobOfferId))
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .limit(1);
    if (!row) throw NotFound("Application");

    const events = await this.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(asc(applicationEvents.occurredAt))
      .limit(200);

    return {
      ...this.toDto(row.app, row.job, events.at(-1)?.message ?? null),
      coverLetter: row.app.coverLetter,
      matchReasons: row.app.matchReasons,
      pendingQuestions: row.app.pendingQuestions,
      events: events.map((e) => ({
        id: e.id,
        actor: e.actor,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        message: e.message,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  }

  /** Review mode: the user approves a proposed application → it goes to the submit queue. */
  approve(userId: string, applicationId: string) {
    return this.requeue(userId, applicationId, "Candidature approuvée par l'utilisateur");
  }

  /** After a captcha / missing answers / transient failure, the user asks the agent to try again. */
  retry(userId: string, applicationId: string) {
    return this.requeue(userId, applicationId, "Nouvelle tentative demandée");
  }

  /** The user applied on LinkedIn themselves (Easy Apply offer with no recruiter email). */
  async markApplied(userId: string, applicationId: string): Promise<void> {
    const result = await transitionApplication(this.db, {
      applicationId,
      userId,
      to: "submitted",
      actor: "user",
      message: "Candidature envoyée par vous sur LinkedIn",
      patch: { submittedAt: new Date(), appliedVia: "easy_apply" },
    });
    if (!result.applied) throw Conflict("This application is not waiting for you to apply");
  }

  async withdraw(userId: string, applicationId: string): Promise<void> {
    const result = await transitionApplication(this.db, {
      applicationId,
      userId,
      to: "withdrawn",
      actor: "user",
      message: "Candidature retirée par l'utilisateur",
    });
    if (!result.applied) throw Conflict("This application can no longer be withdrawn");
  }

  private async requeue(userId: string, applicationId: string, message: string): Promise<void> {
    const result = await transitionApplication(this.db, {
      applicationId,
      userId,
      to: "queued",
      actor: "user",
      message,
      patch: { pendingQuestions: [], lastError: null },
    });
    if (!result.applied) throw Conflict("This application cannot be (re)submitted in its current state");
    const payload = { userId, applicationId };
    // Attempt-specific id: a previous completed job with the same id must not swallow the retry.
    await this.submitQueue.add("submit", payload, { jobId: `${jobId.submit(payload)}-${Date.now()}` });
  }

  private toDto(
    app: typeof applications.$inferSelect,
    job: typeof jobOffers.$inferSelect,
    lastEvent: string | null,
  ): ApplicationDto {
    return {
      id: app.id,
      status: app.status,
      source: job.source,
      matchScore: app.matchScore,
      appliedVia: app.appliedVia,
      job: { title: job.title, company: job.company, location: job.location, url: job.url },
      submittedAt: app.submittedAt?.toISOString() ?? null,
      updatedAt: app.updatedAt.toISOString(),
      lastEvent,
    };
  }
}
