import type { Redis } from "ioredis";

/**
 * Daily application caps, per user and per (user, source). Protects the
 * users' accounts on third-party platforms and our reputation with
 * employers. Uses an atomic INCR + EXPIRE, so it holds across all workers.
 */
export class DailyQuota {
  constructor(
    private readonly redis: Redis,
    private readonly limits: { perUser: number; perSource: number },
  ) {}

  private static day(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Reserves one slot; returns false (and releases nothing) if a cap is already reached. */
  async tryConsume(userId: string, source: string, userCap = this.limits.perUser): Promise<boolean> {
    const day = DailyQuota.day();
    const userKey = `quota:${day}:${userId}`;
    const sourceKey = `quota:${day}:${userId}:${source}`;
    const [[, userCount], [, sourceCount]] = (await this.redis
      .multi()
      .incr(userKey)
      .incr(sourceKey)
      .expire(userKey, 2 * 86_400)
      .expire(sourceKey, 2 * 86_400)
      .exec()) as [[null, number], [null, number]];

    if (userCount > Math.min(userCap, this.limits.perUser) || sourceCount > this.limits.perSource) {
      await this.redis.multi().decr(userKey).decr(sourceKey).exec();
      return false;
    }
    return true;
  }

  async release(userId: string, source: string): Promise<void> {
    const day = DailyQuota.day();
    await this.redis.multi().decr(`quota:${day}:${userId}`).decr(`quota:${day}:${userId}:${source}`).exec();
  }
}
