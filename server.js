
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


// Allow CORS from env or default to '*'. For production, set ALLOWED_ORIGINS to a comma-separated list.
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 1000,
  reconnectionAttempts: Infinity,
  pingTimeout: 30000,
  pingInterval: 5000
});

app.use(cors({ origin: ALLOWED_ORIGINS }));
// Serve only the public directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const MAX_ROOMS = 200;
const ROOM_TTL_MS = 1000 * 60 * 60; // 1 hour
const gameRooms = new Map();
const roomTimestamps = new Map();

// Simple rate limiter for socket events
const rateLimiter = new Map();
const RATE_LIMIT = 10; // max requests per window
const RATE_WINDOW = 5000; // 5 seconds in milliseconds
const MAX_QUEUE = 20; // cap per-client queue size

function isRateLimited(socketId) {
  const now = Date.now();
  let userRequests = rateLimiter.get(socketId) || [];
  // Remove old requests outside the window
  userRequests = userRequests.filter(timestamp => now - timestamp < RATE_WINDOW);
  if (userRequests.length >= RATE_LIMIT) {
    return true;
  }
  userRequests.push(now);
  // Cap queue size
  if (userRequests.length > MAX_QUEUE) {
    userRequests = userRequests.slice(-MAX_QUEUE);
  }
  rateLimiter.set(socketId, userRequests);
  return false;
}

// Clean up old rate limiter entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [socketId, requests] of rateLimiter.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < RATE_WINDOW);
    if (validRequests.length === 0) {
      rateLimiter.delete(socketId);
    } else {
      rateLimiter.set(socketId, validRequests);
    }
  }
}, RATE_WINDOW);

