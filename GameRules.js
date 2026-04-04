export class GameRules {
  static runRanks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  static getDefaultOptions() {
    return {
      num_players: 4,
      num_decks: 1,
      cpuOnly: false,
      cpuSpeedMultiplier: 1,
      jackOfDiamondsBomb: true,
      tripleSixesBeatJd: false,
      runsAllowed: false,
      minRunLength: 3,
      maxRunLength: 5
    };
  }

  static clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  static clampInteger(value, min, max, fallback) {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
  }

  static toBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  static normalizeOptions(options) {
    const defaults = this.getDefaultOptions();
    const merged = Object.assign({}, defaults, options || {});
    const hasBombOption = Object.prototype.hasOwnProperty.call(options || {}, 'jackOfDiamondsBomb');
    const hasLegacyWildOption = Object.prototype.hasOwnProperty.call(options || {}, 'jackOfDiamondsWild');

    merged.num_players = this.clampInteger(merged.num_players, 2, 8, defaults.num_players);
    merged.num_decks = this.clampInteger(merged.num_decks, 1, 4, defaults.num_decks);
    merged.cpuOnly = this.toBoolean(merged.cpuOnly);
    merged.cpuSpeedMultiplier = this.clampNumber(merged.cpuSpeedMultiplier, 0.3, 2, defaults.cpuSpeedMultiplier);
    merged.jackOfDiamondsBomb = this.toBoolean(
      hasBombOption ? options.jackOfDiamondsBomb : (hasLegacyWildOption ? options.jackOfDiamondsWild : defaults.jackOfDiamondsBomb)
    );
    merged.tripleSixesBeatJd = this.toBoolean(merged.tripleSixesBeatJd);
    merged.runsAllowed = this.toBoolean(merged.runsAllowed);
    merged.minRunLength = this.clampInteger(merged.minRunLength, 3, this.runRanks.length, defaults.minRunLength);
    merged.maxRunLength = this.clampInteger(merged.maxRunLength, merged.minRunLength, this.runRanks.length, defaults.maxRunLength);

    if (merged.maxRunLength < merged.minRunLength) {
      merged.maxRunLength = merged.minRunLength;
    }

    return merged;
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