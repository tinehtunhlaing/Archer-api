import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler, localeMiddleware, messageForLocale, notFound } from "./http.js";
import { authRouter } from "./routes/auth.routes.js";
import { conversationsRouter } from "./routes/conversations.routes.js";
import { jobsRouter } from "./routes/jobs.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { proposalsRouter } from "./routes/proposals.routes.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()), credentials: false }));
app.use(localeMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (request, response) => response.status(429).json({
    error: { code: "RATE_LIMITED", message: messageForLocale(request.locale, "RATE_LIMITED", "Too many requests. Please try again later.") },
  }),
}));

app.get("/api/health", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ data: { status: "ok" } });
});
app.use("/api/auth", authRouter);
app.use("/api/profiles", profileRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/proposals", proposalsRouter);
app.use("/api/conversations", conversationsRouter);
app.use(notFound);
app.use(errorHandler);
