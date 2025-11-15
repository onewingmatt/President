import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { registerGameEvents } from './controllers/gameEvents.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.resolve('./test-client.html'));
});

registerGameEvents(io);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🎮 President v1.6.20`);
  console.log(`📡 http://localhost:${PORT}`);
});
