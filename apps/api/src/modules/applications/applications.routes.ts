import { ListApplicationsQuerySchema } from "@jobia/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";
import { parse } from "../../http/errors";

const IdParamSchema = z.object({ id: z.string().uuid() });

export async function applicationsRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);
  const svc = services.applications;

  app.get("/applications", (request) => svc.list(userId(request), parse(ListApplicationsQuerySchema, request.query)));

  app.get("/applications/:id", (request) => svc.get(userId(request), parse(IdParamSchema, request.params).id));

  const action = (fn: (uid: string, id: string) => Promise<void>) => async (request: FastifyRequest, reply: FastifyReply) => {
    await fn(userId(request), parse(IdParamSchema, request.params).id);
    return reply.status(202).send();
  };

  app.post("/applications/:id/approve", action((u, id) => svc.approve(u, id)));
  app.post("/applications/:id/retry", action((u, id) => svc.retry(u, id)));
  app.post("/applications/:id/withdraw", action((u, id) => svc.withdraw(u, id)));
}
