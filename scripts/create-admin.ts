import "dotenv/config";
import { hashPassword } from "../src/auth.js";
import { prisma } from "../src/db.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

try {
  if (!email || !password || password.length < 10) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) for this command.");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with this email already exists; no account was changed.");
  const admin = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), role: "ADMIN" } });
  console.log(`Admin account created: ${admin.email} (${admin.id})`);
} finally {
  await prisma.$disconnect();
}
