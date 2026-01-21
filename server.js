import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './GameRoom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 1000,
  reconnectionAttempts: Infinity,
  pingTimeout: 30000,
  pingInterval: 5000
});

app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const gameRooms = new Map();

function generateRoomCode() {
  return Array(6).fill(0).map(() => 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
}

function processCPUTurns(io, room, depth = 0) {
  if (depth > 20 || room.gameState.phase !== 'playing') {
    return;
  }

  const current = room.players[room.gameState.currentPlayerIndex];
  if (!current || !current.isCPU || current.finished) {
    return;
  }

  setTimeout(() => {
    if (room.gameState.phase !== 'playing') return;

    const result = room.executeCPUTurn();
    if (result.success) {
      room.players.forEach(p => {
        io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
      });

      if (result.roundEnded) {
        room.players.forEach(p => {
          if (room.gameState.swapPending[p.id]) {
            io.to(p.id).emit('swap-required', room.gameState.swapPending[p.id]);
          }
        });
      } else {
        processCPUTurns(io, room, depth + 1);
      }
    }
  }, 800);
}

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);

  socket.on('create-game', (data) => {
    try {
      const code = generateRoomCode();
      const numPlayers = Math.min(8, Math.max(2, data.options?.num_players || 4));
      const numCPU = Math.min(numPlayers - 1, Math.max(0, data.options?.numCPU || 0));

      const room = new GameRoom(code, socket.id, {
        num_players: numPlayers,
        num_decks: numPlayers > 4 ? 2 : 1
      });

      room.addPlayer(socket.id, data.playerName, false);

      for (let i = 0; i < numCPU; i++) {
        room.addPlayer('CPU-' + (i + 1) + '-' + Date.now(), 'CPU ' + (i + 1), true);
      }

      gameRooms.set(code, room);
      socket.join(code);

      console.log('[CREATE] Room ' + code + ' created with ' + room.players.length + ' players');

      socket.emit('game-created', { roomCode: code });
      socket.emit('game-state-update', room.getPublicState(socket.id));
      io.to(code).emit('game-state-update', room.getPublicState(null));

      room.log('Room created with ' + numCPU + ' CPU players');
    } catch (err) {
      console.error('Create error:', err);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('join-game', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);

      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const existingPlayer = room.players.find(p => 
        p.name === data.playerName && !p.isCPU
      );

      if (existingPlayer) {
        console.log('Reconnection: ' + data.playerName);
        existingPlayer.id = socket.id;
        socket.join(roomCode);
        socket.emit('game-created', { roomCode: roomCode });
        socket.emit('reconnected', { message: 'Reconnected' });
        io.to(roomCode).emit('game-state-update', room.getPublicState(null));
        room.players.forEach(p => {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        });
        room.log(data.playerName + ' reconnected');

        if (room.gameState.phase === 'playing') {
          processCPUTurns(io, room);
        }
      } else {
        const result = room.addPlayer(socket.id, data.playerName, false);
        if (!result.success) {
          socket.emit('error', { message: result.error });
          return;
        }
        socket.join(roomCode);
        socket.emit('game-created', { roomCode: roomCode });
        io.to(roomCode).emit('game-state-update', room.getPublicState(null));
        room.log(data.playerName + ' joined');
      }
    } catch (err) {
      console.error('Join error:', err);
      socket.emit('error', { message: 'Join failed' });
    }
  });

  socket.on('start-game', (data) => {
    try {
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.startGame();
      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      io.to(data.roomCode.toUpperCase()).emit('game-started');

      room.players.forEach(p => {
        io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
      });

      processCPUTurns(io, room);
    } catch (err) {
      console.error('Start error:', err);
    }
  });

  socket.on('play-cards', (data) => {
    try {
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.playCards(socket.id, data.cardIndices);
      if (result.success) {
        room.players.forEach(p => {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        });

        if (result.roundEnded) {
          room.players.forEach(p => {
            if (room.gameState.swapPending[p.id]) {
              io.to(p.id).emit('swap-required', room.gameState.swapPending[p.id]);
            }
          });
        } else {
          processCPUTurns(io, room);
        }
      } else {
        socket.emit('invalid-play', { reason: result.error });
      }
    } catch (err) {
      console.error('Play error:', err);
    }
  });

  socket.on('pass-turn', (data) => {
    try {
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.passTurn(socket.id);
      if (result.success) {
        room.players.forEach(p => {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        });

        processCPUTurns(io, room);
      } else {
        socket.emit('invalid-play', { reason: result.error });
      }
    } catch (err) {
      console.error('Pass error:', err);
    }
  });

  socket.on('submit-swap', (data) => {
    try {
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.submitSwap(socket.id, data.cardIndices);
      if (result.success && result.allCompleted) {
        room.players.forEach(p => {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        });

        processCPUTurns(io, room);
      }
    } catch (err) {
      console.error('Swap error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log('President v1.6.175 on port ' + PORT);
  console.log('FIXED: 2s bombing now works!');
});

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
