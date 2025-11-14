const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export class RankSystem {
  static rankValue(card, options) {
    if (card.rank === '3' && (card.suit === 'H' || card.suit === 'D')) return -100;
    if (card.rank === 'J' && card.suit === 'D') return 300;
    if (card.rank === '3' && (card.suit === 'C' || card.suit === 'S')) return 200;
    if (card.rank === '2') return 150;
    return RANKS.indexOf(card.rank);
  }
  static compareCards(a, b, options) {
    return this.rankValue(a, options) - this.rankValue(b, options);
  }
  static sortCards(cards, options) {
    return [...cards].sort((a, b) => this.compareCards(a, b, options));
  }
}
