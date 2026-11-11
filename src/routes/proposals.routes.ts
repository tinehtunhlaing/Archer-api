import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, pathParam } from "../http.js";

export const proposalsRouter = Router();
proposalsRouter.use(requireAuth);

const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/);
const proposalSchema = z.object({
  coverLetter: z.string().trim().min(20).max(5000),
  bidAmount: amount.optional(),
}).strict();

proposalsRouter.get("/me", requireRole("FREELANCER"), asyncHandler(async (request, response) => {
  const proposals = await prisma.proposal.findMany({
    where: { freelancerId: request.auth!.userId },
    include: {
      job: { select: { id: true, title: true, currency: true, status: true } },
      conversation: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ data: proposals });
}));

proposalsRouter.get("/jobs/:jobId", requireRole("CLIENT"), asyncHandler(async (request, response) => {
  const job = await prisma.job.findUnique({ where: { id: pathParam(request, "jobId") }, select: { id: true, clientId: true } });
  if (!job) throw new HttpError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.clientId !== request.auth!.userId) throw new HttpError(403, "Only the job owner can view proposals", "FORBIDDEN");
  const proposals = await prisma.proposal.findMany({
    where: { jobId: job.id },
    include: {
      freelancer: { select: { id: true, profile: true } },
      conversation: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ data: proposals });
}));

proposalsRouter.post("/jobs/:jobId", requireRole("FREELANCER"), asyncHandler(async (request, response) => {
  const input = proposalSchema.parse(request.body);
  const job = await prisma.job.findUnique({ where: { id: pathParam(request, "jobId") } });
  if (!job || job.status !== "OPEN") throw new HttpError(404, "Open job not found", "JOB_NOT_FOUND");
  if (job.clientId === request.auth!.userId) throw new HttpError(403, "You cannot apply to your own job", "FORBIDDEN");

  const result = await prisma.$transaction(async (transaction) => {
    const proposal = await transaction.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: request.auth!.userId,
        coverLetter: input.coverLetter,
        bidAmount: input.bidAmount ?? null,
        currency: input.bidAmount ? job.currency : null,
      },
    });
    const conversation = await transaction.conversation.create({
      data: {
        proposalId: proposal.id,
        jobId: job.id,
        clientId: job.clientId,
        freelancerId: request.auth!.userId,
      },
    });
    return { proposal, conversation };
  });
  response.status(201).json({ data: result });
}));

proposalsRouter.patch("/:proposalId/withdraw", requireRole("FREELANCER"), asyncHandler(async (request, response) => {
  const proposal = await prisma.proposal.findUnique({ where: { id: pathParam(request, "proposalId") } });
  if (!proposal) throw new HttpError(404, "Proposal not found", "PROPOSAL_NOT_FOUND");
  if (proposal.freelancerId !== request.auth!.userId) throw new HttpError(403, "You can only withdraw your own proposal", "FORBIDDEN");
  if (proposal.status !== "PENDING") throw new HttpError(409, "Only pending proposals can be withdrawn", "PROPOSAL_NOT_PENDING");
  const updated = await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "WITHDRAWN" } });
  response.json({ data: updated });
}));

proposalsRouter.patch("/:proposalId/reject", requireRole("CLIENT"), asyncHandler(async (request, response) => {
  const proposal = await prisma.proposal.findUnique({ where: { id: pathParam(request, "proposalId") } });
  if (!proposal) throw new HttpError(404, "Proposal not found", "PROPOSAL_NOT_FOUND");
  const job = await prisma.job.findUnique({ where: { id: proposal.jobId }, select: { clientId: true } });
  if (!job) throw new HttpError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.clientId !== request.auth!.userId) throw new HttpError(403, "Only the job owner can reject proposals", "FORBIDDEN");
  if (proposal.status !== "PENDING") throw new HttpError(409, "Only pending proposals can be rejected", "PROPOSAL_NOT_PENDING");
  const updated = await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "REJECTED" } });
  response.json({ data: updated });
}));
