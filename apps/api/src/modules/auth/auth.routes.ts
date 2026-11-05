import { ExchangeCodeSchema, GoogleStartQuerySchema, RefreshRequestSchema } from "@jobia/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Container } from "../../container";
import { parse } from "../../http/errors";

const CallbackQuerySchema = z.object({ code: z.string(), state: z.string() });

export async function authRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  const sign = (claims: { sub: string; email: string }) => app.jwt.sign(claims);
  const strict = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.get("/auth/google/start", strict, async (request, reply) => {
    const { redirect } = parse(GoogleStartQuerySchema, request.query);
    return reply.redirect(await services.auth.start(redirect));
  });

  app.get("/auth/google/callback", strict, async (request, reply) => {
    const { code, state } = parse(CallbackQuerySchema, request.query);
    return reply.redirect(await services.auth.callback(code, state));
  });

  app.post("/auth/exchange", strict, async (request) => {
    const { code } = parse(ExchangeCodeSchema, request.body);
    return services.auth.exchange(code, sign);
  });

  app.post("/auth/refresh", strict, async (request) => {
    const { refreshToken } = parse(RefreshRequestSchema, request.body);
    return services.auth.refresh(refreshToken, sign);
  });

  app.post("/auth/logout", async (request, reply) => {
    const { refreshToken } = parse(RefreshRequestSchema, request.body);
    await services.auth.logout(refreshToken);
    return reply.status(204).send();
  });
}
