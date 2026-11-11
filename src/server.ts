import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const server = app.listen(config.PORT, () => {
  console.log(`Archer API listening on port ${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down Archer API`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
