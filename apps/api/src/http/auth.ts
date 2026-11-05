import type { FastifyReply, FastifyRequest } from "fastify";
import { Unauthorized } from "./errors";

export interface AccessTokenClaims {
  sub: string;
  email: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

/**
 * Stateless authentication: verifying a short-lived JWT needs no database
 * or Redis round-trip, which is what lets the API scale horizontally to
 * 100k+ concurrent sessions.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw Unauthorized();
  }
}

export function userId(request: FastifyRequest): string {
  return request.user.sub;
}
