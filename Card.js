let cardIdCounter = 0;

export class Card {
  constructor(rank, suit) {
    this.id = cardIdCounter++;
    this.rank = rank;
    this.suit = suit.toUpperCase();
  }

  toJSON() {
    return {
      id: this.id,
      rank: this.rank,
      suit: this.suit
    };
  }

  toString() {
    const suitSymbols = {
      'H': '♥',
      'D': '♦',
      'C': '♣',
      'S': '♠'
    };
    return this.rank + (suitSymbols[this.suit] || this.suit);
  }
}