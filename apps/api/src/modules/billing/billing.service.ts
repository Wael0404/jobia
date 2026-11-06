import { eq, users, type Database } from "@jobia/db";
import { PLANS, type BillingStatusDto, type PlanId } from "@jobia/shared";
import type { Redis } from "ioredis";
import { AppError, NotFound } from "../../http/errors";

/** Redis keys shared with the worker, which increments them. */
const today = (): string => new Date().toISOString().slice(0, 10);
export const usageKeys = {
  applications: (userId: string, day: string = today()) => `quota:${day}:${userId}`,
  matches: (userId: string, day: string = today()) => `matches:${day}:${userId}`,
};

/**
 * Subscription plans. Payment is not integrated yet: in test mode a paid
 * plan is activated immediately; otherwise only the free plan can be chosen.
 */
export class BillingService {
  constructor(
    private readonly db: Database,
    private readonly redis: Redis,
    private readonly testMode: boolean,
  ) {}

  async status(userId: string): Promise<BillingStatusDto> {
    const [row] = await this.db
      .select({ plan: users.plan, planSelectedAt: users.planSelectedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw NotFound("User");
    const [applications, matches] = await this.redis.mget(usageKeys.applications(userId), usageKeys.matches(userId));
    return {
      plan: row.plan,
      planSelected: row.planSelectedAt !== null,
      testMode: this.testMode,
      usage: { applicationsToday: Math.max(0, Number(applications ?? 0)), matchesToday: Math.max(0, Number(matches ?? 0)) },
    };
  }

  async choose(userId: string, plan: PlanId): Promise<BillingStatusDto> {
    if (PLANS[plan].priceTnd > 0 && !this.testMode) {
      throw new AppError(402, "payment_required", "Le paiement en ligne arrive bientôt : seul le forfait gratuit est disponible.");
    }
    await this.db.update(users).set({ plan, planSelectedAt: new Date() }).where(eq(users.id, userId));
    return this.status(userId);
  }
}
