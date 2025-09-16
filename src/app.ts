import fastify from "fastify";
import { Server } from "socket.io";

const app = fastify({ logger: true });
const io = new Server(app.server, { cors: { origin: "*" } });

app.get("/", async (_req, reply) => {
  reply.send("Hello world");
});

app.ready((err) => {
  if (err) throw err;

  io.on("connection", (socket) => {
    console.info("Socket connected!", socket.id);

    socket.on(
      "created-file",
      (payload: Record<string, any>, callback: Function) => {
        console.log("Created file", payload);
        callback("Success");
      }
    );

    socket.on(
      "deleted-file",
      (payload: Record<string, any>, callback: Function) => {
        console.log("Deleted file", payload);
        callback("Success");
      }
    );

    socket.on(
      "modified-file",
      (payload: Record<string, any>, callback: Function) => {
        console.log("Modified file", payload);
        callback("Success");
      }
    );

    socket.on(
      "renamed-file",
      (payload: Record<string, any>, callback: Function) => {
        console.log("Renamed file", payload);
        callback("Success");
      }
    );

    socket.on("disconnect", () => {
      console.log("Disconnected!", socket.id);
    });
  });
});

export default app;
