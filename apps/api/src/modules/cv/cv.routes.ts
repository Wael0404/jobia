import { ConfirmCvUploadSchema, CreateCvUploadSchema } from "@jobia/shared";
import type { FastifyInstance } from "fastify";
import type { Container } from "../../container";
import { requireAuth, userId } from "../../http/auth";
import { parse } from "../../http/errors";

export async function cvRoutes(app: FastifyInstance, { services }: Container): Promise<void> {
  app.addHook("onRequest", requireAuth);

  app.post("/cvs/uploads", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, (request) =>
    services.cv.createUpload(userId(request), parse(CreateCvUploadSchema, request.body)),
  );

  app.post("/cvs/confirm", (request) => {
    const { cvId } = parse(ConfirmCvUploadSchema, request.body);
    return services.cv.confirmUpload(userId(request), cvId);
  });

  app.get("/cvs/latest", (request) => services.cv.latest(userId(request)));
}
