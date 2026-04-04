export class RankSystem {
  static baseRankOrder = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  static isJackOfDiamonds(card) { return card.rank === 'J' && card.suit === 'D'; }
  static isBlack3(card) { return card.rank === '3' && (card.suit === 'C' || card.suit === 'S'); }
  static isRed3(card) { return card.rank === '3' && (card.suit === 'H' || card.suit === 'D'); }
  static isTwo(card) { return card.rank === '2'; }
  static countJDs(cards) { return cards.filter(c => this.isJackOfDiamonds(c)).length; }
  static countBlack3s(cards) { return cards.filter(c => this.isBlack3(c)).length; }
  static countRed3s(cards) { return cards.filter(c => this.isRed3(c)).length; }
  static countTwos(cards) { return cards.filter(c => this.isTwo(c)).length; }
  static rankValue(card, options) { if (this.isJackOfDiamonds(card)) return options && options.jackOfDiamondsBomb === false ? this.baseRankOrder.indexOf('J') : 15; if (this.isBlack3(card)) return 14; if (this.isTwo(card)) return 13; if (card.rank === '3') return 0; const idx = this.baseRankOrder.indexOf(card.rank); return idx >= 0 ? idx : 0; }
  static sortCards(cards, options) { return cards.sort((a, b) => { const valA = this.rankValue(a, options); const valB = this.rankValue(b, options); if (valA !== valB) return valA - valB; const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 }; return (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0); }); }
}