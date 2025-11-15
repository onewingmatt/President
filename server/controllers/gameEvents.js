import { GameRoom } from '../GameRoom.js';

const gameRooms = new Map();

function generateRoomCode() {
  return Array(6).fill(0).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

function triggerCPUTurn(io, room, depth = 0) {
  if (depth > 20 || room.gameState.phase !== 'playing') return;
  const current = room.players[room.gameState.currentPlayerIndex];
  if (!current || !current.isCPU) return;

  setTimeout(() => {
    if (room.gameState.phase !== 'playing') return;
    const result = room.executeCPUTurn();
    if (!result?.success) return;
    room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
    if (result.roundEnded) return;
    if (room.gameState.phase === 'playing') {
      const next = room.players[room.gameState.currentPlayerIndex];
      if (next.isCPU) triggerCPUTurn(io, room, depth + 1);
    }
  }, 700);
}

function handleCPUSwaps(io, room) {
  if (room.gameState.phase !== 'swapping') return;
  const cpuPlayers = room.players.filter(p => p.isCPU && room.gameState.swapPending[p.id] && !room.gameState.swapsCompleted[p.id]);
  if (cpuPlayers.length === 0) return;
  setTimeout(() => {
    cpuPlayers.forEach(cpu => { room.autoSwapForCPU(cpu.id); });
    room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
  }, 1500);
}

export function registerGameEvents(io) {
  io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    socket.on('create-game', (data) => {
      const roomCode = generateRoomCode();
      const numPlayers = Math.min(8, Math.max(2, data.options.num_players || 4));
      const numCPU = Math.min(numPlayers - 1, Math.max(0, data.options.numCPU || 0));

      const room = new GameRoom(roomCode, socket.id, {
        ...data.options,
        num_players: numPlayers,
        num_decks: numPlayers > 4 ? 2 : 1
      });

      room.addPlayer(socket.id, data.playerName, false);

      if (data.options.addCPU && numCPU > 0) {
        for (let i = 0; i < numCPU; i++) {
          room.addPlayer('CPU-' + i + '-' + Date.now(), 'CPU ' + (i + 1), true);
        }
      }

      gameRooms.set(roomCode, room);
      socket.join(roomCode);
      socket.emit('game-created', { roomCode });
      io.to(roomCode).emit('game-state-update', room.getPublicState(socket.id));
    });

    socket.on('join-game', (data) => {
      const room = gameRooms.get(data.roomCode);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.gameState.phase !== 'waiting') { socket.emit('error', { message: 'Game already started' }); return; }
      const result = room.addPlayer(socket.id, data.playerName, false);
      if (!result.success) { socket.emit('error', { message: result.error }); return; }
      socket.join(data.roomCode);
      socket.emit('game-created', { roomCode: data.roomCode });
      io.to(data.roomCode).emit('game-state-update', room.getPublicState(socket.id));
    });

    socket.on('start-game', (data) => {
      const room = gameRooms.get(data.roomCode);
      if (!room || room.hostId !== socket.id) return;
      const result = room.startGame();
      if (!result.success) return;
      io.to(data.roomCode).emit('game-started');
      room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
      setTimeout(() => { if (room.gameState.phase === 'playing' && room.isCurrentPlayerCPU()) triggerCPUTurn(io, room); }, 1000);
    });

    socket.on('play-cards', (data) => {
      const room = gameRooms.get(data.roomCode);
      if (!room) return;
      const result = room.playCards(socket.id, data.cardIndices);
      if (result.success) {
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        if (result.roundEnded) { handleCPUSwaps(io, room); } else if (room.gameState.phase === 'playing') {
          const next = room.players[room.gameState.currentPlayerIndex];
          if (next.isCPU) setTimeout(() => triggerCPUTurn(io, room), 400);
        }
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    socket.on('pass-turn', (data) => {
      const room = gameRooms.get(data.roomCode);
      if (!room) return;
      const result = room.passTurn(socket.id);
      if (result.success) {
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        if (room.gameState.phase === 'playing') {
          const next = room.players[room.gameState.currentPlayerIndex];
          if (next.isCPU) setTimeout(() => triggerCPUTurn(io, room), 400);
        }
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    socket.on('submit-swap', (data) => {
      const room = gameRooms.get(data.roomCode);
      if (!room) return;
      const result = room.submitSwap(socket.id, data.cardIndices);
      if (result.success) {
        room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
        if (result.allCompleted) {
          setTimeout(() => {
            room.players.forEach(p => io.to(p.id).emit('game-state-update', room.getPublicState(p.id)));
            if (room.gameState.phase === 'playing' && room.isCurrentPlayerCPU()) triggerCPUTurn(io, room);
          }, 500);
        }
      } else {
        socket.emit('error', { message: result.error });
      }
    });
  });
}
