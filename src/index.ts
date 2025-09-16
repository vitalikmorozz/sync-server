import app from "./app";
import "./socket";

const PORT = Number(process.env.PORT) || 3006;

app.listen({ port: PORT });

console.log(`🚀  Fastify server running on port http://localhost:${PORT}`);
