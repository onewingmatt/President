import { Deck } from './game-logic/Deck.js';
import { GameRules } from './game-logic/GameRules.js';
import { Validator } from './game-logic/Validator.js';
import { CPUAI } from './CPUAI.js';
import { RankSystem } from './game-logic/RankSystem.js';

export class GameRoom {
  constructor(roomCode, hostId, options) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.options = { ...GameRules.getDefaultOptions(), ...options };
    this.players = [];
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
      swapsCompleted: {}
    };
  }

  log(msg) { console.log(`[GAMEROOM ${this.roomCode}] ${msg}`); }
  addPlayer(playerId, playerName, isCPU = false) {
    if (this.players.length >= this.options.num_players) return { success: false, error: 'Full' };
    this.players.push({ id: playerId, name: playerName, isCPU, hand: [], finished: false, finishPosition: null });
    return { success: true };
  }

  dealCards() {
    const deck = new Deck(this.options.num_decks);
    deck.shuffle();
    const hands = deck.deal(this.players.length);
    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.finished = false;
      p.finishPosition = null;
      p.hand = RankSystem.sortCards(p.hand, this.options);
    });
  }

  startGame() {
    if (this.players.length < 2) return { success: false, error: 'Need 2+ players' };
    this.dealCards();
    this.gameState.currentPlayerIndex = GameRules.getStartingPlayer(this.players, this.gameState.roles);
    this.gameState.phase = 'playing';
    this.gameState.round++;
    this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
    this.gameState.lastPlayerId = null;
    this.gameState.pile = [];
    this.gameState.passCount = 0;
    this.gameState.finishOrder = [];
    this.log(`ROUND ${this.gameState.round} START`);
    return { success: true };
  }

  playCards(playerId, cardIndices) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.gameState.phase !== 'playing' || player.finished) return { success: false, error: 'Invalid' };
    const current = this.players[this.gameState.currentPlayerIndex];
    if (current.id !== playerId) return { success: false, error: 'Not your turn' };
    const selected = cardIndices.map(i => player.hand[i]).filter(c => c);
    const playType = Validator.getPlayType(selected, this.options);
    if (playType.type === 'invalid') return { success: false, error: playType.error };
    const beatCheck = Validator.canBeatPlay(playType, this.gameState.lastPlay, this.options);
    if (!beatCheck.canBeat) return { success: false, error: 'Cards too low' };
    player.hand = player.hand.filter((c, i) => !cardIndices.includes(i));
    player.hand = RankSystem.sortCards(player.hand, this.options);
    this.gameState.lastPlayerId = playerId;
    this.gameState.lastPlay = playType;
    this.gameState.pile.push(...selected);
    this.gameState.passCount = 0;
    if (player.hand.length === 0) {
      player.finished = true;
      player.finishPosition = this.gameState.finishOrder.length + 1;
      this.gameState.finishOrder.push(playerId);
      if (this.checkRoundEnd()) {
        this.endRound();
        return { success: true, playType, roundEnded: true };
      }
    }
    this.advanceToNextPlayer();
    return { success: true, playType };
  }

  passTurn(playerId) {
    const current = this.players[this.gameState.currentPlayerIndex];
    if (current.id !== playerId || current.finished) return { success: false, error: 'Invalid' };
    if (this.gameState.lastPlay.type === 'none') return { success: false, error: 'Cannot pass when leading' };
    this.gameState.passCount++;
    const active = this.players.filter(p => !p.finished).length;
    if (this.gameState.passCount >= active - 1) {
      this.gameState.pile = [];
      this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
      this.gameState.passCount = 0;
      if (this.gameState.lastPlayerId) {
        const lastPlayer = this.players.find(p => p.id === this.gameState.lastPlayerId);
        if (lastPlayer && !lastPlayer.finished) {
          this.gameState.currentPlayerIndex = this.players.indexOf(lastPlayer);
          return { success: true };
        }
      }
      return { success: true };
    }
    this.advanceToNextPlayer();
    return { success: true };
  }

  advanceToNextPlayer() {
    let next = (this.gameState.currentPlayerIndex + 1) % this.players.length;
    let i = 0;
    while (this.players[next].finished && i < this.players.length) {
      next = (next + 1) % this.players.length;
      i++;
    }
    this.gameState.currentPlayerIndex = next;
  }

  checkRoundEnd() { return this.players.filter(p => !p.finished).length <= 1; }

  endRound() {
    this.log(`ROUND ${this.gameState.round} ENDED`);
    const lastPlayer = this.players.find(p => !p.finished);
    if (lastPlayer) {
      lastPlayer.finished = true;
      lastPlayer.finishPosition = this.gameState.finishOrder.length + 1;
      this.gameState.finishOrder.push(lastPlayer.id);
    }
    this.gameState.roles = GameRules.assignRoles(this.gameState.finishOrder, this.players.length);
    this.dealCards();
    this.gameState.phase = 'swapping';
    this.gameState.swapPending = {};
    this.gameState.swapsCompleted = {};
    this.initializeSwaps();
  }

  initializeSwaps() {
    const n = this.players.length;
    this.log(`Initializing swaps for ${n} players`);

    if (n === 2) {
      const p1 = this.gameState.finishOrder[0];
      const p2 = this.gameState.finishOrder[1];
      if (p1 && p2) {
        this.gameState.swapPending[p1] = { to: p2, count: 1, cards: [] };
        this.gameState.swapPending[p2] = { to: p1, count: 1, cards: [] };
      }
    } else if (n === 3) {
      const pid = this.gameState.finishOrder[0];
      const aid = this.gameState.finishOrder[2];
      if (pid && aid) {
        this.gameState.swapPending[aid] = { to: pid, count: 2, cards: [] };
        this.gameState.swapPending[pid] = { to: aid, count: 2, cards: [] };
      }
    } else {
      const pid = this.gameState.finishOrder[0];
      const vid = this.gameState.finishOrder[1];
      const vaid = this.gameState.finishOrder[n - 2];
      const aid = this.gameState.finishOrder[n - 1];

      if (aid && pid) {
        this.gameState.swapPending[aid] = { to: pid, count: 2, cards: [] };
        this.gameState.swapPending[pid] = { to: aid, count: 2, cards: [] };
      }
      if (vaid && vid) {
        this.gameState.swapPending[vaid] = { to: vid, count: 1, cards: [] };
        this.gameState.swapPending[vid] = { to: vaid, count: 1, cards: [] };
      }
    }

    this.log(`✅ Swap pending count: ${Object.keys(this.gameState.swapPending).length}`);
  }

  submitSwap(playerId, cardIndices) {
    if (this.gameState.phase !== 'swapping') return { success: false, error: 'Not swapping' };
    const swap = this.gameState.swapPending[playerId];
    if (!swap) return { success: false, error: 'No swap needed for your role' };
    if (cardIndices.length !== swap.count) return { success: false, error: 'Invalid swap count' };
    const player = this.players.find(p => p.id === playerId);
    const selected = cardIndices.map(i => player.hand[i]).filter(c => c);
    if (selected.length !== swap.count) return { success: false, error: 'Invalid cards' };
    swap.cards = selected;
    this.gameState.swapsCompleted[playerId] = true;
    return { success: true, allCompleted: this.checkAndProcessSwaps() };
  }

  checkAndProcessSwaps() {
    const pendingIds = Object.keys(this.gameState.swapPending);
    if (pendingIds.length === 0) {
      this.startGameAfterSwap();
      return true;
    }

    const allDone = pendingIds.every(id => this.gameState.swapsCompleted[id]);
    if (!allDone) {
      this.log(`Swaps: ${Object.keys(this.gameState.swapsCompleted).length}/${pendingIds.length}`);
      return false;
    }

    this.log(`🔄 ALL SWAPS COMPLETE - Processing...`);

    for (const fromId of pendingIds) {
      const swap = this.gameState.swapPending[fromId];
      const from = this.players.find(p => p.id === fromId);
      const to = this.players.find(p => p.id === swap.to);
      if (!from || !to) continue;
      for (const card of swap.cards) {
        const idx = from.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        if (idx !== -1) {
          from.hand.splice(idx, 1);
          to.hand.push(card);
        }
      }
    }

    this.players.forEach(p => { p.hand = RankSystem.sortCards(p.hand, this.options); });
    this.startGameAfterSwap();
    return true;
  }

  startGameAfterSwap() {
    let asshole = null;
    for (const p of this.players) {
      const role = this.gameState.roles[p.id];
      if (role === 'Asshole' || role === 'Vice Asshole') {
        asshole = p;
        break;
      }
    }
    this.gameState.currentPlayerIndex = asshole ? this.players.indexOf(asshole) : 0;
    this.gameState.phase = 'playing';
    this.gameState.round++;
    this.gameState.lastPlay = { type: 'none', cards: [], rank: 0, length: 0 };
    this.gameState.lastPlayerId = null;
    this.gameState.pile = [];
    this.gameState.passCount = 0;
    this.gameState.finishOrder = [];
    this.gameState.swapPending = {};
    this.gameState.swapsCompleted = {};
    this.log(`🎮 ROUND ${this.gameState.round} STARTED`);
  }

  autoSwapForCPU(playerId) {
    const swap = this.gameState.swapPending[playerId];
    if (!swap) return;
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.hand.length === 0) return;
    const role = this.gameState.roles[playerId];
    const sorted = RankSystem.sortCards(player.hand, this.options);
    let indices = [];
    if (role === 'Asshole' || role === 'Vice Asshole') {
      indices = sorted.slice(-swap.count).map(c => player.hand.findIndex(x => x.rank === c.rank && x.suit === c.suit));
    } else {
      indices = sorted.slice(0, swap.count).map(c => player.hand.findIndex(x => x.rank === c.rank && x.suit === c.suit));
    }
    this.submitSwap(playerId, indices);
  }

  isCurrentPlayerCPU() { return this.players[this.gameState.currentPlayerIndex]?.isCPU || false; }
  executeCPUTurn() {
    const current = this.players[this.gameState.currentPlayerIndex];
    if (!current?.isCPU || current.finished) return { success: false };
    const decision = CPUAI.decideTurn(current.hand, this.gameState.lastPlay, this.options);
    return decision.action === 'play' ? this.playCards(current.id, decision.cardIndices) : this.passTurn(current.id);
  }

  getPublicState(requestingPlayerId) {
    const current = this.players[this.gameState.currentPlayerIndex];
    return {
      roomCode: this.roomCode,
      phase: this.gameState.phase,
      round: this.gameState.round,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      currentPlayerId: current?.id,
      currentPlayerName: current?.name,
      isYourTurn: current?.id === requestingPlayerId,
      lastPlay: this.gameState.lastPlay,
      lastPlayerId: this.gameState.lastPlayerId,
      roles: this.gameState.roles,
      swapRequired: this.gameState.swapPending[requestingPlayerId] || null,
      swapsCompleted: this.gameState.swapsCompleted,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        handSize: p.hand.length,
        finished: p.finished,
        finishPosition: p.finishPosition,
        role: this.gameState.roles[p.id] || null,
        hand: p.id === requestingPlayerId ? p.hand.map(c => c.toJSON()) : null
      })),
      finishOrder: this.gameState.finishOrder,
      options: this.options
    };
  }
}
