export class CPUAI {
  static makeDecision(hand, lastPlay) {
    if (!lastPlay) {
      const lowestRank = hand[0].rank;
      const lowestCards = hand.filter(c => c.rank === lowestRank);
      return { action: 'play', cardIndices: lowestCards.map((_, i) => i) };
    }

    const requiredCount = lastPlay.cards.length;
    const requiredValue = lastPlay.cards[0].value;
    const rankGroups = {};

    hand.forEach((card, idx) => {
      if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
      rankGroups[card.rank].push({ card, idx });
    });

    for (const rank in rankGroups) {
      const group = rankGroups[rank];
      if (group.length >= requiredCount && group[0].card.value > requiredValue) {
        return { action: 'play', cardIndices: group.slice(0, requiredCount).map(g => g.idx) };
      }
    }

    return { action: 'pass' };
  }
}
