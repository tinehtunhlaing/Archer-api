import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, pathParam } from "../http.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  headline: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
}).strict();

function serializeProfile<T extends { skills: string }>(profile: T) {
  const { skills, ...rest } = profile;
  let parsedSkills: string[] = [];
  try { parsedSkills = JSON.parse(skills) as string[]; } catch { /* legacy empty skills */ }
  return { ...rest, skills: parsedSkills };
}

profileRouter.get("/me", asyncHandler(async (request, response) => {
  const profile = await prisma.profile.findUnique({ where: { userId: request.auth!.userId } });
  if (!profile) throw new HttpError(404, "Profile not found", "PROFILE_NOT_FOUND");
  response.json({ data: serializeProfile(profile) });
}));

profileRouter.put("/me", asyncHandler(async (request, response) => {
  const input = profileSchema.parse(request.body);
  const { skills, ...fields } = input;
  const profile = await prisma.profile.upsert({
    where: { userId: request.auth!.userId },
    create: { userId: request.auth!.userId, ...fields, skills: JSON.stringify(skills ?? []) },
    update: { ...fields, ...(skills ? { skills: JSON.stringify(skills) } : {}) },
  });
  response.json({ data: serializeProfile(profile) });
}));

profileRouter.get("/:userId", asyncHandler(async (request, response) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: pathParam(request, "userId") },
  });
  if (!profile) throw new HttpError(404, "Profile not found", "PROFILE_NOT_FOUND");
  const user = await prisma.user.findUnique({ where: { id: profile.userId }, select: { role: true, createdAt: true } });
  if (!user) throw new HttpError(404, "Profile not found", "PROFILE_NOT_FOUND");
  response.json({ data: { ...serializeProfile(profile), role: user.role, memberSince: user.createdAt } });
}));
