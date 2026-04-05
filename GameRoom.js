import { Deck } from './Deck.js';
import { GameRules } from './GameRules.js';
import { Validator } from './Validator.js';
import { CPUAI } from './CPUAI.js';
import { RankSystem } from './RankSystem.js';

/**
 * Represents a single game room for President.
 * @class
 */
export class GameRoom {
  /**
   * @param {string} code - Room code
   * @param {string|null} host - Host socket id
   * @param {object} opts - Game options
   */
  constructor(code, host, opts) {
    /** @type {string} */
    this.roomCode = code;
    /** @type {string|null} */
    this.hostId = host;
    /** @type {object} */
    this.options = GameRules.normalizeOptions(opts);
    /** @type {Array<object>} */
    this.players = [];
    /** @type {Array<object>} */
    this.spectators = [];
    /** @type {object} */
    this.gameState = {
      phase: 'waiting',
      currentPlayerIndex: 0,
      lastPlay: { type: 'none', cards: [], rank: 0, length: 0 },
      lastPlayerId: null,
      pile: [],
      passCount: 0,
      finishOrder: [],
      round: 0,
      roles: {},
      swapPending: {},
      swapsCompleted: {},
      gameLog: [],
      cpuTurnInProgress: false
    };
  }

  /**
   * Get the gameplay rule settings that should be visible to clients.
   * @returns {object}
   */
  getGameplayRules() {
    return {
      jackOfDiamondsBomb: this.options.jackOfDiamondsBomb !== false,
      tripleSixesBeatJd: this.options.tripleSixesBeatJd === true,
      runsAllowed: this.options.runsAllowed === true,
      minRunLength: Math.max(3, Math.min(GameRules.runRanks.length, Number(this.options.minRunLength) || 3)),
      maxRunLength: Math.max(3, Math.min(GameRules.runRanks.length, Number(this.options.maxRunLength) || 5))
    };
  }

  /**
   * Log a message to the game log and console.
   * @param {string} msg
   */
  log(msg) {
    const ts = new Date().toLocaleTimeString();
    this.gameState.gameLog.push({ timestamp: ts, msg: msg, type: 'info' });
    console.log('[GameRoom ' + this.roomCode + '] ' + msg);
    if (this.gameState.gameLog.length > 100) this.gameState.gameLog.shift();
  }

  /**
   * Add a player to the room.
   * @param {string} socketId
   * @param {string} name
   * @param {boolean} [isCPU=false]
   * @param {{playerId?: string, reconnectToken?: string}} [metadata]
   * @returns {{success: boolean, error?: string, player?: object}}
   */
  addPlayer(socketId, name, isCPU, metadata) {
    if (isCPU === undefined) isCPU = false;
    if (metadata === undefined) metadata = {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return { success: false, error: 'Invalid player name' };
    }
    if (this.players.length >= this.options.num_players) {
      return { success: false, error: 'Room full' };
    }

    const normalizedName = trimmedName.toLowerCase();
    if (!isCPU) {
      const duplicate = this.players.find(player => !player.isCPU && player.normalizedName === normalizedName);
      if (duplicate) {
        return { success: false, error: 'Name already taken' };
      }
    }

    const player = {
      id: metadata.playerId || socketId,
      socketId: isCPU ? null : socketId,
      name: trimmedName,
      normalizedName: normalizedName,
      reconnectToken: isCPU ? null : (metadata.reconnectToken || null),
      isCPU: isCPU,
      connected: isCPU ? true : true,
      hand: [],
      finished: false,
      finishPosition: null
    };

    this.players.push(player);
    if (!this.hostId && !isCPU) {
      this.hostId = player.id;
    }
    this.log(trimmedName + ' joined' + (isCPU ? ' (CPU)' : ''));
    return { success: true, player: player };
  }

  /**
   * Find a player by stable player id.
   * @param {string} playerId
   * @returns {object|undefined}
   */
  getPlayerById(playerId) {
    return this.players.find(player => player.id === playerId);
  }

