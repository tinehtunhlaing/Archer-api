import { Router } from "express";
import { z } from "zod";
import { createAccessToken, hashPassword, requireAuth, verifyPassword } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../http.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
  role: z.enum(["CLIENT", "FREELANCER"]),
  displayName: z.string().trim().min(1).max(80),
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

authRouter.post("/register", asyncHandler(async (request, response) => {
  const input = registerSchema.parse(request.body);
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "An account with this email already exists", "EMAIL_IN_USE");
  }
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      profile: { create: { displayName: input.displayName } },
    },
    select: { id: true, email: true, role: true, profile: true, createdAt: true },
  });
  response.status(201).json({
    data: { user, accessToken: createAccessToken({ id: user.id, role: input.role }), tokenType: "Bearer" },
  });
}));

authRouter.post("/login", asyncHandler(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
  }
  response.json({
    data: {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken: createAccessToken({ id: user.id, role: user.role as "CLIENT" | "FREELANCER" | "ADMIN" }),
      tokenType: "Bearer",
    },
  });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: request.auth!.userId },
    select: { id: true, email: true, role: true, profile: true, createdAt: true },
  });
  if (!user) throw new HttpError(401, "Account no longer exists", "UNAUTHENTICATED");
  response.json({ data: user });
}));
