import { RankSystem } from './RankSystem.js';
export class Validator {
  static getPlayType(cards, options) {
    if (!cards || cards.length === 0) return { type: 'invalid', error: 'No cards' };
    const sorted = RankSystem.sortCards(cards, options);
    if (cards.length === 1) return { type: 'single', cards: sorted, rank: RankSystem.rankValue(sorted[0], options), length: 1 };
    const ranks = [...new Set(cards.map(c => c.rank))];
    if (ranks.length === 1) return { type: 'set', cards: sorted, rank: RankSystem.rankValue(sorted[0], options), length: cards.length };
    return { type: 'invalid', error: 'Invalid play' };
  }
  static canBeatPlay(newPlay, lastPlay, options) {
    if (!lastPlay || lastPlay.type === 'none') return { canBeat: true };
    if (newPlay.type !== lastPlay.type || newPlay.length !== lastPlay.length) return { canBeat: false };
    return newPlay.rank > lastPlay.rank ? { canBeat: true } : { canBeat: false };
  }
}
