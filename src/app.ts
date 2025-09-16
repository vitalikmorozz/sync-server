import fastify from 'fastify'
import { Server } from 'socket.io'

const app = fastify({ logger: true })
const io = new Server(app.server, { cors: { origin: "*" } });

app.get('/', async (_req, reply) => {
  reply.send("Hello world")
})

app.ready((err) => {
  if (err) throw err;

  io.on('connection', (socket) => {
    console.info('Socket connected!', socket.id);
    socket.on("hello", () => {
      console.log("Hello");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected!", socket.id);
    })
  })
})

export default app
