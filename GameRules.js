export class GameRules {
  static RANK_ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

  static isValidPlay(cards, lastPlay) {
    if (!cards || cards.length === 0) return false;
    const allSameRank = cards.every(c => c.rank === cards[0].rank);
    if (!allSameRank) return false;
    if (!lastPlay) return true;
    if (cards.length !== lastPlay.cards.length) return false;
    return cards[0].value > lastPlay.cards[0].value;
  }
}
