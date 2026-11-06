import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { sql } from "@jobia/db";
import Fastify, { type FastifyInstance } from "fastify";
import type { Container } from "./container";
import { errorHandler } from "./http/errors";
import { applicationsRoutes } from "./modules/applications/applications.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { cvRoutes } from "./modules/cv/cv.routes";
import { integrationsRoutes } from "./modules/integrations/integrations.routes";
import { meRoutes } from "./modules/me/me.routes";
import { reportsRoutes } from "./modules/reports/reports.routes";
import { agentRoutes } from "./modules/agent/agent.routes";
import { billingRoutes } from "./modules/billing/billing.routes";

export async function buildApp(container: Container): Promise<FastifyInstance> {
  const { config } = container;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.body.password", "req.body.refreshToken"],
    },
    trustProxy: true,
    bodyLimit: 256 * 1024,
    requestIdHeader: "x-request-id",
  });

  app.setErrorHandler(errorHandler);
  await app.register(helmet);
  // @fastify/cors only allows GET/HEAD/POST by default: list every verb the clients use.
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_TTL_SECONDS, iss: "jobia" },
    verify: { allowedIss: "jobia" },
  });
  // Shared Redis store: limits hold across every API replica.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis: container.redis,
    keyGenerator: (req) => req.headers.authorization ?? req.ip,
  });

  app.get("/health/live", { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.get("/health/ready", { config: { rateLimit: false } }, async () => {
    await Promise.all([container.db.execute(sql`select 1`), container.redis.ping()]);
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      for (const routes of [authRoutes, meRoutes, cvRoutes, integrationsRoutes, applicationsRoutes, reportsRoutes, agentRoutes, billingRoutes]) {
        await v1.register(async (scope) => routes(scope, container));
      }
    },
    { prefix: "/v1" },
  );

  return app;
}
