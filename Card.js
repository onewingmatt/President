export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.value = this.getValue();
  }

  getValue() {
    const values = {
      '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
    };
    return values[this.rank] || 0;
  }

  toJSON() {
    return {
      rank: this.rank,
      suit: this.suit,
      value: this.value
    };
  }

  toString() {
    const suitSymbols = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
    return this.rank + (suitSymbols[this.suit] || this.suit);
  }
}
