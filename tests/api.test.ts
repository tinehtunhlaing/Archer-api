import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";

const testDirectory = await mkdtemp(join(tmpdir(), "archer-api-test-"));
const databasePath = join(testDirectory, "api.sqlite");
const migrationPath = new URL("../prisma/migrations/20261111150000_init/migration.sql", import.meta.url);

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.JWT_SECRET = "test-only-secret-that-is-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "15m";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const migration = await readFile(migrationPath, "utf8");
const setupDatabase = new Database(databasePath);
setupDatabase.exec(migration);
setupDatabase.close();

const [{ app }, { prisma }] = await Promise.all([
  import("../src/app.js"),
  import("../src/db.js"),
]);

let server: Server | undefined;
let baseUrl: string;
let userNumber = 0;

type ApiResult<T> = { data: T; nextCursor?: string | null };
type ApiErrorBody = { error?: { code?: string; message?: string } };
type Account = { id: string; email: string; role: string; profile?: { displayName: string } };
type AuthResult = { user: Account; accessToken: string; tokenType: "Bearer" };
type Job = { id: string; budgetMin: string | null; budgetMax: string | null; currency: string; status: string };
type Proposal = { id: string; status: string; bidAmount: string | null; currency: string | null };
type Conversation = { id: string };
type Message = { id: string; body: string; senderId: string };

before(async () => {
  const httpServer = createServer(app);
  server = httpServer;
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
  await rm(testDirectory, { recursive: true, force: true });
});

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => null) as (ApiResult<T> & ApiErrorBody) | null;
  return { response, payload };
}

async function register(role: "CLIENT" | "FREELANCER" = "CLIENT") {
  userNumber += 1;
  const email = `${role.toLowerCase()}-${userNumber}@example.test`;
  const result = await request<AuthResult>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "long-test-password", role, displayName: `${role} ${userNumber}` }),
  });
  assert.equal(result.response.status, 201);
  assert.ok(result.payload && "data" in result.payload);
  return result.payload.data;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createJob(clientToken: string, values: Partial<{
  title: string;
  description: string;
  budgetType: "FIXED" | "HOURLY";
  budgetMin: string;
  budgetMax: string;
  currency: "USD" | "MMK";
}> = {}) {
  const result = await request<Job>("/jobs", {
    method: "POST",
    headers: { ...bearer(clientToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Build a dependable marketplace feature",
      description: "Create a small but polished feature with clear requirements and integration.",
      budgetType: "FIXED",
      budgetMin: "1200.0100",
      budgetMax: "2500.1250",
      currency: "USD",
      ...values,
    }),
  });
  return result;
}

async function submitProposal(token: string, jobId: string, bidAmount?: string) {
  return request<{ proposal: Proposal; conversation: Conversation }>(`/proposals/jobs/${jobId}`, {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      coverLetter: "I have relevant experience and can deliver this work with a clear plan.",
      ...(bidAmount ? { bidAmount } : {}),
    }),
  });
}

test("registration, sign-in, and protected identity enforce basic auth rules", async () => {
  const account = await register("FREELANCER");
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } });
  assert.notEqual(stored.passwordHash, "long-test-password");
  assert.equal(await (await import("../src/auth.js")).verifyPassword("long-test-password", stored.passwordHash), true);

  const unauthenticated = await request<Account>("/auth/me");
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.payload?.error?.code, "UNAUTHENTICATED");

  const identity = await request<Account>("/auth/me", { headers: bearer(account.accessToken) });
  assert.equal(identity.response.status, 200);
  assert.equal(identity.payload?.data.id, account.user.id);

  const updatedProfile = await request<{ displayName: string; skills: string[] }>("/profiles/me", {
    method: "PUT",
    headers: { ...bearer(account.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Updated Freelancer", skills: ["TypeScript", "Design"] }),
  });
  assert.equal(updatedProfile.response.status, 200);
  assert.equal(updatedProfile.payload?.data.displayName, "Updated Freelancer");
  assert.deepEqual(updatedProfile.payload?.data.skills, ["TypeScript", "Design"]);

  const publicProfile = await request<{ displayName: string; skills: string[] }>(`/profiles/${account.user.id}`);
  assert.equal(publicProfile.response.status, 200);
  assert.deepEqual(publicProfile.payload?.data.skills, ["TypeScript", "Design"]);

  const login = await request<AuthResult>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.user.email.toUpperCase(), password: "long-test-password" }),
  });
  assert.equal(login.response.status, 200);

  const invalidLogin = await request<AuthResult>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.user.email, password: "wrong-password" }),
  });
  assert.equal(invalidLogin.response.status, 401);

  const adminRegistration = await request<AuthResult>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "public-admin@example.test", password: "long-test-password", role: "ADMIN", displayName: "Admin" }),
  });
  assert.equal(adminRegistration.response.status, 400);
  assert.equal(adminRegistration.payload?.error?.code, "VALIDATION_ERROR");
});

