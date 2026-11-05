import type { FastifyInstance } from "fastify";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";

export async function reportsRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);
  app.get("/reports/summary", (request) => services.reports.summary(userId(request)));
}