  /**
   * Deal cards to all players and sort their hands.
   */
  dealCards() {
    const numDecks = Math.max(1, Number(this.options.num_decks) || 1);
    const deck = new Deck(numDecks);
    deck.shuffle();
    const hands = deck.deal(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.hand = hands[i];
      p.finished = false;
      p.finishPosition = null;
      p.hand = RankSystem.sortCards(p.hand, this.options);
      this.log(p.name + ' dealt ' + p.hand.length + ' cards');
    }
  }

  /**
   * Start a new round of the game.
   * @returns {{success: boolean, error?: string}}
   */
  startGame() {
    if (this.gameState.phase !== 'waiting') {
      return { success: false, error: 'Game already started' };
    }
    if (this.players.length < 2) {
      return { success: false, error: 'Need at least 2 players' };
    }
    this.dealCards();
    this.gameState.currentPlayerIndex = GameRules.getStartingPlayer(this.players);
    this.gameState.phase = 'playing';
    this.gameState.round++;
    this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
    this.gameState.passCount = 0;
    this.gameState.finishOrder = [];
    this.log('Round ' + this.gameState.round + ' started');
    return { success: true };
  }

  /**
   * Attempt to play cards for a player.
   * @param {string} id
   * @param {Array<number>} indices
   * @returns {{success: boolean, error?: string, playType?: object, roundEnded?: boolean}}
   */
  playCards(id, indices) {
    const p = this.players.find(x => x.id === id);
    if (!p || this.gameState.phase !== 'playing' || p.finished || (!p.isCPU && p.connected === false)) {
      return { success: false, error: 'Invalid player state' };
    }
    if (this.players[this.gameState.currentPlayerIndex].id !== id) {
      return { success: false, error: 'Not your turn' };
    }

    // Validate indices: must be array of unique integers within hand bounds
    if (!Array.isArray(indices) || indices.length === 0 ||
        indices.some(i => typeof i !== 'number' || i < 0 || i >= p.hand.length) ||
        new Set(indices).size !== indices.length) {
      return { success: false, error: 'Invalid card selection' };
    }

    const sel = indices.map(i => p.hand[i]).filter(c => c);
    const type = Validator.getPlayType(sel, this.options);
    if (type.type === 'invalid') {
      this.log(p.name + ' play rejected: ' + type.error);
      return { success: false, error: type.error };
    }

    const beat = Validator.canBeatPlay(type, this.gameState.lastPlay, this.options);
    if (!beat.canBeat) {
      this.log(p.name + ' cannot beat: ' + (beat.error || 'too weak'));
      return { success: false, error: beat.error || 'Cannot beat' };
    }

    p.hand = p.hand.filter((c, i) => !indices.includes(i));
    p.hand = RankSystem.sortCards(p.hand, this.options);
    this.gameState.lastPlay = type;
    this.gameState.lastPlayerId = id;
    this.gameState.passCount = 0;
    this.log(p.name + ' played ' + type.length + ' card(s)');

    if (p.hand.length === 0) {
      p.finished = true;
      p.finishPosition = this.gameState.finishOrder.length + 1;
      this.gameState.finishOrder.push(id);
      this.log(p.name + ' finished #' + p.finishPosition);
      if (this.checkRoundEnd()) {
        this.endRound();
        return { success: true, playType: type, roundEnded: true };
      }
    }

    this.advanceToNextPlayer();
    return { success: true, playType: type };
  }

