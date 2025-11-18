import { Deck } from './Deck.js';
import { Validator } from './Validator.js';
import { RankSystem } from './RankSystem.js';
import { CPUAI } from './CPUAI.js';

export class GameRoom {
  constructor(roomCode, hostId, options = {}) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.players = [];
    this.options = {
      num_players: options.num_players || 4,
      num_decks: options.num_decks || 1,
    };
    this.gameState = {
      phase: 'waiting',
      currentPlayerIndex: 0,
      lastPlay: null,
      consecutivePasses: 0,
      finishOrder: [],
      roles: {},
    };
    this.deck = null;
  }

  addPlayer(playerId, playerName, isCPU = false) {
    if (this.players.length >= this.options.num_players) {
      return { success: false, reason: 'Room is full' };
    }
    this.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      finished: false,
      isCPU,
    });
    return { success: true };
  }

  startGame() {
    if (this.players.length < 2) {
      return { success: false, reason: 'Need at least 2 players' };
    }
    this.deck = new Deck(this.options.num_decks);
    this.deck.shuffle();
    this.dealCards();
    this.findStartingPlayer();
    this.gameState.phase = 'playing';
    return { success: true };
  }

  dealCards() {
    const cardsPerPlayer = Math.floor(this.deck.cards.length / this.players.length);
    this.players.forEach(player => {
      player.hand = [];
      for (let i = 0; i < cardsPerPlayer; i++) {
        const card = this.deck.draw();
        if (card) player.hand.push(card);
      }
      player.hand.sort((a, b) => {
        if (a.value !== b.value) return a.value - b.value;
        const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 };
        return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
      });
    });
  }

  findStartingPlayer() {
    for (let i = 0; i < this.players.length; i++) {
      const has3C = this.players[i].hand.some(c => {
        return c && c.rank === '3' && c.suit === 'C';
      });
      if (has3C) {
        this.gameState.currentPlayerIndex = i;
        console.log(`✓ Player ${i} (${this.players[i].name}) has 3♣`);
        return;
      }
    }
    console.log('⚠ No 3♣ found, defaulting to player 0');
    this.gameState.currentPlayerIndex = 0;
  }

  playCards(playerId, cardIndices) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.finished) {
      return { success: false, reason: 'Invalid player' };
    }
    if (this.players[this.gameState.currentPlayerIndex].id !== playerId) {
      return { success: false, reason: 'Not your turn' };
    }

    const cards = cardIndices.map(i => player.hand[i]).filter(c => c && c.rank && c.suit);
    if (cards.length === 0) {
      return { success: false, reason: 'No cards selected' };
    }

    const validation = Validator.validatePlay(cards, this.gameState.lastPlay);
    if (!validation.isValid) {
      return { success: false, reason: validation.reason };
    }

    cardIndices.sort((a, b) => b - a).forEach(i => {
      if (i >= 0 && i < player.hand.length) {
        player.hand.splice(i, 1);
      }
    });

    this.gameState.lastPlay = { cards, playerId };
    this.gameState.consecutivePasses = 0;

    if (player.hand.length === 0) {
      player.finished = true;
      this.gameState.finishOrder.push(playerId);
    }

    this.advanceTurn();
    const roundEnded = this.checkRoundEnd();
    return { success: true, roundEnded };
  }

  passTurn(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.finished) {
      return { success: false, reason: 'Invalid player' };
    }
    if (this.players[this.gameState.currentPlayerIndex].id !== playerId) {
      return { success: false, reason: 'Not your turn' };
    }

    this.gameState.consecutivePasses++;
    const activePlayers = this.players.filter(p => !p.finished).length;

    if (this.gameState.consecutivePasses >= activePlayers - 1) {
      this.gameState.lastPlay = null;
      this.gameState.consecutivePasses = 0;
    }

    this.advanceTurn();
    const roundEnded = this.checkRoundEnd();
    return { success: true, roundEnded };
  }

  advanceTurn() {
    do {
      this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.gameState.currentPlayerIndex].finished);
  }

  checkRoundEnd() {
    const activePlayers = this.players.filter(p => !p.finished).length;
    if (activePlayers <= 1) {
      const lastPlayer = this.players.find(p => !p.finished);
      if (lastPlayer) {
        lastPlayer.finished = true;
        this.gameState.finishOrder.push(lastPlayer.id);
      }
      this.assignRoles();
      this.gameState.phase = 'card_exchange';
      return true;
    }
    return false;
  }

  assignRoles() {
    this.gameState.roles = RankSystem.assignRoles(this.gameState.finishOrder, this.players.length);
  }

  exchangeCards(cardIndices) {
    const exchanges = RankSystem.determineExchanges(this.gameState.roles);
    const cardsToExchange = {};

    Object.keys(exchanges).forEach(fromRole => {
      const fromPlayer = this.players.find(p => this.gameState.roles[p.id] === fromRole);
      if (!fromPlayer) return;

      const toRole = exchanges[fromRole].to;
      const toPlayer = this.players.find(p => this.gameState.roles[p.id] === toRole);
      if (!toPlayer) return;

      const count = exchanges[fromRole].count;
      const indices = cardIndices[fromPlayer.id] || [];
      const cards = indices.slice(0, count).map(i => fromPlayer.hand[i]).filter(c => c && c.rank && c.suit);

      if (cards.length > 0) {
        cardsToExchange[fromPlayer.id] = { cards, toPlayerId: toPlayer.id };
      }
    });

    Object.keys(cardsToExchange).forEach(fromId => {
      const fromPlayer = this.players.find(p => p.id === fromId);
      const { cards, toPlayerId } = cardsToExchange[fromId];
      const toPlayer = this.players.find(p => p.id === toPlayerId);

      cards.forEach(card => {
        const idx = fromPlayer.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        if (idx !== -1) {
          fromPlayer.hand.splice(idx, 1);
          toPlayer.hand.push(card);
        }
      });
    });

    this.players.forEach(p => {
      p.hand.sort((a, b) => {
        if (a.value !== b.value) return a.value - b.value;
        const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 };
        return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
      });
      p.finished = false;
    });

    this.gameState.finishOrder = [];
    this.gameState.lastPlay = null;
    this.gameState.consecutivePasses = 0;
    this.findStartingPlayer();
    this.gameState.phase = 'playing';
  }

  executeCPUTurn() {
    const currentPlayer = this.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isCPU || currentPlayer.finished) {
      return { success: false };
    }

    const decision = CPUAI.makeDecision(currentPlayer.hand, this.gameState.lastPlay);

    if (decision.action === 'play') {
      const cardsToPlay = decision.cardIndices.map(i => currentPlayer.hand[i]).filter(c => c);
      const result = this.playCards(currentPlayer.id, decision.cardIndices);
      return { ...result, cpuPlayedCards: cardsToPlay };
    } else {
      const result = this.passTurn(currentPlayer.id);
      return { ...result, cpuPassed: true };
    }
  }

  isCurrentPlayerCPU() {
    const current = this.players[this.gameState.currentPlayerIndex];
    return current && current.isCPU && !current.finished;
  }

  getPublicState(playerId) {
    return {
      phase: this.gameState.phase,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      currentPlayerId: this.players[this.gameState.currentPlayerIndex]?.id,
      currentPlayerName: this.players[this.gameState.currentPlayerIndex]?.name,
      lastPlay: this.gameState.lastPlay,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        handSize: p.hand.length,
        finished: p.finished,
        hand: p.id === playerId ? p.hand : [],
        role: this.gameState.roles[p.id] || 'None',
      })),
    };
  }
}
