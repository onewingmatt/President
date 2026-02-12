export class GameRules {
  static getDefaultOptions() {
    return {
      num_players: 4,
      num_decks: 1
    };
  }

  static getStartingPlayer(players) {
    for (let i = 0; i < players.length; i++) {
      if (players[i].hand.some(c => c.rank === '3' && c.suit === 'C')) {
        return i;
      }
    }
    return 0;
  }

  static assignRoles(finishOrder, numPlayers) {
    const roles = {};
    
    if (numPlayers <= 3) {
      if (finishOrder[0]) roles[finishOrder[0]] = 'President';
      if (finishOrder[finishOrder.length - 1]) {
        roles[finishOrder[finishOrder.length - 1]] = 'Asshole';
      }
    } else {
      if (finishOrder[0]) roles[finishOrder[0]] = 'President';
      if (finishOrder[1]) roles[finishOrder[1]] = 'Vice President';
      if (finishOrder[finishOrder.length - 2]) {
        roles[finishOrder[finishOrder.length - 2]] = 'Vice Asshole';
      }
      if (finishOrder[finishOrder.length - 1]) {
        roles[finishOrder[finishOrder.length - 1]] = 'Asshole';
      }
    }
    
    return roles;
  }
}