  /**
   * Pass the turn for a player.
   * @param {string} id
   * @returns {{success: boolean, error?: string}}
   */
  passTurn(id) {
    const curr = this.players[this.gameState.currentPlayerIndex];
    if (curr.id !== id || curr.finished || (!curr.isCPU && curr.connected === false)) {
      return { success: false };
    }
    if (this.gameState.lastPlay.type === 'none') {
      return { success: false, error: 'Cannot pass on first play' };
    }

    this.log(curr.name + ' passed');
    this.gameState.passCount++;
    const active = this.players.filter(p => !p.finished).length;
    if (this.gameState.passCount >= active - 1) {
      this.gameState.pile = [];
      this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
      this.gameState.passCount = 0;
      this.log('Pile cleared');
    }
    this.advanceToNextPlayer();
    return { success: true };
  }

  /**
   * Advance to the next active player.
   */
  advanceToNextPlayer() {
    let attempts = 0;
    let next = (this.gameState.currentPlayerIndex + 1) % this.players.length;
    while (this.players[next].finished && attempts < this.players.length) {
      next = (next + 1) % this.players.length;
      attempts++;
    }
    this.gameState.currentPlayerIndex = next;
  }

  /**
   * Check if the round has ended.
   * @returns {boolean}
   */
  checkRoundEnd() {
    return this.players.filter(p => !p.finished).length <= 1;
  }

  /**
   * End the current round and assign roles.
   */
  endRound() {
    this.log('Round ' + this.gameState.round + ' ended');
    const last = this.players.find(p => !p.finished);
    if (last) {
      last.finished = true;
      last.finishPosition = this.gameState.finishOrder.length + 1;
      this.gameState.finishOrder.push(last.id);
      this.log(last.name + ' finished #' + last.finishPosition);
    }

    this.gameState.roles = GameRules.assignRoles(this.gameState.finishOrder, this.players.length);
    this.dealCards();
    this.gameState.phase = 'swapping';
    this.gameState.swapPending = {};
    this.gameState.swapsCompleted = {};
    this.initializeSwaps();
  }

  /**
   * Initialize card swaps for the new round.
   */
  initializeSwaps() {
    const n = this.players.length;
    const fo = this.gameState.finishOrder;

    if (n < 2 || fo.length < 2) {
      this.startGameAfterSwap();
      return;
    }

    if (n === 2) {
      this.gameState.swapPending[fo[0]] = { role: 'Player 1', count: 1, cards: [], to: fo[1] };
      this.gameState.swapPending[fo[1]] = { role: 'Player 2', count: 1, cards: [], to: fo[0] };
    } else if (n === 3) {
      this.gameState.swapPending[fo[0]] = { role: 'President', count: 2, cards: [], to: fo[2] };
      this.gameState.swapPending[fo[2]] = { role: 'Asshole', count: 2, cards: [], to: fo[0] };
    } else {
      if (fo[0]) this.gameState.swapPending[fo[0]] = { role: 'President', count: 2, cards: [], to: fo[n-1] };
      if (fo[n-1]) this.gameState.swapPending[fo[n-1]] = { role: 'Asshole', count: 2, cards: [], to: fo[0] };
      if (fo[1]) this.gameState.swapPending[fo[1]] = { role: 'Vice President', count: 1, cards: [], to: fo[n-2] };
      if (fo[n-2]) this.gameState.swapPending[fo[n-2]] = { role: 'Vice Asshole', count: 1, cards: [], to: fo[1] };
    }
  }

