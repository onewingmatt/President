import { RankSystem } from './game-logic/RankSystem.js';

export class CPUAI {
  static decideTurn(hand, lastPlay, options) {
    const sorted = RankSystem.sortCards(hand, options);

    if (!lastPlay || lastPlay.type === 'none') {
      return { action: 'play', cardIndices: [0] };
    }

    if (lastPlay.type === 'single') {
      return this.tryBeatSingle(sorted, lastPlay.rank, options);
    }

    if (lastPlay.type === 'set') {
      return this.tryBeatSet(sorted, lastPlay.length, lastPlay.rank, options);
    }

    return { action: 'pass', cardIndices: [] };
  }

  static tryBeatSingle(sorted, targetRank, options) {
    for (let i = 0; i < sorted.length; i++) {
      if (RankSystem.rankValue(sorted[i], options) > targetRank) {
        return { action: 'play', cardIndices: [i] };
      }
    }
    return { action: 'pass', cardIndices: [] };
  }

  static tryBeatSet(sorted, setLength, targetRank, options) {
    const rankGroups = {};
    sorted.forEach((card, idx) => {
      if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
      rankGroups[card.rank].push(idx);
    });

    for (const rank in rankGroups) {
      const indices = rankGroups[rank];
      if (indices.length >= setLength && RankSystem.rankValue(sorted[indices[0]], options) > targetRank) {
        return { action: 'play', cardIndices: indices.slice(0, setLength) };
      }
    }
    return { action: 'pass', cardIndices: [] };
  }
}
