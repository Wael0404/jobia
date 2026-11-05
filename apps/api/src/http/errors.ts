import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError, type z } from "zod";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const NotFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const Unauthorized = (msg = "Authentication required") => new AppError(401, "unauthorized", msg);
export const Conflict = (msg: string) => new AppError(409, "conflict", msg);
export const BadRequest = (msg: string) => new AppError(400, "bad_request", msg);

/** Validates untrusted input. Throws a ZodError, mapped to HTTP 400 by the error handler. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof ZodError) {
    void reply.status(400).send({
      error: "validation_error",
      message: "Invalid request",
      details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({ error: error.code, message: error.message });
    return;
  }
  const status = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
  if (status >= 500) request.log.error({ err: error }, "unhandled error");
  void reply.status(status).send({
    error: status >= 500 ? "internal_error" : "request_error",
    message: status >= 500 ? "Something went wrong" : error.message,
  });
}
