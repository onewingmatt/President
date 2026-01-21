import { RankSystem } from './RankSystem.js';

export class Validator {
  static getPlayType(cards, options) {
    if (!cards || cards.length === 0) {
      return { type: 'invalid', error: 'No cards' };
    }
    const sorted = RankSystem.sortCards([...cards], options);
    if (cards.length === 1) {
      return {
        type: 'single',
        cards: sorted,
        rank: RankSystem.rankValue(sorted[0], options),
        length: 1,
        hasJD: RankSystem.isJackOfDiamonds(sorted[0]),
        hasTwo: RankSystem.isTwo(sorted[0]),
        hasBlack3: RankSystem.isBlack3(sorted[0])
      };
    }
    const ranks = [...new Set(cards.map(c => c.rank))];
    const jdCount = RankSystem.countJDs(cards);
    if (ranks.length === 1 || jdCount > 0) {
      const numTwos = RankSystem.countTwos(cards);
      const numBlack3s = RankSystem.countBlack3s(cards);
      return {
        type: 'set',
        cards: sorted,
        rank: RankSystem.rankValue(sorted[0], options),
        length: cards.length,
        hasJD: jdCount > 0,
        numTwos: numTwos,
        numBlack3s: numBlack3s
      };
    }
    return { type: 'invalid', error: 'Invalid play' };
  }

  static canBeatPlay(newPlay, lastPlay, options) {
    if (!lastPlay || lastPlay.type === 'none') {
      return { canBeat: true };
    }
    if (newPlay.type === 'invalid') {
      return { canBeat: false, error: newPlay.error };
    }

    // Jack of Diamonds always wins (if same length for sets)
    if (newPlay.hasJD && newPlay.type === 'single') {
      return { canBeat: true };
    }
    if (newPlay.hasJD && newPlay.type === 'set' && newPlay.length === lastPlay.length) {
      return { canBeat: true };
    }

    // Black 3 bombing logic
    if (newPlay.type === 'single' && newPlay.hasBlack3) {
      if (lastPlay.hasJD) {
        return { canBeat: false, error: 'Cannot beat Jack of Diamonds' };
      }
      if (lastPlay.type === 'single') {
        if (newPlay.rank <= lastPlay.rank) {
          return { canBeat: false, error: 'Must be higher rank' };
        }
        return { canBeat: true };
      }
      if (lastPlay.type === 'set' && lastPlay.length <= 4) {
        return { canBeat: true };
      }
      return { canBeat: false, error: 'Cannot beat that play' };
    }

    if (newPlay.type === 'set' && newPlay.numBlack3s > 0 && lastPlay.length <= 4) {
      return { canBeat: true };
    }

    // 2s BOMBING LOGIC - Check BEFORE other validations
    // Single 2 can only beat singles (not pairs/sets)
    if (newPlay.type === 'single' && newPlay.hasTwo) {
      if (lastPlay.hasTwo) {
        return { canBeat: false, error: '2 cannot beat another 2' };
      }
      if (lastPlay.hasJD) {
        return { canBeat: false, error: 'Cannot beat Jack of Diamonds' };
      }
      if (lastPlay.hasBlack3) {
        return { canBeat: false, error: 'Cannot beat Black 3' };
      }
      if (lastPlay.type !== 'single') {
        return { canBeat: false, error: 'Single 2 cannot beat pairs/sets' };
      }
      return { canBeat: true };
    }

    // PAIRS/SETS of 2s CAN bomb - this is the fix!
    // Pair of 2s beats singles and pairs
    // Triple of 2s beats singles, pairs, and triples
    // Quad of 2s beats singles, pairs, triples, and quads
    if (newPlay.type === 'set' && newPlay.numTwos > 0) {
      // Can't beat JD or Black 3s
      if (lastPlay.hasJD) {
        return { canBeat: false, error: 'Cannot beat Jack of Diamonds' };
      }
      if (lastPlay.numBlack3s > 0) {
        return { canBeat: false, error: 'Cannot beat Black 3s' };
      }
      // Can't beat other 2s of same or higher count
      if (lastPlay.numTwos >= newPlay.numTwos) {
        return { canBeat: false, error: '2s cannot beat equal or more 2s' };
      }

      // Bombing rule: N 2s can beat up to (N+1) cards
      // 1x2 in a set (mixed with other ranks) beats singles and pairs
      // 2x2s beat up to triples
      // 3x2s beat up to quads
      const maxBeatLength = newPlay.numTwos + 1;
      if (lastPlay.length <= maxBeatLength) {
        return { canBeat: true };
      }
      // If not bombing, must match length and beat rank
      if (newPlay.length === lastPlay.length && newPlay.rank > lastPlay.rank) {
        return { canBeat: true };
      }
      return { canBeat: false, error: 'Cannot beat that play' };
    }

    // Standard play - must match type and length
    if (newPlay.type !== lastPlay.type || newPlay.length !== lastPlay.length) {
      return { canBeat: false, error: 'Must match card count' };
    }

    // Must be higher rank
    if (newPlay.rank <= lastPlay.rank) {
      return { canBeat: false, error: 'Must be higher rank' };
    }

    return { canBeat: true };
  }
}
