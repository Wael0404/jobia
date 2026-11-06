import { dailyUsage, eq, users, type Database } from "@jobia/db";
import { PLANS, type BillingStatusDto, type PlanId } from "@jobia/shared";
import { AppError, NotFound } from "../../http/errors";

/**
 * Subscription plans. Payment is not integrated yet: in test mode a paid
 * plan is activated immediately; otherwise only the free plan can be chosen.
 */
export class BillingService {
  constructor(
    private readonly db: Database,
    private readonly testMode: boolean,
  ) {}

  async status(userId: string): Promise<BillingStatusDto> {
    const [row] = await this.db
      .select({ plan: users.plan, planSelectedAt: users.planSelectedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw NotFound("User");
    return {
      plan: row.plan,
      planSelected: row.planSelectedAt !== null,
      testMode: this.testMode,
      // Computed from the applications table, so it is always consistent with the dashboard.
      usage: await dailyUsage(this.db, userId),
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
