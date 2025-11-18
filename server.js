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
  pingTimeout: 30000,
  pingInterval: 5000,
  maxHttpBufferSize: 1e6,
  allowUpgrades: true,
  perMessageDeflate: false,
});

app.use(cors());
app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const gameRooms = new Map();
const cpuTimeouts = new Map();

function generateRoomCode() {
  return Array(6).fill(0).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

function clearCPUTimeout(roomCode) {
  if (cpuTimeouts.has(roomCode)) {
    clearTimeout(cpuTimeouts.get(roomCode));
    cpuTimeouts.delete(roomCode);
  }
}

function triggerCPUTurn(io, room, depth = 0) {
  if (depth > 10) return;
  if (room.gameState.phase !== 'playing') return;

  const current = room.players[room.gameState.currentPlayerIndex];
  if (!current || !current.isCPU || current.finished) return;

  clearCPUTimeout(room.roomCode);
  const timeout = setTimeout(() => {
    try {
      const result = room.executeCPUTurn();
      if (!result?.success) return;

      if (result.cpuPlayedCards) {
        const cardStrs = result.cpuPlayedCards.filter(c => c).map(c => c.toJSON ? c.toJSON() : c);
        io.to(room.roomCode).emit('card-played', { playerName: current.name, cards: cardStrs });
      }
      if (result.cpuPassed) {
        io.to(room.roomCode).emit('player-passed', { playerName: current.name });
      }

      room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));

      if (result.roundEnded) {
        io.to(room.roomCode).emit('round-end', { roles: room.gameState.roles, finishOrder: room.gameState.finishOrder, players: room.players.map(p => ({ id: p.id, name: p.name, hand: p.hand.map(c => c.toJSON()), role: room.gameState.roles[p.id] || 'None' })) });
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        return;
      }

      if (room.gameState.phase === 'playing') {
        const next = room.players[room.gameState.currentPlayerIndex];
        if (next && next.isCPU && !next.finished) {
          triggerCPUTurn(io, room, depth + 1);
        }
      }
    } catch (err) {
      console.error('CPU turn error:', err);
    }
  }, 500 + (depth * 200));

  cpuTimeouts.set(room.roomCode, timeout);
}

io.on('connection', (socket) => {
  const heartbeatInterval = setInterval(() => {
    if (socket.connected) socket.emit('heartbeat', { timestamp: Date.now() });
  }, 5000);

  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
    clearCPUTimeout(socket.id);
  });

  socket.on('heartbeat-response', () => {});

  socket.on('create-game', (data) => {
    try {
      const code = generateRoomCode();
      const numPlayers = Math.min(8, Math.max(2, data.options?.num_players || 4));
      const numCPU = Math.min(numPlayers - 1, Math.max(0, data.options?.numCPU || 0));
      const room = new GameRoom(code, socket.id, { num_players: numPlayers, num_decks: numPlayers > 4 ? 2 : 1 });
      room.addPlayer(socket.id, data.playerName, false);
      for (let i = 0; i < numCPU; i++) room.addPlayer('CPU' + (i + 1), 'CPU ' + (i + 1), true);
      gameRooms.set(code, room);
      socket.join(code);
      socket.emit('game-created', { roomCode: code });
      io.to(code).emit('game-state-update', room.getPublicState(socket.id));
    } catch (err) {
      console.error('Create game error:', err);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('join-game', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      socket.join(roomCode);
      const result = room.addPlayer(socket.id, data.playerName, false);
      if (!result.success) { socket.emit('error', { message: 'Room full' }); return; }
      socket.emit('game-created', { roomCode });
      io.to(roomCode).emit('game-state-update', room.getPublicState(socket.id));
    } catch (err) {
      console.error('Join game error:', err);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  socket.on('start-game', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);
      if (!room || room.hostId !== socket.id) return;
      const result = room.startGame();
      if (!result.success) return;
      io.to(roomCode).emit('game-started');
      room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
      setTimeout(() => { if (room.gameState.phase === 'playing' && room.isCurrentPlayerCPU()) triggerCPUTurn(io, room); }, 1000);
    } catch (err) {
      console.error('Start game error:', err);
    }
  });

  socket.on('play-cards', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      clearCPUTimeout(roomCode);
      const result = room.playCards(socket.id, data.cardIndices);
      if (result.success) {
        const cardsToPlay = data.cardIndices.map(i => player.hand[i]).filter(c => c);
        if (cardsToPlay.length > 0) {
          io.to(roomCode).emit('card-played', { playerName: player.name, cards: cardsToPlay.map(c => c.toJSON ? c.toJSON() : c) });
        }
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        if (result.roundEnded) {
          io.to(roomCode).emit('round-end', { roles: room.gameState.roles, finishOrder: room.gameState.finishOrder, players: room.players.map(p => ({ id: p.id, name: p.name, hand: p.hand.map(c => c.toJSON()), role: room.gameState.roles[p.id] || 'None' })) });
          room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        } else if (room.gameState.phase === 'playing') {
          const next = room.players[room.gameState.currentPlayerIndex];
          if (next.isCPU) setTimeout(() => triggerCPUTurn(io, room), 500);
        }
      } else {
        socket.emit('invalid-play', { reason: result.reason || 'Invalid play' });
      }
    } catch (err) {
      console.error('Play cards error:', err);
    }
  });

  socket.on('pass-turn', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);
      if (!room) return;
      clearCPUTimeout(roomCode);
      const result = room.passTurn(socket.id);
      if (result.success) {
        const player = room.players.find(p => p.id === socket.id);
        io.to(roomCode).emit('player-passed', { playerName: player.name });
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        if (result.roundEnded) {
          io.to(roomCode).emit('round-end', { roles: room.gameState.roles, finishOrder: room.gameState.finishOrder, players: room.players.map(p => ({ id: p.id, name: p.name, hand: p.hand.map(c => c.toJSON()), role: room.gameState.roles[p.id] || 'None' })) });
          room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        } else if (room.gameState.phase === 'playing') {
          const next = room.players[room.gameState.currentPlayerIndex];
          if (next.isCPU) setTimeout(() => triggerCPUTurn(io, room), 500);
        }
      }
    } catch (err) {
      console.error('Pass turn error:', err);
    }
  });

  socket.on('submit-card-exchange', (data) => {
    try {
      const roomCode = data.roomCode.toUpperCase().trim();
      const room = gameRooms.get(roomCode);
      if (!room) return;
      const cardIndices = {};
      room.players.forEach(p => { cardIndices[p.id] = []; });
      cardIndices[socket.id] = data.cardIndices || [];
      room.players.forEach(p => {
        if (p.isCPU) {
          const role = room.gameState.roles[p.id];
          const toSwap = [];
          if (role === 'President' || role === 'Vice President') {
            for (let i = 0; i < (role === 'President' ? 2 : 1) && i < p.hand.length; i++) toSwap.push(i);
          } else if (role === 'Asshole' || role === 'Vice Asshole') {
            const count = role === 'Asshole' ? 2 : 1;
            for (let i = 0; i < count && i < p.hand.length; i++) toSwap.push(p.hand.length - 1 - i);
          }
          cardIndices[p.id] = toSwap;
        }
      });
      room.exchangeCards(cardIndices);
      room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
      clearCPUTimeout(roomCode);
      setTimeout(() => { if (room.gameState.phase === 'playing' && room.isCurrentPlayerCPU()) triggerCPUTurn(io, room); }, 1000);
    } catch (err) {
      console.error('Card exchange error:', err);
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ President v1.6.141 on port ${PORT}`));

process.on('SIGTERM', () => { server.close(); process.exit(0); });
