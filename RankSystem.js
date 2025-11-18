export class RankSystem {
  static assignRoles(finishOrder, numPlayers) {
    const roles = {};
    if (numPlayers <= 3) {
      if (finishOrder.length > 0) roles[finishOrder[0]] = 'President';
      if (finishOrder.length > 1) roles[finishOrder[finishOrder.length - 1]] = 'Asshole';
    } else {
      if (finishOrder.length > 0) roles[finishOrder[0]] = 'President';
      if (finishOrder.length > 1) roles[finishOrder[1]] = 'Vice President';
      if (finishOrder.length > 2) roles[finishOrder[finishOrder.length - 2]] = 'Vice Asshole';
      if (finishOrder.length > 0) roles[finishOrder[finishOrder.length - 1]] = 'Asshole';
    }
    return roles;
  }

  static determineExchanges(roles) {
    const exchanges = {};
    if (roles['Asshole']) {
      exchanges['Asshole'] = { to: 'President', count: 2 };
      exchanges['President'] = { to: 'Asshole', count: 2 };
    }
    if (roles['Vice Asshole'] && roles['Vice President']) {
      exchanges['Vice Asshole'] = { to: 'Vice President', count: 1 };
      exchanges['Vice President'] = { to: 'Vice Asshole', count: 1 };
    }
    return exchanges;
  }
}
