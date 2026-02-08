import "dotenv/config";
import app from "./app";
import { closeConnection } from "./db";

const PORT = Number(process.env.PORT) || 3006;
const HOST = process.env.HOST || "0.0.0.0";

// Graceful shutdown handler
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

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the server
app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
});