test("job routes enforce roles and ownership while preserving exact budget strings and currency", async () => {
  const client = await register("CLIENT");
  const otherClient = await register("CLIENT");
  const freelancer = await register("FREELANCER");

  const forbiddenCreate = await request<Job>("/jobs", {
    method: "POST",
    headers: { ...bearer(freelancer.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Valid marketplace title", description: "A sufficiently long description for the job posting.", budgetType: "FIXED", currency: "USD" }),
  });
  assert.equal(forbiddenCreate.response.status, 403);

  const created = await createJob(client.accessToken, { currency: "MMK" });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload?.data.budgetMin, "1200.0100");
  assert.equal(created.payload?.data.budgetMax, "2500.1250");
  assert.equal(created.payload?.data.currency, "MMK");

  const invalidRange = await createJob(client.accessToken, { budgetMin: "2500", budgetMax: "1200" });
  assert.equal(invalidRange.response.status, 400);
  assert.equal(invalidRange.payload?.error?.code, "VALIDATION_ERROR");

  const missingRangeBound = await createJob(client.accessToken, { budgetMin: undefined });
  assert.equal(missingRangeBound.response.status, 400);
  assert.equal(missingRangeBound.payload?.error?.code, "VALIDATION_ERROR");

  const ownerClose = await request<Job>(`/jobs/${created.payload!.data.id}/close`, {
    method: "PATCH",
    headers: bearer(otherClient.accessToken),
  });
  assert.equal(ownerClose.response.status, 403);

  const closed = await request<Job>(`/jobs/${created.payload!.data.id}/close`, {
    method: "PATCH",
    headers: bearer(client.accessToken),
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.payload?.data.status, "CLOSED");

  const closeAgain = await request<Job>(`/jobs/${created.payload!.data.id}/close`, {
    method: "PATCH",
    headers: bearer(client.accessToken),
  });
  assert.equal(closeAgain.response.status, 409);
});

test("proposal creation atomically creates its conversation and enforces job and proposal rules", async () => {
  const client = await register("CLIENT");
  const freelancer = await register("FREELANCER");
  const otherFreelancer = await register("FREELANCER");
  const otherClient = await register("CLIENT");
  const job = await createJob(client.accessToken, { currency: "USD" });
  const jobId = job.payload!.data.id;

  const submitted = await submitProposal(freelancer.accessToken, jobId, "1234.5000");
  assert.equal(submitted.response.status, 201);
  assert.equal(submitted.payload?.data.proposal.bidAmount, "1234.5000");
  assert.equal(submitted.payload?.data.proposal.currency, "USD");

  const storedConversation = await prisma.conversation.findUnique({ where: { proposalId: submitted.payload!.data.proposal.id } });
  assert.equal(storedConversation?.id, submitted.payload?.data.conversation.id);
  assert.equal(storedConversation?.clientId, client.user.id);
  assert.equal(storedConversation?.freelancerId, freelancer.user.id);

  const duplicate = await submitProposal(freelancer.accessToken, jobId);
  assert.equal(duplicate.response.status, 409);

  const rejectedByNonOwner = await request<Proposal>(`/proposals/${submitted.payload!.data.proposal.id}/reject`, {
    method: "PATCH",
    headers: bearer(otherClient.accessToken),
  });
  assert.equal(rejectedByNonOwner.response.status, 403);

  const withdrawnByOther = await request<Proposal>(`/proposals/${submitted.payload!.data.proposal.id}/withdraw`, {
    method: "PATCH",
    headers: bearer(otherFreelancer.accessToken),
  });
  assert.equal(withdrawnByOther.response.status, 403);

  const rejected = await request<Proposal>(`/proposals/${submitted.payload!.data.proposal.id}/reject`, {
    method: "PATCH",
    headers: bearer(client.accessToken),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.payload?.data.status, "REJECTED");

  const rejectAgain = await request<Proposal>(`/proposals/${submitted.payload!.data.proposal.id}/reject`, {
    method: "PATCH",
    headers: bearer(client.accessToken),
  });
  assert.equal(rejectAgain.response.status, 409);

  const closedJob = await createJob(client.accessToken);
  const closeResult = await request<Job>(`/jobs/${closedJob.payload!.data.id}/close`, {
    method: "PATCH",
    headers: bearer(client.accessToken),
  });
  assert.equal(closeResult.response.status, 200);
  const applicationToClosed = await submitProposal(otherFreelancer.accessToken, closedJob.payload!.data.id);
  assert.equal(applicationToClosed.response.status, 404);
});

test("conversation access is limited to participants and message validation and ordering hold", async () => {
  const client = await register("CLIENT");
  const freelancer = await register("FREELANCER");
  const outsider = await register("FREELANCER");
  const job = await createJob(client.accessToken);
  const submitted = await submitProposal(freelancer.accessToken, job.payload!.data.id);
  const conversationId = submitted.payload!.data.conversation.id;
  const messagesPath = `/conversations/${conversationId}/messages`;

  const deniedRead = await request<Message[]>(messagesPath, { headers: bearer(outsider.accessToken) });
  assert.equal(deniedRead.response.status, 403);

  const deniedSend = await request<Message>(messagesPath, {
    method: "POST",
    headers: { ...bearer(outsider.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body: "I should not be able to send this." }),
  });
  assert.equal(deniedSend.response.status, 403);

  const blankMessage = await request<Message>(messagesPath, {
    method: "POST",
    headers: { ...bearer(freelancer.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body: "   " }),
  });
  assert.equal(blankMessage.response.status, 400);

  const sentFirst = await request<Message>(messagesPath, {
    method: "POST",
    headers: { ...bearer(freelancer.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body: "First message" }),
  });
  const sentSecond = await request<Message>(messagesPath, {
    method: "POST",
    headers: { ...bearer(client.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Second message" }),
  });
  assert.equal(sentFirst.response.status, 201);
  assert.equal(sentSecond.response.status, 201);
  await prisma.message.update({
    where: { id: sentFirst.payload!.data.id },
    data: { createdAt: new Date(Date.now() - 60_000) },
  });

  const read = await request<Message[]>(messagesPath, { headers: bearer(client.accessToken) });
  assert.equal(read.response.status, 200);
  assert.deepEqual(read.payload?.data.map(({ body }) => body), ["First message", "Second message"]);

  const limited = await request<Message[]>(`${messagesPath}?limit=1`, { headers: bearer(freelancer.accessToken) });
  assert.equal(limited.response.status, 200);
  assert.equal(limited.payload?.data.length, 1);
  assert.equal(limited.payload?.data[0]?.body, "Second message");
});

test("validation errors are localized and return stable public error codes", async () => {
  const invalid = await request<Job>("/jobs?limit=0", { headers: { "Accept-Language": "my-MM" } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.response.headers.get("content-language"), "my-MM");
  assert.equal(invalid.payload?.error?.code, "VALIDATION_ERROR");
  assert.ok(invalid.payload?.error?.message);
  assert.equal(JSON.stringify(invalid.payload).includes("ZodError"), false);
});
