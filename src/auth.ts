import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { HttpError } from "./http.js";

export const roles = ["CLIENT", "FREELANCER", "ADMIN"] as const;
export type Role = (typeof roles)[number];

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

const jwtPayloadSchema = z.object({ sub: z.string(), role: z.enum(roles) });

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN as Exclude<jwt.SignOptions["expiresIn"], undefined>,
    issuer: "archer-api",
    audience: "archer-clients",
  });
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    next(new HttpError(401, "Authentication required", "UNAUTHENTICATED"));
    return;
  }
  try {
    const decoded = jwt.verify(authorization.slice(7), config.JWT_SECRET, {
      issuer: "archer-api",
      audience: "archer-clients",
    });
    const payload = jwtPayloadSchema.parse(decoded);
    request.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired access token", "UNAUTHENTICATED"));
  }
}

export function requireRole(...allowedRoles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      next(new HttpError(403, "You do not have permission to perform this action", "FORBIDDEN"));
      return;
    }
    next();
  };
}
