import { integrationProviderEnum } from "@jobia/db";
import { ConnectBoardSchema } from "@jobia/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";
import { parse } from "../../http/errors";

const ProviderParamSchema = z.object({ provider: z.enum(integrationProviderEnum.enumValues) });

export async function integrationsRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);

  app.get("/integrations", (request) => services.integrations.list(userId(request)));

  app.post("/integrations/boards", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    await services.integrations.connectBoard(userId(request), parse(ConnectBoardSchema, request.body));
    return reply.status(202).send();
  });

  app.delete("/integrations/:provider", async (request, reply) => {
    const { provider } = parse(ProviderParamSchema, request.params);
    await services.integrations.disconnect(userId(request), provider);
    return reply.status(204).send();
  });
}
