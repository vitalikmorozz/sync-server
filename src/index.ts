import "dotenv/config";
import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import app from "./app";
import { db, closeConnection } from "./db";

const PORT = Number(process.env.PORT) || 3006;
const HOST = process.env.HOST || "0.0.0.0";

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    await app.close();
    await closeConnection();
    console.log("Server closed successfully");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start() {
  // Run database migrations
  console.log("Running database migrations...");
  try {
    const migrationsFolder = path.join(__dirname, "db/migrations");
    await migrate(db, { migrationsFolder });
    console.log("Database migrations completed successfully");
  } catch (err) {
    console.error("Failed to run database migrations:", err);
    process.exit(1);
  }

  // Start the server
  app.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`Server running at ${address}`);
  });
}

start();
