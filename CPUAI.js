import { Validator } from './Validator.js';
import { RankSystem } from './RankSystem.js';
import { GameRules } from './GameRules.js';

export class CPUAI {

  static decideTurn(hand, lastPlay, options) {
    if (!Array.isArray(hand) || hand.length === 0) {
      return { action: 'pass' };
    }
    // Always sort hand for safety
    const sortedHand = RankSystem.sortCards([...hand], options);
    if (!lastPlay || lastPlay.type === 'none') {
      return this.makeFirstPlay(sortedHand, options);
    }
    return this.tryToBeat(sortedHand, lastPlay, options);
  }

  static makeFirstPlay(hand, options) {
    if (!Array.isArray(hand) || hand.length === 0) {
      return { action: 'pass' };
    }
    const lowest = hand[0];
    const lowestRank = lowest.rank;
    const matching = hand.filter(c => c.rank === lowestRank);
    if (lowestRank === '3') {
      const hasBlack3 = matching.some(c => RankSystem.isBlack3(c));
      const hasRed3 = matching.some(c => RankSystem.isRed3(c));
      if (hasBlack3 && hasRed3) {
        const red3s = matching.filter(c => RankSystem.isRed3(c));
        return {
          action: 'play',
          cardIndices: red3s.map(c => hand.indexOf(c))
        };
      }
    }
    return {
      action: 'play',
      cardIndices: matching.map(c => hand.indexOf(c))
    };
  }

  static tryToBeat(hand, lastPlay, options) {
    if (!Array.isArray(hand) || hand.length === 0) {
      return { action: 'pass' };
    }
    const requiredLength = lastPlay.length;
    const jdIndex = hand.findIndex(c => RankSystem.isJackOfDiamonds(c));
    const jackBombEnabled = options && options.jackOfDiamondsBomb !== false;
    if (jackBombEnabled && jdIndex !== -1 && !lastPlay.isTripleSix) {
      return { action: 'play', cardIndices: [jdIndex] };
    }

    if (options && options.runsAllowed === true && lastPlay.type === 'run') {
      const runPlay = this.findRunToBeat(hand, lastPlay, options);
      if (runPlay) {
        return { action: 'play', cardIndices: runPlay };
      }
    }

    const rankGroups = {};
    hand.forEach((card, idx) => {
      if (jackBombEnabled && RankSystem.isJackOfDiamonds(card)) return;
      if (!rankGroups[card.rank]) {
        rankGroups[card.rank] = [];
      }
      rankGroups[card.rank].push(idx);
    });
    for (const rank in rankGroups) {
      const group = rankGroups[rank];
      if (group.length >= requiredLength) {
        if (rank === '3') {
          const groupCards = group.map(i => hand[i]);
          const hasBlack3 = groupCards.some(c => RankSystem.isBlack3(c));
          const hasRed3 = groupCards.some(c => RankSystem.isRed3(c));
          if (hasBlack3 && hasRed3) {
            const black3Indices = group.filter(i => RankSystem.isBlack3(hand[i]));
            if (black3Indices.length >= requiredLength) {
              const testCards = black3Indices.slice(0, requiredLength).map(i => hand[i]);
              const playType = Validator.getPlayType(testCards, options);
              const canBeat = Validator.canBeatPlay(playType, lastPlay, options);
              if (canBeat.canBeat) {
                return {
                  action: 'play',
                  cardIndices: black3Indices.slice(0, requiredLength)
                };
              }
            }
            const red3Indices = group.filter(i => RankSystem.isRed3(hand[i]));
            if (red3Indices.length >= requiredLength) {
              const testCards = red3Indices.slice(0, requiredLength).map(i => hand[i]);
              const playType = Validator.getPlayType(testCards, options);
              const canBeat = Validator.canBeatPlay(playType, lastPlay, options);
              if (canBeat.canBeat) {
                return {
                  action: 'play',
                  cardIndices: red3Indices.slice(0, requiredLength)
                };
              }
            }
            continue;
          }
        }
        const testCards = group.slice(0, requiredLength).map(i => hand[i]);
        const playType = Validator.getPlayType(testCards, options);
        const canBeat = Validator.canBeatPlay(playType, lastPlay, options);
        if (canBeat.canBeat) {
          return {
            action: 'play',
            cardIndices: group.slice(0, requiredLength)
          };
        }
      }
    }
    return { action: 'pass' };
  }

  static findRunToBeat(hand, lastPlay, options) {
    const runRanks = GameRules.runRanks;
    const requiredLength = lastPlay.length;
    const jackBombEnabled = options && options.jackOfDiamondsBomb !== false;
    const jdIndex = jackBombEnabled ? hand.findIndex(card => RankSystem.isJackOfDiamonds(card)) : -1;

    const suits = ['H', 'D', 'C', 'S'];
    for (const suit of suits) {
      const rankToIndices = new Map();
      hand.forEach((card, index) => {
        if (jackBombEnabled && RankSystem.isJackOfDiamonds(card)) {
          return;
        }

        if (card.suit !== suit || !runRanks.includes(card.rank)) {
          return;
        }

        if (!rankToIndices.has(card.rank)) {
          rankToIndices.set(card.rank, []);
        }

        rankToIndices.get(card.rank).push(index);
      });

      for (let start = 0; start + requiredLength <= runRanks.length; start++) {
        const end = start + requiredLength - 1;
        if (end <= lastPlay.rank) {
          continue;
        }

        const expectedRanks = runRanks.slice(start, end + 1);
        const chosenIndices = [];
        const usedIndices = new Set();
        let usedJd = false;
        let valid = true;

        for (const rank of expectedRanks) {
          const availableIndices = rankToIndices.get(rank) || [];
          const nextIndex = availableIndices.find(index => !usedIndices.has(index));

          if (nextIndex !== undefined) {
            chosenIndices.push(nextIndex);
            usedIndices.add(nextIndex);
            continue;
          }

          if (!usedJd && jdIndex !== -1 && !usedIndices.has(jdIndex)) {
            chosenIndices.push(jdIndex);
            usedIndices.add(jdIndex);
            usedJd = true;
            continue;
          }

          valid = false;
          break;
        }

        if (!valid || chosenIndices.length !== requiredLength) {
          continue;
        }

        const candidateCards = chosenIndices.map(index => hand[index]);
        const playType = Validator.getPlayType(candidateCards, options);
        const canBeat = Validator.canBeatPlay(playType, lastPlay, options);
        if (canBeat.canBeat) {
          return chosenIndices;
        }
      }
    }

    return null;
  }
}