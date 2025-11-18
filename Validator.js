export class Validator {
  static validatePlay(cards, lastPlay) {
    if (!cards || cards.length === 0) {
      return { isValid: false, reason: 'No cards selected' };
    }

    if (!cards.every(c => c && c.rank && c.suit)) {
      return { isValid: false, reason: 'Invalid card data' };
    }

    const allSameRank = cards.every(c => c.rank === cards[0].rank);
    if (!allSameRank) {
      return { isValid: false, reason: 'All cards must be the same rank' };
    }

    if (!lastPlay) {
      return { isValid: true };
    }

    if (cards.length !== lastPlay.cards.length) {
      return { isValid: false, reason: 'Must play same number of cards' };
    }

    if (cards[0].value <= lastPlay.cards[0].value) {
      return { isValid: false, reason: 'Cards must be higher rank' };
    }

    return { isValid: true };
  }
}