// Room cleanup function to prevent memory leaks
function cleanupEmptyRooms() {
  const now = Date.now();
  for (const [roomCode, room] of gameRooms.entries()) {
    // Don't clean up CPU-only games (they're meant to run continuously)
    if (room.isCPUOnly()) {
      continue;
    }
    const created = roomTimestamps.get(roomCode) || 0;
    if (room.isEmpty() || room.isInactive() || (now - created > ROOM_TTL_MS)) {
      gameRooms.delete(roomCode);
      roomTimestamps.delete(roomCode);
      console.log('[CLEANUP] Removed room: ' + roomCode +
        (room.isEmpty() ? ' (empty)' : room.isInactive() ? ' (inactive)' : ' (expired)'));
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

function generateRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = Array(6).fill(0).map(() =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('');
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique room code');
  } while (gameRooms.has(code));
  return code;
}

function processCPUTurns(io, room, depth = 0) {
  if (depth > 20 || !room || !room.gameState || room.gameState.phase !== 'playing') {
    return;
  }

  // Prevent concurrent CPU turns from running simultaneously
  if (room.gameState.cpuTurnInProgress) {
    return;
  }

  if (!room.players || !Array.isArray(room.players) || 
      room.gameState.currentPlayerIndex < 0 || 
      room.gameState.currentPlayerIndex >= room.players.length) {
    return;
  }

  const current = room.players[room.gameState.currentPlayerIndex];
  if (!current || !current.isCPU || current.finished) {
    return;
  }

  // Set lock before scheduling turn
  room.gameState.cpuTurnInProgress = true;

  setTimeout(() => {
    // Double-check game state is still valid
    if (room.gameState.phase !== 'playing' || !room.gameState.cpuTurnInProgress) {
      room.gameState.cpuTurnInProgress = false;
      return;
    }

    const result = room.executeCPUTurn();
    // Release lock immediately after turn execution
    room.gameState.cpuTurnInProgress = false;

    if (result.success) {
      room.players.forEach(p => {
        if (!p.isCPU && io.sockets.sockets.get(p.id)) {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        }
      });

      if (result.roundEnded) {
        room.players.forEach(p => {
          if (!p.isCPU && room.gameState.swapPending[p.id] && io.sockets.sockets.get(p.id)) {
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
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
      if (gameRooms.size >= MAX_ROOMS) {
        socket.emit('error', { message: 'Server is full. Try again later.' });
        return;
      }
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
      roomTimestamps.set(code, Date.now());
      socket.join(code);

      console.log('[CREATE] Room ' + code + ' created with ' + room.players.length + ' players');

      socket.emit('game-created', { roomCode: code });
      socket.emit('game-state-update', room.getPublicState(socket.id));
      io.to(code).emit('game-state-update', room.getPublicState(null));

      room.log('Room created with ' + numCPU + ' CPU players');
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [CreateGame] ${err.message}`, { socketId: socket.id, playerName: data.playerName });
      socket.emit('error', { message: 'Failed to create game. Please try again.' });
    }
  });

  socket.on('join-game', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
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
          if (!p.isCPU && io.sockets.sockets.get(p.id)) {
            io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
          }
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
      const ts = new Date().toISOString();
      console.error(`[${ts}] [JoinGame] ${err.message}`, { socketId: socket.id, roomCode: data.roomCode, playerName: data.playerName });
      socket.emit('error', { message: 'Failed to join game. Please check code and try again.' });
    }
  });

  socket.on('start-game', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.startGame();
      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      io.to(data.roomCode.toUpperCase()).emit('game-started');

      room.players.forEach(p => {
        if (!p.isCPU && io.sockets.sockets.get(p.id)) {
          io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
        }
      });

      processCPUTurns(io, room);
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [StartGame] ${err.message}`, { socketId: socket.id, roomCode: data.roomCode });
      socket.emit('error', { message: 'Failed to start game. Please try again.' });
    }
  });

  socket.on('play-cards', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
      if (!data || !data.roomCode || !Array.isArray(data.cardIndices)) {
        socket.emit('error', { message: 'Invalid play data' });
        return;
      }
      
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const result = room.playCards(socket.id, data.cardIndices);
      if (result.success) {
        if (room.players && Array.isArray(room.players)) {
          room.players.forEach(p => {
            if (p && p.id && !p.isCPU && io.sockets.sockets.get(p.id)) {
              io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
            }
          });
        }

        if (result.roundEnded) {
          room.players.forEach(p => {
            if (p && p.id && !p.isCPU && room.gameState.swapPending && room.gameState.swapPending[p.id] && io.sockets.sockets.get(p.id)) {
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
      const ts = new Date().toISOString();
      console.error(`[${ts}] [PlayCards] ${err.message}`, { socketId: socket.id, roomCode: data.roomCode, cardCount: data.cardIndices?.length });
      socket.emit('error', { message: 'Failed to play cards. Please try again.' });
    }
  });

  socket.on('pass-turn', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) return;

      const result = room.passTurn(socket.id);
      if (result.success) {
        room.players.forEach(p => {
          if (!p.isCPU && io.sockets.sockets.get(p.id)) {
            io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
          }
        });

        processCPUTurns(io, room);
      } else {
        socket.emit('invalid-play', { reason: result.error });
      }
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [PassTurn] ${err.message}`, { socketId: socket.id, roomCode: data.roomCode });
      socket.emit('error', { message: 'Failed to pass turn. Please try again.' });
    }
  });

  socket.on('submit-swap', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }
      if (!data || !data.roomCode || !Array.isArray(data.cardIndices)) {
        socket.emit('error', { message: 'Invalid swap data' });
        return;
      }
      
      const room = gameRooms.get(data.roomCode.toUpperCase());
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const result = room.submitSwap(socket.id, data.cardIndices);
      if (!result.success) {
        socket.emit('invalid-play', { reason: result.error });
      } else if (result.allCompleted) {
        if (room.players && Array.isArray(room.players)) {
          room.players.forEach(p => {
            if (p && p.id && !p.isCPU && io.sockets.sockets.get(p.id)) {
              io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
            }
          });
        }

        processCPUTurns(io, room);
      }
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [SubmitSwap] ${err.message}`, { socketId: socket.id, roomCode: data.roomCode, cardCount: data.cardIndices?.length });
      socket.emit('error', { message: 'Failed to submit swap. Please try again.' });
    }
  });

  socket.on('create-cpu-game', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }

      const code = generateRoomCode();
      const numPlayers = Math.min(8, Math.max(2, data.options?.num_players || 4));

      const room = new GameRoom(code, null, {
        num_players: numPlayers,
        num_decks: numPlayers > 4 ? 2 : 1,
        cpuOnly: true
      });

      // Add only CPU players
      for (let i = 0; i < numPlayers; i++) {
        room.addPlayer('CPU-' + (i + 1) + '-' + Date.now(), 'CPU ' + (i + 1), true);
      }

      // Add the creator as spectator
      room.addSpectator(socket.id, data.spectatorName || 'Spectator');
      
      gameRooms.set(code, room);
      roomTimestamps.set(code, Date.now());
      socket.join(code);

      console.log('[CPU-GAME] CPU-only room ' + code + ' created with ' + room.players.length + ' CPUs');

      socket.emit('cpu-game-created', { roomCode: code });
      socket.emit('game-state-update', room.getSpectatorState(socket.id));
      io.to(code).emit('game-state-update', room.getPublicState(null));

      // Start the game immediately since all players are CPUs
      const startResult = room.startGame();
      if (startResult.success) {
        io.to(code).emit('game-started');
        room.players.forEach(p => {
          if (!p.isCPU && io.sockets.sockets.get(p.id)) {
            io.to(p.id).emit('game-state-update', room.getPublicState(p.id));
          }
        });
        
        // Start CPU turns
        processCPUTurns(io, room);
      }

      room.log('CPU-only game started with spectator');
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [CreateCPUGame] ${err.message}`, { socketId: socket.id, numPlayers: data.options?.num_players });
      socket.emit('error', { message: 'Failed to create CPU game. Please try again.' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
    
    // Clean up rate limiter entry
    rateLimiter.delete(socket.id);
    
    // Check if any rooms need cleanup after disconnection
    setTimeout(cleanupEmptyRooms, 1000);
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
