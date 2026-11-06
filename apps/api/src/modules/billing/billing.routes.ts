import { ChoosePlanSchema } from "@jobia/shared";
import type { FastifyInstance } from "fastify";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";
import { parse } from "../../http/errors";

export async function billingRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);

  app.get("/billing", (request) => services.billing.status(userId(request)));

  app.post("/billing/plan", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, (request) =>
    services.billing.choose(userId(request), parse(ChoosePlanSchema, request.body).plan),
  );
}
