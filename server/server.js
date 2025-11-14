import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerGameEvents } from './controllers/gameEvents.js';

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());

// Serve static test-client.html on root /
app.get('/', (req, res) => {
  res.sendFile(path.resolve('./test-client.html'));
});

registerGameEvents(io);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🎮 President v1.6.13
📡 http://localhost:${PORT}`);
});
