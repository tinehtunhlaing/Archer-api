import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, pathParam } from "../http.js";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

async function getParticipantConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new HttpError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  if (conversation.clientId !== userId && conversation.freelancerId !== userId) {
    throw new HttpError(403, "You are not a participant in this conversation", "FORBIDDEN");
  }
  return conversation;
}

conversationsRouter.get("/", asyncHandler(async (request, response) => {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ clientId: request.auth!.userId }, { freelancerId: request.auth!.userId }] },
    include: {
      job: { select: { id: true, title: true, status: true } },
      client: { select: { id: true, profile: { select: { displayName: true } } } },
      freelancer: { select: { id: true, profile: { select: { displayName: true } } } },
      messages: { take: 1, orderBy: { createdAt: "desc" }, include: { sender: { select: { id: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ data: conversations });
}));

conversationsRouter.get("/:conversationId/messages", asyncHandler(async (request, response) => {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.iso.datetime().optional() }).parse(request.query);
  const conversation = await getParticipantConversation(pathParam(request, "conversationId"), request.auth!.userId);
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id, ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}) },
    take: query.limit,
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, profile: { select: { displayName: true } } } } },
  });
  response.json({ data: messages.reverse() });
}));

conversationsRouter.post("/:conversationId/messages", asyncHandler(async (request, response) => {
  const input = messageSchema.parse(request.body);
  const conversation = await getParticipantConversation(pathParam(request, "conversationId"), request.auth!.userId);
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: request.auth!.userId, body: input.body },
  });
  response.status(201).json({ data: message });
}));
