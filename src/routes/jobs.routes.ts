import { Router } from "express";
import { z } from "zod";
import { optionalAuth, requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, pathParam } from "../http.js";

export const jobsRouter = Router();

const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/, "Enter a positive decimal amount with up to four fractional digits");
const createJobSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(30).max(10000),
  budgetType: z.enum(["FIXED", "HOURLY"]),
  budgetMin: amount.optional(),
  budgetMax: amount.optional(),
  currency: z.enum(["USD", "MMK"]),
}).strict().superRefine((value, context) => {
  if ((value.budgetMin && !value.budgetMax) || (!value.budgetMin && value.budgetMax)) {
    context.addIssue({ code: "custom", message: "Provide both budgetMin and budgetMax, or neither", path: ["budgetMin"] });
  }
  if (value.budgetMin && value.budgetMax && decimalUnits(value.budgetMin) > decimalUnits(value.budgetMax)) {
    context.addIssue({ code: "custom", message: "budgetMin cannot exceed budgetMax", path: ["budgetMin"] });
  }
});

function decimalUnits(value: string): bigint {
  const [whole = "0", fractional = ""] = value.split(".");
  return BigInt(whole) * 10_000n + BigInt(fractional.padEnd(4, "0"));
}

jobsRouter.get("/", asyncHandler(async (request, response) => {
  const query = z.object({
    q: z.string().trim().max(100).optional(),
    currency: z.enum(["USD", "MMK"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }).parse(request.query);
  const jobs = await prisma.job.findMany({
    where: {
      status: "OPEN",
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { description: { contains: query.q } }] } : {}),
    },
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, profile: { select: { displayName: true } } } }, _count: { select: { proposals: true } } },
  });
  response.json({ data: jobs, nextCursor: jobs.length === query.limit ? jobs.at(-1)?.id ?? null : null });
}));

jobsRouter.get("/mine", requireAuth, requireRole("CLIENT"), asyncHandler(async (request, response) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }).parse(request.query);
  const jobs = await prisma.job.findMany({
    where: { clientId: request.auth!.userId },
    take: query.limit,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, profile: { select: { displayName: true } } } },
      _count: { select: { proposals: true } },
    },
  });
  response.json({ data: jobs, nextCursor: jobs.length === query.limit ? jobs.at(-1)?.id ?? null : null });
}));

jobsRouter.get("/:jobId", optionalAuth, asyncHandler(async (request, response) => {
  const job = await prisma.job.findUnique({
    where: { id: pathParam(request, "jobId") },
    include: { client: { select: { id: true, profile: { select: { displayName: true } } } }, _count: { select: { proposals: true } } },
  });
  if (!job || (job.status !== "OPEN" && job.clientId !== request.auth?.userId)) {
    throw new HttpError(404, "Job not found", "JOB_NOT_FOUND");
  }
  response.json({ data: job });
}));

jobsRouter.post("/", requireAuth, requireRole("CLIENT"), asyncHandler(async (request, response) => {
  const input = createJobSchema.parse(request.body);
  const { budgetMin, budgetMax, ...fields } = input;
  const job = await prisma.job.create({
    data: { ...fields, budgetMin: budgetMin ?? null, budgetMax: budgetMax ?? null, clientId: request.auth!.userId },
  });
  response.status(201).json({ data: job });
}));

jobsRouter.patch("/:jobId/close", requireAuth, requireRole("CLIENT"), asyncHandler(async (request, response) => {
  const job = await prisma.job.findUnique({ where: { id: pathParam(request, "jobId") } });
  if (!job) throw new HttpError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.clientId !== request.auth!.userId) throw new HttpError(403, "Only the job owner can close it", "FORBIDDEN");
  if (job.status === "CLOSED") throw new HttpError(409, "Job is already closed", "JOB_CLOSED");
  const updated = await prisma.job.update({ where: { id: job.id }, data: { status: "CLOSED" } });
  response.json({ data: updated });
}));