  /**
   * Submit a swap for a player.
   * @param {string} id
   * @param {Array<number>} indices
   * @returns {{success: boolean, allCompleted?: boolean}}
   */
  submitSwap(id, indices) {
    if (this.gameState.phase !== 'swapping') return { success: false };
    const s = this.gameState.swapPending[id];
    if (!s || !Array.isArray(indices) || indices.length !== s.count) return { success: false };
    const p = this.players.find(x => x.id === id);
    if (!p || (!p.isCPU && p.connected === false)) return { success: false };
    if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= p.hand.length) || new Set(indices).size !== indices.length) {
      return { success: false };
    }
    const sel = indices.map(i => p.hand[i]).filter(c => c);
    if (sel.length !== s.count) return { success: false };
    s.cards = sel;
    this.gameState.swapsCompleted[id] = true;
    this.log(p.name + ' submitted swap');
    return { success: true, allCompleted: this.checkAndProcessSwaps() };
  }

  /**
   * Check if all swaps are complete and process them.
   * @returns {boolean}
   */
  checkAndProcessSwaps() {
    const pids = Object.keys(this.gameState.swapPending);
    if (pids.length === 0) {
      this.startGameAfterSwap();
      return true;
    }
    const allDone = pids.every(id => this.gameState.swapsCompleted[id]);
    if (!allDone) return false;

    this.log('Processing swaps...');
    for (let i = 0; i < pids.length; i++) {
      const fid = pids[i];
      const s = this.gameState.swapPending[fid];
      const f = this.players.find(p => p.id === fid);
      const t = this.players.find(p => p.id === s.to);
      if (!f || !t) continue;
      for (let j = 0; j < s.cards.length; j++) {
        const c = s.cards[j];
        // Match by ID first (most precise), fallback to rank/suit for compatibility
        const idx = f.hand.findIndex(x => (c.id !== undefined && x.id === c.id) || (x.rank === c.rank && x.suit === c.suit));
        if (idx !== -1) {
          f.hand.splice(idx, 1);
          t.hand.push(c);
        }
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].hand = RankSystem.sortCards(this.players[i].hand, this.options);
    }
    this.log('Swaps complete');
    this.startGameAfterSwap();
    return true;
  }

  /**
   * Start a new round after swaps are processed.
   */
  startGameAfterSwap() {
    let ah = null;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const r = this.gameState.roles[p.id];
      if (r === 'Asshole' || r === 'Vice Asshole') {
        ah = p;
        break;
      }
    }
    this.gameState.currentPlayerIndex = ah ? this.players.indexOf(ah) : 0;
    this.gameState.phase = 'playing';
    this.gameState.round++;
    this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
    this.gameState.passCount = 0;
    this.gameState.finishOrder = [];
    this.gameState.swapPending = {};
    this.gameState.swapsCompleted = {};
    this.log('Round ' + this.gameState.round + ' started');
  }

  /**
   * Check if the current player is a CPU.
   * @returns {boolean}
   */
  isCurrentPlayerCPU() {
    const curr = this.players[this.gameState.currentPlayerIndex];
    return curr ? curr.isCPU : false;
  }

  /**
   * Execute the CPU's turn if it's their move.
   * @returns {object}
   */
  executeCPUTurn() {
    const curr = this.players[this.gameState.currentPlayerIndex];
    if (!curr || !curr.isCPU || curr.finished) return { success: false };
    const d = CPUAI.decideTurn(curr.hand, this.gameState.lastPlay, this.options);
    return d.action === 'play' ? this.playCards(curr.id, d.cardIndices) : this.passTurn(curr.id);
  }

  /**
   * Find a human player by their socket id.
   * @param {string} socketId
   * @returns {object|undefined}
   */
  getPlayerBySocketId(socketId) {
    return this.players.find(player => !player.isCPU && player.socketId === socketId);
  }

  /**
   * Resolve a socket id to the stable player id.
   * @param {string} socketId
   * @returns {string|null}
   */
  getPlayerIdBySocketId(socketId) {
    const player = this.getPlayerBySocketId(socketId);
    return player ? player.id : null;
  }

  /**
   * Find a reconnectable player by token.
   * @param {string} reconnectToken
   * @returns {object|undefined}
   */
  getPlayerByReconnectToken(reconnectToken) {
    return this.players.find(player => player.reconnectToken === reconnectToken);
  }

  /**
   * Reconnect an existing player without changing their stable player id.
   * @param {string} reconnectToken
   * @param {string} socketId
   * @returns {{success: boolean, error?: string, player?: object}}
   */
  reconnectPlayer(reconnectToken, socketId) {
    const player = this.getPlayerByReconnectToken(reconnectToken);
    if (!player) {
      return { success: false, error: 'Reconnect token not found' };
    }

    player.socketId = socketId;
    player.connected = true;
    player.isCPU = false;
    return { success: true, player: player };
  }

  /**
   * Promote a disconnected human player to CPU control.
   * @param {string} playerId
   * @returns {{success: boolean, error?: string, player?: object}}
   */
  promoteDisconnectedPlayerToCPU(playerId) {
    const player = this.getPlayerById(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    if (player.isCPU || player.connected !== false || player.finished) {
      return { success: false, error: 'Player is not eligible for takeover' };
    }

    player.isCPU = true;
    player.connected = true;
    this.log(player.name + ' was taken over by a bot');
    return { success: true, player: player };
  }

  /**
   * Choose the cards a bot should give away during a swap.
   * @param {string} playerId
   * @returns {Array<number>}
   */
  getBotSwapIndices(playerId) {
    const player = this.getPlayerById(playerId);
    const pendingSwap = this.gameState.swapPending[playerId];
    if (!player || !pendingSwap) {
      return [];
    }

    const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 };
    return player.hand
      .map((card, index) => ({
        index: index,
        value: RankSystem.rankValue(card, this.options),
        suitOrder: suitOrder[card.suit] || 0
      }))
      .sort((a, b) => b.value - a.value || b.suitOrder - a.suitOrder || a.index - b.index)
      .slice(0, pendingSwap.count)
      .map(entry => entry.index);
  }

  /**
   * Check whether the provided socket currently belongs to the host.
   * @param {string} socketId
   * @returns {boolean}
   */
  isHostSocket(socketId) {
    const playerId = this.getPlayerIdBySocketId(socketId);
    return Boolean(playerId) && playerId === this.hostId;
  }

  /**
   * Reassign the host to the next available human player.
   * @returns {string|null}
   */
  reassignHost() {
    const nextHost = this.players.find(player => !player.isCPU);
    this.hostId = nextHost ? nextHost.id : null;
    return this.hostId;
  }

  /**
   * Disconnect a human player or spectator by socket id.
   * @param {string} socketId
   * @returns {{success: boolean, type?: string, player?: object, spectator?: object, error?: string}}
   */
  disconnectSocket(socketId) {
    const spectatorIndex = this.spectators.findIndex(spectator => spectator.id === socketId);
    if (spectatorIndex !== -1) {
      const spectator = this.spectators[spectatorIndex];
      this.spectators.splice(spectatorIndex, 1);
      this.log(spectator.name + ' left as spectator');
      return { success: true, type: 'spectator-removed', spectator: spectator };
    }

    const player = this.getPlayerBySocketId(socketId);
    if (!player) {
      return { success: false, error: 'Socket not found' };
    }

    if (this.gameState.phase === 'waiting') {
      const playerIndex = this.players.findIndex(entry => entry.id === player.id);
      if (playerIndex !== -1) {
        this.players.splice(playerIndex, 1);
      }
      if (this.hostId === player.id) {
        this.reassignHost();
      }
      this.log(player.name + ' left');
      return { success: true, type: 'player-removed', player: player };
    }

    player.connected = false;
    player.socketId = null;
    this.log(player.name + ' disconnected');
    return { success: true, type: 'player-disconnected', player: player };
  }

  /**
   * Check if any human players are currently connected.
   * @returns {boolean}
   */
  hasConnectedHumans() {
    return this.players.some(player => !player.isCPU && player.connected !== false);
  }

  /**
   * Check if any spectators are currently connected.
   * @returns {boolean}
   */
  hasConnectedSpectators() {
    return this.spectators.length > 0;
  }

  /**
   * Check if the room has any connected non-CPU participants.
   * @returns {boolean}
   */
  hasConnectedParticipants() {
    return this.hasConnectedHumans() || this.hasConnectedSpectators();
  }

  /**
   * Check if the room has no human players.
   * @returns {boolean}
   */
  isEmpty() {
    return this.players.filter(p => !p.isCPU).length === 0 && this.spectators.length === 0;
  }

  /**
   * Check if all human players have finished.
   * @returns {boolean}
   */
  isInactive() {
    const activePlayers = this.players.filter(p => !p.finished && !p.isCPU && p.connected !== false);
    return activePlayers.length === 0;
  }

  /**
   * Check if the room is CPU-only.
   * @returns {boolean}
   */
  isCPUOnly() {
    return this.options.cpuOnly === true;
  }

  /**
   * Add a spectator to the room.
   * @param {string} id
   * @param {string} [name]
   * @returns {{success: boolean}}
   */
  addSpectator(id, name) {
    const existing = this.spectators.find(spectator => spectator.id === id);
    if (existing) {
      return { success: true, spectator: existing };
    }

    const spectator = {
      id: id,
      name: name || 'Spectator',
      joinedAt: new Date().toISOString()
    };

    this.spectators.push(spectator);
    this.log(spectator.name + ' joined as spectator');
    return { success: true, spectator: spectator };
  }

  /**
   * Remove a spectator from the room.
   * @param {string} id
   * @returns {{success: boolean, error?: string}}
   */
  removeSpectator(id) {
    const index = this.spectators.findIndex(s => s.id === id);
    if (index !== -1) {
      const spectator = this.spectators[index];
      this.spectators.splice(index, 1);
      this.log(spectator.name + ' left as spectator');
      return { success: true };
    }
    return { success: false, error: 'Spectator not found' };
  }

  /**
   * Get the full game state for a spectator.
   * @param {string} spectatorId
   * @returns {object}
   */
  getSpectatorState(spectatorId) {
    const curr = this.players[this.gameState.currentPlayerIndex];
    const cpuSpeedMultiplier = Math.max(0.3, Math.min(2, Number(this.options.cpuSpeedMultiplier) || 1));
    return {
      roomCode: this.roomCode,
      phase: this.gameState.phase,
      round: this.gameState.round,
      viewerId: null,
      isHost: false,
      canStart: false,
      currentPlayerName: curr ? curr.name : null,
      currentPlayerId: curr ? curr.id : null,
      lastPlay: this.gameState.lastPlay,
      settings: {
        cpuSpeedMultiplier: cpuSpeedMultiplier,
        gameplayRules: this.getGameplayRules()
      },
      roles: this.gameState.roles,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        connected: p.isCPU ? true : p.connected !== false,
        handSize: p.hand.length,
        finished: p.finished,
        hand: p.hand // Spectators see all hands
      })),
      isSpectator: true
    };
  }

  /**
   * Get the public game state for a player.
   * @param {string|null} rid
   * @returns {object}
   */
  getPublicState(rid) {
    const curr = this.players[this.gameState.currentPlayerIndex];
    const hasEnoughPlayers = this.players.length >= 2;
    const cpuSpeedMultiplier = Math.max(0.3, Math.min(2, Number(this.options.cpuSpeedMultiplier) || 1));
    return {
      roomCode: this.roomCode,
      phase: this.gameState.phase,
      round: this.gameState.round,
      viewerId: rid,
      isHost: rid ? this.hostId === rid : false,
      canStart: Boolean(rid) && this.hostId === rid && this.gameState.phase === 'waiting' && hasEnoughPlayers,
      currentPlayerName: curr ? curr.name : null,
      currentPlayerId: curr ? curr.id : null,
      lastPlay: this.gameState.lastPlay,
      settings: {
        cpuSpeedMultiplier: cpuSpeedMultiplier,
        gameplayRules: this.getGameplayRules()
      },
      roles: this.gameState.roles,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        connected: p.isCPU ? true : p.connected !== false,
        handSize: p.hand.length,
        finished: p.finished,
        hand: p.id === rid ? p.hand : null
      })),
      isSpectator: false
    };
  }
}
