import express from 'express';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './GameRoom.js';
import { GameRules } from './GameRules.js';
import { RuntimeConfig } from './RuntimeConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

function validatePublicAssets() {
  for (const [fileName, markers] of Object.entries(RuntimeConfig.requiredPublicAssets)) {
    const assetPath = path.join(publicDir, fileName);
    if (!fs.existsSync(assetPath)) {
      throw new Error('Missing required public asset: ' + fileName);
    }

    const content = fs.readFileSync(assetPath, 'utf8');

    for (const invalidMarker of RuntimeConfig.invalidAssetMarkers) {
      if (content.includes(invalidMarker)) {
        throw new Error('Public asset contains placeholder content: ' + fileName);
      }
    }

    for (const marker of markers) {
      if (!content.includes(marker)) {
        throw new Error('Public asset is incomplete: ' + fileName + ' is missing marker ' + marker);
      }
    }
  }
}

validatePublicAssets();

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
app.use(express.static(publicDir));

app.get('/favicon.ico', (req, res) => {
  res.sendStatus(204);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const MAX_ROOMS = RuntimeConfig.maxRooms;
const ROOM_TTL_MS = RuntimeConfig.roomTtlMs;
const BOT_TAKEOVER_DELAY_MS = RuntimeConfig.botTakeoverDelayMs;
const gameRooms = new Map();
const roomTimestamps = new Map();
const MAX_PLAYER_NAME_LENGTH = 50;
const takeoverTimers = new Map();

const rateLimiter = new Map();
const RATE_LIMIT = RuntimeConfig.rateLimit;
const RATE_WINDOW = RuntimeConfig.rateWindowMs;
const MAX_QUEUE = RuntimeConfig.maxQueue;

function isRateLimited(socketId) {
  const now = Date.now();
  let userRequests = rateLimiter.get(socketId) || [];

  userRequests = userRequests.filter(timestamp => now - timestamp < RATE_WINDOW);
  if (userRequests.length >= RATE_LIMIT) {
    return true;
  }

  userRequests.push(now);
  if (userRequests.length > MAX_QUEUE) {
    userRequests = userRequests.slice(-MAX_QUEUE);
  }

  rateLimiter.set(socketId, userRequests);
  return false;
}

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

function cleanupEmptyRooms() {
  const now = Date.now();
  for (const [roomCode, room] of gameRooms.entries()) {
    const lastActivity = roomTimestamps.get(roomCode) || 0;
    const expired = now - lastActivity > ROOM_TTL_MS;
    const waitingWithoutParticipants = room.gameState.phase === 'waiting' && !room.hasConnectedParticipants();

    if (room.isEmpty() || waitingWithoutParticipants || expired) {
      clearTakeoverTimersForRoom(roomCode);
      gameRooms.delete(roomCode);
      roomTimestamps.delete(roomCode);
      console.log('[CLEANUP] Removed room: ' + roomCode +
        (room.isEmpty() ? ' (empty)' : waitingWithoutParticipants ? ' (abandoned)' : ' (expired)'));
    }
  }
}

setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

function generateRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = Array(6).fill(0).map(() =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('');
    attempts++;
    if (attempts > 10) {
      throw new Error('Failed to generate unique room code');
    }
  } while (gameRooms.has(code));
  return code;
}

function touchRoom(roomCode) {
  roomTimestamps.set(roomCode, Date.now());
}

function takeoverTimerKey(roomCode, playerId) {
  return roomCode + ':' + playerId;
}

function clearTakeoverTimer(roomCode, playerId) {
  const key = takeoverTimerKey(roomCode, playerId);
  const timerId = takeoverTimers.get(key);
  if (timerId) {
    clearTimeout(timerId);
    takeoverTimers.delete(key);
  }
}

function clearTakeoverTimersForRoom(roomCode) {
  for (const [key, timerId] of takeoverTimers.entries()) {
    if (!key.startsWith(roomCode + ':')) {
      continue;
    }

    clearTimeout(timerId);
    takeoverTimers.delete(key);
  }
}

function normalizeRoomCode(roomCode) {
  if (typeof roomCode !== 'string') {
    return null;
  }

  const normalized = roomCode.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : null;
}

function normalizePlayerName(playerName, fallback = '') {
  if (typeof playerName !== 'string') {
    return fallback;
  }

  const normalized = playerName.trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function isValidPlayerName(playerName) {
  return Boolean(playerName) && playerName.length <= MAX_PLAYER_NAME_LENGTH;
}

function buildHumanPlayerIdentity() {
  return {
    playerId: randomUUID(),
    reconnectToken: randomUUID()
  };
}

function emitRoomState(ioInstance, room) {
  room.players.forEach(player => {
    if (player.isCPU || !player.socketId || !ioInstance.sockets.sockets.get(player.socketId)) {
      return;
    }

    ioInstance.to(player.socketId).emit('game-state-update', room.getPublicState(player.id));
  });

  room.spectators.forEach(spectator => {
    if (!spectator.id || !ioInstance.sockets.sockets.get(spectator.id)) {
      return;
    }

    ioInstance.to(spectator.id).emit('game-state-update', room.getSpectatorState(spectator.id));
  });
}

function emitSwapRequests(ioInstance, room) {
  room.players.forEach(player => {
    const pendingSwap = room.gameState.swapPending[player.id];
    if (player.isCPU || !player.socketId || !pendingSwap || !ioInstance.sockets.sockets.get(player.socketId)) {
      return;
    }

    ioInstance.to(player.socketId).emit('swap-required', pendingSwap);
  });
}

function resolveRoom(socket, rawRoomCode) {
  const roomCode = normalizeRoomCode(rawRoomCode);
  if (!roomCode) {
    socket.emit('error', { message: 'Invalid room code' });
    return null;
  }

  const room = gameRooms.get(roomCode);
  if (!room) {
    socket.emit('error', { message: 'Room not found' });
    return null;
  }

  return { roomCode: roomCode, room: room };
}

function sanitizeCpuSpeedMultiplier(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(2, Math.max(0.3, parsed));
}

function normalizeGameplayRules(rawRules) {
  return {
    jackOfDiamondsBomb: rawRules?.jackOfDiamondsBomb !== undefined
      ? rawRules.jackOfDiamondsBomb === true
      : rawRules?.jackOfDiamondsWild === true || rawRules?.jackOfDiamondsWild === undefined,
    tripleSixesBeatJd: rawRules?.tripleSixesBeatJd === true,
    runsAllowed: rawRules?.runsAllowed === true,
    minRunLength: rawRules?.minRunLength,
    maxRunLength: rawRules?.maxRunLength
  };
}

function buildRoomOptions(numPlayers, rawOptions, extra = {}) {
  const gameplayRules = normalizeGameplayRules(rawOptions?.gameplayRules);
  return GameRules.normalizeOptions({
    num_players: numPlayers,
    num_decks: rawOptions?.num_decks ?? (numPlayers > 4 ? 2 : 1),
    cpuOnly: extra.cpuOnly === true,
    cpuSpeedMultiplier: sanitizeCpuSpeedMultiplier(rawOptions?.cpuSpeedMultiplier ?? rawOptions?.cpuSpeed ?? 1),
    jackOfDiamondsBomb: gameplayRules.jackOfDiamondsBomb,
    tripleSixesBeatJd: gameplayRules.tripleSixesBeatJd,
    runsAllowed: gameplayRules.runsAllowed,
    minRunLength: gameplayRules.minRunLength,
    maxRunLength: gameplayRules.maxRunLength
  });
}

function canManageRoomSettings(room, socketId) {
  if (room.isHostSocket(socketId)) {
    return true;
  }

  if (room.isCPUOnly()) {
    return room.spectators.some(spectator => spectator.id === socketId);
  }

  return false;
}

function scheduleBotTakeover(ioInstance, roomCode, playerId) {
  clearTakeoverTimer(roomCode, playerId);

  const key = takeoverTimerKey(roomCode, playerId);
  const timerId = setTimeout(() => {
    takeoverTimers.delete(key);

    const room = gameRooms.get(roomCode);
    if (!room) {
      return;
    }

    const takeoverResult = room.promoteDisconnectedPlayerToCPU(playerId);
    if (!takeoverResult.success) {
      return;
    }

    touchRoom(roomCode);
    emitRoomState(ioInstance, room);

    if (room.gameState.phase === 'swapping') {
      const swapIndices = room.getBotSwapIndices(playerId);
      if (swapIndices.length === room.gameState.swapPending[playerId]?.count) {
        const swapResult = room.submitSwap(playerId, swapIndices);
        if (swapResult.success) {
          emitRoomState(ioInstance, room);
          if (swapResult.allCompleted) {
            processCPUTurns(ioInstance, room);
          }
        }
      }
      return;
    }

    if (room.gameState.phase === 'playing') {
      processCPUTurns(ioInstance, room);
    }
  }, BOT_TAKEOVER_DELAY_MS);

  takeoverTimers.set(key, timerId);
}

function getCpuTurnDelayMs(room) {
  const cpuSpeedMultiplier = sanitizeCpuSpeedMultiplier(room?.options?.cpuSpeedMultiplier);
  return Math.max(120, Math.round(RuntimeConfig.cpuTurnDelayMs / cpuSpeedMultiplier));
}

function processCPUTurns(ioInstance, room, depth = 0) {
  if (depth > 20 || !room || !room.gameState || room.gameState.phase !== 'playing') {
    return;
  }

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

  room.gameState.cpuTurnInProgress = true;

  setTimeout(() => {
    if (room.gameState.phase !== 'playing' || !room.gameState.cpuTurnInProgress) {
      room.gameState.cpuTurnInProgress = false;
      return;
    }

    const result = room.executeCPUTurn();
    room.gameState.cpuTurnInProgress = false;

    if (result.success) {
      touchRoom(room.roomCode);

      emitRoomState(ioInstance, room);

      if (result.roundEnded) {
        emitSwapRequests(ioInstance, room);
      } else {
        processCPUTurns(ioInstance, room, depth + 1);
      }
    }
  }, getCpuTurnDelayMs(room));
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
      const playerName = normalizePlayerName(data?.playerName);

      if (!isValidPlayerName(playerName)) {
        socket.emit('error', { message: 'Enter a player name up to 50 characters.' });
        return;
      }

      const room = new GameRoom(code, null, {
        ...buildRoomOptions(numPlayers, data?.options)
      });

      const identity = buildHumanPlayerIdentity();
      const playerResult = room.addPlayer(socket.id, playerName, false, identity);
      if (!playerResult.success) {
        socket.emit('error', { message: playerResult.error });
        return;
      }

      room.hostId = playerResult.player.id;

      for (let i = 0; i < numCPU; i++) {
        const cpuPlayerId = 'CPU-' + (i + 1) + '-' + Date.now() + '-' + i;
        room.addPlayer(cpuPlayerId, 'CPU ' + (i + 1), true, { playerId: cpuPlayerId });
      }

      gameRooms.set(code, room);
      touchRoom(code);
      socket.join(code);

      console.log('[CREATE] Room ' + code + ' created with ' + room.players.length + ' players');

      socket.emit('game-created', {
        roomCode: code,
        reconnectToken: playerResult.player.reconnectToken
      });
      emitRoomState(io, room);

      room.log('Room created with ' + numCPU + ' CPU players');
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [CreateGame] ${err.message}`, { socketId: socket.id, playerName: data?.playerName });
      socket.emit('error', { message: 'Failed to create game. Please try again.' });
    }
  });

  socket.on('join-game', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }

      const resolvedRoom = resolveRoom(socket, data?.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      const reconnectToken = typeof data?.reconnectToken === 'string' ? data.reconnectToken.trim() : '';

      if (reconnectToken) {
        const reconnectResult = room.reconnectPlayer(reconnectToken, socket.id);
        if (reconnectResult.success) {
          console.log('Reconnection: ' + reconnectResult.player.name);
          clearTakeoverTimer(roomCode, reconnectResult.player.id);
          touchRoom(roomCode);
          socket.join(roomCode);
          socket.emit('game-created', {
            roomCode: roomCode,
            reconnectToken: reconnectResult.player.reconnectToken
          });
          socket.emit('reconnected', { message: 'Reconnected' });
          emitRoomState(io, room);
          room.log(reconnectResult.player.name + ' reconnected');

          if (room.gameState.phase === 'playing') {
            processCPUTurns(io, room);
          }
          return;
        }
      }

      const playerName = normalizePlayerName(data?.playerName);
      if (!isValidPlayerName(playerName)) {
        socket.emit('error', { message: 'Enter a player name up to 50 characters.' });
        return;
      }

      if (room.gameState.phase !== 'waiting') {
        socket.emit('error', { message: 'Game already started. Reconnect from your previous session to rejoin.' });
        return;
      }

      const identity = buildHumanPlayerIdentity();
      const result = room.addPlayer(socket.id, playerName, false, identity);
      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      touchRoom(roomCode);
      socket.join(roomCode);
      socket.emit('game-created', {
        roomCode: roomCode,
        reconnectToken: result.player.reconnectToken
      });
      emitRoomState(io, room);
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [JoinGame] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode, playerName: data?.playerName });
      socket.emit('error', { message: 'Failed to join game. Please check code and try again.' });
    }
  });

  socket.on('start-game', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }

      const resolvedRoom = resolveRoom(socket, data?.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      if (!room.isHostSocket(socket.id)) {
        socket.emit('error', { message: 'Only the host can start the game.' });
        return;
      }

      const result = room.startGame();
      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      touchRoom(roomCode);
      io.to(roomCode).emit('game-started');
      emitRoomState(io, room);
      processCPUTurns(io, room);
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [StartGame] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode });
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

      const resolvedRoom = resolveRoom(socket, data.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      const playerId = room.getPlayerIdBySocketId(socket.id);
      if (!playerId) {
        socket.emit('error', { message: 'Only active players can play cards.' });
        return;
      }

      const result = room.playCards(playerId, data.cardIndices);
      if (result.success) {
        touchRoom(roomCode);
        emitRoomState(io, room);

        if (result.roundEnded) {
          emitSwapRequests(io, room);
        } else {
          processCPUTurns(io, room);
        }
      } else {
        socket.emit('invalid-play', { reason: result.error });
      }
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [PlayCards] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode, cardCount: data?.cardIndices?.length });
      socket.emit('error', { message: 'Failed to play cards. Please try again.' });
    }
  });

  socket.on('pass-turn', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }

      const resolvedRoom = resolveRoom(socket, data?.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      const playerId = room.getPlayerIdBySocketId(socket.id);
      if (!playerId) {
        socket.emit('error', { message: 'Only active players can pass.' });
        return;
      }

      const result = room.passTurn(playerId);
      if (result.success) {
        touchRoom(roomCode);
        emitRoomState(io, room);
        processCPUTurns(io, room);
      } else {
        socket.emit('invalid-play', { reason: result.error });
      }
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [PassTurn] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode });
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

      const resolvedRoom = resolveRoom(socket, data.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      const playerId = room.getPlayerIdBySocketId(socket.id);
      if (!playerId) {
        socket.emit('error', { message: 'Only active players can submit swaps.' });
        return;
      }

      const result = room.submitSwap(playerId, data.cardIndices);
      if (!result.success) {
        socket.emit('invalid-play', { reason: result.error });
      } else {
        touchRoom(roomCode);
        if (result.allCompleted) {
          emitRoomState(io, room);
          processCPUTurns(io, room);
        }
      }
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [SubmitSwap] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode, cardCount: data?.cardIndices?.length });
      socket.emit('error', { message: 'Failed to submit swap. Please try again.' });
    }
  });

  socket.on('update-room-settings', (data) => {
    try {
      if (isRateLimited(socket.id)) {
        socket.emit('error', { message: 'Too many requests. Please wait.' });
        return;
      }

      const resolvedRoom = resolveRoom(socket, data?.roomCode);
      if (!resolvedRoom) {
        return;
      }

      const roomCode = resolvedRoom.roomCode;
      const room = resolvedRoom.room;
      if (!canManageRoomSettings(room, socket.id)) {
        socket.emit('error', { message: 'Only the host can change room settings.' });
        return;
      }

      const nextOptions = Object.assign({}, room.options, {
        cpuSpeedMultiplier: sanitizeCpuSpeedMultiplier(data?.cpuSpeed)
      });

      room.options = GameRules.normalizeOptions(nextOptions);
      touchRoom(roomCode);
      emitRoomState(io, room);
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [UpdateRoomSettings] ${err.message}`, { socketId: socket.id, roomCode: data?.roomCode });
      socket.emit('error', { message: 'Failed to update room settings.' });
    }
  });

  socket.on('create-cpu-game', (data) => {
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
      const rawSpectatorName = normalizePlayerName(data?.spectatorName, 'Spectator');
      const spectatorName = isValidPlayerName(rawSpectatorName) ? rawSpectatorName : 'Spectator';

      const room = new GameRoom(code, null, {
        ...buildRoomOptions(numPlayers, data?.options, { cpuOnly: true })
      });

      for (let i = 0; i < numPlayers; i++) {
        const cpuPlayerId = 'CPU-' + (i + 1) + '-' + Date.now() + '-' + i;
        room.addPlayer(cpuPlayerId, 'CPU ' + (i + 1), true, { playerId: cpuPlayerId });
      }

      room.addSpectator(socket.id, spectatorName);
      gameRooms.set(code, room);
      touchRoom(code);
      socket.join(code);

      console.log('[CPU-GAME] CPU-only room ' + code + ' created with ' + room.players.length + ' CPUs');

      socket.emit('cpu-game-created', { roomCode: code });
      emitRoomState(io, room);

      const startResult = room.startGame();
      if (startResult.success) {
        touchRoom(code);
        io.to(code).emit('game-started');
        emitRoomState(io, room);
        processCPUTurns(io, room);
      }

      room.log('CPU-only game started with spectator');
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(`[${ts}] [CreateCPUGame] ${err.message}`, { socketId: socket.id, numPlayers: data?.options?.num_players });
      socket.emit('error', { message: 'Failed to create CPU game. Please try again.' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
    rateLimiter.delete(socket.id);

    for (const [roomCode, room] of gameRooms.entries()) {
      const disconnectResult = room.disconnectSocket(socket.id);
      if (!disconnectResult.success) {
        continue;
      }

      if (disconnectResult.type === 'player-disconnected' && disconnectResult.player) {
        scheduleBotTakeover(io, roomCode, disconnectResult.player.id);
      }

      touchRoom(roomCode);
      emitRoomState(io, room);
    }

    setTimeout(cleanupEmptyRooms, 1000);
  });
});

const PORT = Number(process.env.PORT || RuntimeConfig.defaultPort);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use.');
    console.error('Use a free port, for example in PowerShell: $env:PORT=8080; npm start');
    process.exit(1);
  }

  console.error('Server failed to start:', error.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('President v1.6.175 on port ' + PORT);
  console.log('FIXED: 2s bombing now works!');
  console.log('Serving static assets from ' + publicDir);
});

process.on('SIGTERM', () => {
  for (const timerId of takeoverTimers.values()) {
    clearTimeout(timerId);
  }
  server.close();
  process.exit(0);
});
