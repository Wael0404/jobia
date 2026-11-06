import type { FastifyInstance } from "fastify";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";

export async function agentRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);

  app.get("/agent/search", (request) => services.agent.status(userId(request)));

  app.post("/agent/search", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, (request) =>
    services.agent.startSearch(userId(request)),
  );
}
