import { Card } from './Card.js';
const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export class Deck {
  constructor(numDecks = 1) {
    this.cards = [];
    for (let d = 0; d < numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push(new Card(rank, suit));
        }
      }
    }
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal(numPlayers) {
    const hands = Array(numPlayers).fill(0).map(() => []);
    this.cards.forEach((card, idx) => hands[idx % numPlayers].push(card));
    return hands;
  }
}
