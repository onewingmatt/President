export class GameRules {
  static getDefaultOptions() {
    return { num_players: 4, num_decks: 1, runs_enabled: false, bombs_enabled: true };
  }
  static getStartingPlayer(players, roles) {
    for (let i = 0; i < players.length; i++) {
      if (players[i].hand.some(c => c.rank === '3' && c.suit === 'H')) return i;
    }
    for (let i = 0; i < players.length; i++) {
      if (roles[players[i].id] === 'Asshole') return i;
    }
    return 0;
  }
  static assignRoles(finishOrder, totalPlayers) {
    const roles = {};
    if (finishOrder.length === 0) return roles;
    if (totalPlayers === 3) {
      roles[finishOrder[0]] = 'President';
      if (finishOrder.length >= 2) roles[finishOrder[1]] = 'Neutral';
      if (finishOrder.length >= 3) roles[finishOrder[2]] = 'Asshole';
    } else {
      roles[finishOrder[0]] = 'President';
      if (finishOrder.length >= 2) roles[finishOrder[1]] = 'Vice President';
      if (finishOrder.length >= 3) roles[finishOrder[finishOrder.length - 1]] = 'Asshole';
      if (finishOrder.length >= 4) roles[finishOrder[finishOrder.length - 2]] = 'Vice Asshole';
      for (let i = 2; i < finishOrder.length - 2; i++) roles[finishOrder[i]] = 'Neutral';
    }
    return roles;
  }
}
