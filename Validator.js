import { RankSystem } from './RankSystem.js';
import { GameRules } from './GameRules.js';

export class Validator {
  static getPlayType(cards, options) {
    options = options || {};
    if (!cards || cards.length === 0) {
      return { type: 'invalid', error: 'No cards' };
    }
    // Defensive: all elements must be objects with rank/suit
    if (!cards.every(c => c && typeof c.rank === 'string' && typeof c.suit === 'string')) {
      return { type: 'invalid', error: 'Malformed card(s)' };
    }
    const sorted = RankSystem.sortCards([...cards], options);
    const jdCount = RankSystem.countJDs(cards);
    const jackBombEnabled = options.jackOfDiamondsBomb !== false;

    if (jackBombEnabled && cards.length > 1 && jdCount > 0) {
      return { type: 'invalid', error: 'Jack of Diamonds is a bomb and must be played alone' };
    }

    const runPlay = this.getRunPlay(cards, options, jdCount, jackBombEnabled);
    if (runPlay) {
      return runPlay;
    }

    if (cards.length === 1) {
      return {
        type: 'single',
        cards: sorted,
        rank: RankSystem.rankValue(sorted[0], options),
        length: 1,
        hasJD: RankSystem.isJackOfDiamonds(sorted[0]),
        isJackBomb: jackBombEnabled && RankSystem.isJackOfDiamonds(sorted[0]),
        hasTwo: RankSystem.isTwo(sorted[0]),
        hasBlack3: RankSystem.isBlack3(sorted[0])
      };
    }
    const ranks = [...new Set(cards.map(card => card.rank))];
    if (ranks.length === 1) {
      const numTwos = RankSystem.countTwos(cards);
      const numBlack3s = RankSystem.countBlack3s(cards);
      return {
        type: 'set',
        cards: sorted,
        rank: RankSystem.rankValue(sorted[0], options),
        length: cards.length,
        hasJD: jdCount > 0,
        numTwos: numTwos,
        numBlack3s: numBlack3s,
        isTripleSix: options.tripleSixesBeatJd === true && cards.length === 3 && jdCount === 0 && ranks[0] === '6'
      };
    }
    return { type: 'invalid', error: 'Invalid play' };
  }

  static getRunPlay(cards, options, jdCount, jackBombEnabled) {
    if (!options || options.runsAllowed !== true) {
      return null;
    }

    if (jackBombEnabled && jdCount > 0) {
      return null;
    }

    const minRunLength = Number.isFinite(Number(options.minRunLength)) ? Math.round(Number(options.minRunLength)) : GameRules.getDefaultOptions().minRunLength;
    const maxRunLength = Number.isFinite(Number(options.maxRunLength)) ? Math.round(Number(options.maxRunLength)) : GameRules.getDefaultOptions().maxRunLength;

    if (cards.length < minRunLength || cards.length > maxRunLength) {
      return null;
    }

    if (jdCount > 1) {
      return null;
    }

    const runRanks = GameRules.runRanks;
    const runCards = cards;

    if (runCards.length === 0) {
      return null;
    }

    const suit = runCards[0].suit;
    if (!runCards.every(card => card.suit === suit)) {
      return null;
    }

    if (!runCards.every(card => runRanks.includes(card.rank))) {
      return null;
    }

    const cardsByRank = new Map();
    runCards.forEach(card => {
      cardsByRank.set(card.rank, card);
    });

    if (new Set(runCards.map(card => card.rank)).size !== runCards.length) {
      return null;
    }

    for (let startIndex = runRanks.length - cards.length; startIndex >= 0; startIndex--) {
      const endIndex = startIndex + cards.length - 1;
      const orderedCards = [];
      let valid = true;

      for (let index = startIndex; index <= endIndex; index++) {
        const rank = runRanks[index];
        const match = cardsByRank.get(rank);
        if (match) {
          orderedCards.push(match);
          continue;
        }

        valid = false;
        break;
      }

      if (!valid || orderedCards.length !== cards.length) {
        continue;
      }

      const numTwos = RankSystem.countTwos(cards);
      const numBlack3s = RankSystem.countBlack3s(cards);

      return {
        type: 'run',
        cards: orderedCards,
        rank: endIndex,
        length: cards.length,
        hasJD: jdCount > 0,
        isJackBomb: false,
        hasTwo: numTwos > 0,
        hasBlack3: numBlack3s > 0,
        numTwos: numTwos,
        numBlack3s: numBlack3s,
        isTripleSix: false
      };
    }

    return null;
  }

  static canBeatPlay(newPlay, lastPlay, options) {
    options = options || {};
    const jackBombEnabled = options.jackOfDiamondsBomb !== false;
    // Defensive: check for valid play objects
    if (!lastPlay || lastPlay.type === 'none') {
      return { canBeat: true };
    }
    if (newPlay.type === 'invalid') {
      return { canBeat: false, error: newPlay.error };
    }

    if (lastPlay.isTripleSix && !newPlay.isTripleSix) {
      return { canBeat: false, error: 'Cannot beat Perfect 666' };
    }

    if (newPlay.isTripleSix) {
      return { canBeat: true };
    }

    if (jackBombEnabled && lastPlay.isJackBomb && !newPlay.isTripleSix) {
      return { canBeat: false, error: 'Cannot beat Jack of Diamonds' };
    }

    if (jackBombEnabled && newPlay.isJackBomb) {
      return { canBeat: true };
    }

    // Black 3 bombing logic
    if (newPlay.type === 'single' && newPlay.hasBlack3) {
      if (lastPlay.isJackBomb) {
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
    if (newPlay.type === 'single' && newPlay.hasTwo) {
      if (lastPlay.hasTwo) {
        return { canBeat: false, error: '2 cannot beat another 2' };
      }
      if (lastPlay.isJackBomb) {
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

    if (newPlay.type === 'set' && newPlay.numTwos > 0) {
      if (lastPlay.isJackBomb) {
        return { canBeat: false, error: 'Cannot beat Jack of Diamonds' };
      }
      if (lastPlay.numBlack3s > 0) {
        return { canBeat: false, error: 'Cannot beat Black 3s' };
      }
      if (lastPlay.numTwos >= newPlay.numTwos) {
        return { canBeat: false, error: '2s cannot beat equal or more 2s' };
      }
      const maxBeatLength = newPlay.numTwos + 1;
      if (lastPlay.length <= maxBeatLength) {
        return { canBeat: true };
      }
      if (newPlay.length === lastPlay.length && newPlay.rank > lastPlay.rank) {
        return { canBeat: true };
      }
      return { canBeat: false, error: 'Cannot beat that play' };
    }

    if (newPlay.type === 'run') {
      if (lastPlay.type !== 'run' || newPlay.length !== lastPlay.length) {
        return { canBeat: false, error: 'Must match card count' };
      }

      if (newPlay.rank <= lastPlay.rank) {
        return { canBeat: false, error: 'Must be higher rank' };
      }

      return { canBeat: true };
    }

    // Standard play - must match type and length
    if (newPlay.type !== lastPlay.type || newPlay.length !== lastPlay.length) {
      return { canBeat: false, error: 'Must match card count' };
    }
    if (newPlay.rank <= lastPlay.rank) {
      return { canBeat: false, error: 'Must be higher rank' };
    }
    return { canBeat: true };
  }
}
