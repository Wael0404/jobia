import { and, cvs, eq, users, type Database } from "@jobia/db";
import { JobPreferencesSchema, type JobPreferences, type MeResponse } from "@jobia/shared";
import { NotFound } from "../../http/errors";

export class MeService {
  constructor(private readonly db: Database) {}

  async get(userId: string): Promise<MeResponse> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        agentMode: users.agentMode,
        plan: users.plan,
        planSelectedAt: users.planSelectedAt,
        cvId: cvs.id,
      })
      .from(users)
      .leftJoin(cvs, and(eq(cvs.userId, users.id), eq(cvs.isActive, true), eq(cvs.status, "ready")))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw NotFound("User");
    const { cvId, planSelectedAt, ...user } = row;
    return { ...user, hasCv: cvId !== null, planSelected: planSelectedAt !== null };
  }

  async getPreferences(userId: string): Promise<JobPreferences> {
    const [row] = await this.db
      .select({ preferences: users.preferences, agentMode: users.agentMode })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw NotFound("User");
    return JobPreferencesSchema.parse({ ...(row.preferences ?? {}), agentMode: row.agentMode });
  }

  async updatePreferences(userId: string, preferences: JobPreferences): Promise<JobPreferences> {
    await this.db
      .update(users)
      .set({ preferences, agentMode: preferences.agentMode })
      .where(eq(users.id, userId));
    return preferences;
  }

  async saveAnswers(userId: string, answers: Record<string, string>): Promise<void> {
    const [row] = await this.db.select({ saved: users.savedAnswers }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw NotFound("User");
    await this.db.update(users).set({ savedAnswers: { ...row.saved, ...answers } }).where(eq(users.id, userId));
  }

  /** GDPR: hard delete. Cascades remove CVs, integrations, applications and tokens. */
  async delete(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId));
  }
}
