import { JobPreferencesSchema, SaveAnswersSchema } from "@jobia/shared";
import type { FastifyInstance } from "fastify";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";
import { parse } from "../../http/errors";

export async function meRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);

  app.get("/me", (request) => services.me.get(userId(request)));

  app.delete("/me", async (request, reply) => {
    await services.me.delete(userId(request));
    return reply.status(204).send();
  });

  app.get("/me/preferences", (request) => services.me.getPreferences(userId(request)));

  app.put("/me/preferences", (request) =>
    services.me.updatePreferences(userId(request), parse(JobPreferencesSchema, request.body)),
  );

  app.put("/me/answers", async (request, reply) => {
    const { answers } = parse(SaveAnswersSchema, request.body);
    await services.me.saveAnswers(userId(request), answers);
    return reply.status(204).send();
  });
}
