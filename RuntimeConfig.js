export const RuntimeConfig = {
  defaultPort: 8080,
  maxRooms: 200,
  roomTtlMs: 1000 * 60 * 60,
  botTakeoverDelayMs: 1000 * 60,
  rateLimit: 10,
  rateWindowMs: 5000,
  maxQueue: 20,
  cpuTurnDelayMs: 800,
  invalidAssetMarkers: [
    '<!-- ...existing code from index.html... -->',
    '// ...existing code from game.js...'
  ],
  requiredPublicAssets: {
    'index.html': [
      'id="optionsBtn"',
      'id="players"',
      'id="table"',
      'id="cards-wrapper"',
      '<script src="game.js"></script>'
    ],
    'game.js': [
      'const socket = io();',
      'function createGame()',
      'function renderHand()',
      "socket.on('game-state-update'"
    ]
  }
};