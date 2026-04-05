import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RankSystem } from './RankSystem.js';
import { Validator } from './Validator.js';
import { Card } from './Card.js';
import { GameRoom } from './GameRoom.js';
import { GameRules } from './GameRules.js';
import { RuntimeConfig } from './RuntimeConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running comprehensive test suite...');
console.log('');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('PASS: ' + name);
    passed++;
  } catch (error) {
    console.log('FAIL: ' + name);
    console.log('  Error: ' + error.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('========================================');
console.log('STATIC ASSET SMOKE TESTS');
console.log('========================================');

test('Public index.html is a complete app shell', function() {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert(!indexHtml.includes('<!-- ...existing code from index.html... -->'));
  assert(!indexHtml.includes('omitted for brevity'));
  assert(!indexHtml.includes('style="'));
  assert(indexHtml.includes('id="optionsBtn"'));
  assert(indexHtml.includes('id="optionsModal"'));
  assert(indexHtml.includes('id="closeOptionsBtn"'));
  assert(indexHtml.includes('id="players"'));
  assert(indexHtml.includes('id="table"'));
  assert(indexHtml.includes('id="cards-wrapper"'));
  assert(indexHtml.includes('aria-live="polite"'));
  assert(indexHtml.includes('class="settings-actions"'));
  assert(indexHtml.includes('id="playBtn"'));
  assert(indexHtml.includes('id="clearBtn"'));
  assert(indexHtml.includes('id="passBtn"'));
  assert(indexHtml.includes('.player-badge--you'));
  assert(indexHtml.includes('.container.has-sticky-controls'));
  assert(indexHtml.includes('height: 100dvh;'));
  assert(indexHtml.includes('body[data-auto-scale="true"] .game-area'));
  assert(indexHtml.includes('body[data-auto-card-size="false"] .card-item'));
  assert(indexHtml.includes(':focus-visible'));
  assert(indexHtml.includes('@media (min-width: 640px)'));
  assert(indexHtml.includes('@media (min-width: 1024px)'));
});

test('Public game.js is a complete client file', function() {
  const gameJs = fs.readFileSync(path.join(__dirname, 'public', 'game.js'), 'utf8');
  assert(!gameJs.includes('// ...existing code from game.js...'));
  assert(!gameJs.includes('insertAdjacentHTML'));
  assert(!gameJs.includes('style="'));
  assert(gameJs.includes('const socket = io();'));
  assert(gameJs.includes("socket.on('game-state-update'"));
  assert(gameJs.includes('function renderHand()'));
  assert(gameJs.includes('function createGame()'));
  assert(gameJs.includes('function escapeHtml(value)'));
  assert(gameJs.includes('function setSetupVisibility(isVisible)'));
  assert(gameJs.includes('function openOptions()'));
  assert(gameJs.includes('function applyLayoutSettings()'));
  assert(gameJs.includes('function applyStickyControls()'));
  assert(gameJs.includes('function playUISound(kind)'));
  assert(gameJs.includes("setToggleState('autoScaleToggle', true"));
  assert(gameJs.includes("socket.emit('update-room-settings'"));
  assert(gameJs.includes('function renderTurnStatus(state)'));
  assert(gameJs.includes('function updateActionButtons()'));
  assert(gameJs.includes('function renderPlayerCard(player, currentId, showCards = false)'));
  assert(gameJs.includes('function cardAriaLabel(card)'));
  assert(gameJs.includes('reconnectToken'));
  assert(/class=\"card-item \$\{cardColorClass\(card\)\}\$\{selectedClass\}\"/.test(gameJs), 'Expected hand cards to render as button controls');
  assert(/class=\"swap-card \$\{cardColorClass\(card\)\}\$\{selectedClass\}\"/.test(gameJs), 'Expected swap cards to render as button controls');
  assert(/function toggleCard\(index\)[\s\S]*?updateActionButtons\(\);/.test(gameJs), 'Expected toggleCard to refresh action buttons');
  assert(/function toggleSwapCard\(index\)[\s\S]*?updateActionButtons\(\);/.test(gameJs), 'Expected toggleSwapCard to refresh action buttons');
});

test('Server.js includes host and reconnect guards', function() {
  const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverJs.includes('Only the host can start the game.'));
  assert(serverJs.includes('reconnectToken'));
  assert(serverJs.includes('disconnectSocket'));
  assert(serverJs.includes('RuntimeConfig.defaultPort'));
});

test('Runtime, docs, and deployment files agree on the default port', function() {
  const defaultPort = String(RuntimeConfig.defaultPort);
  const dockerfile = fs.readFileSync(path.join(__dirname, 'Dockerfile'), 'utf8');
  const flyToml = fs.readFileSync(path.join(__dirname, 'fly.toml'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');

  assert(dockerfile.includes('EXPOSE ' + defaultPort));
  assert(flyToml.includes('internal_port = ' + defaultPort));
  assert(readme.includes('http://localhost:' + defaultPort));
  assert(readme.includes('$env:PORT=' + defaultPort));
});

test('GameRules normalizes gameplay variant options', function() {
  const options = GameRules.normalizeOptions({
    jackOfDiamondsBomb: false,
    tripleSixesBeatJd: true,
    runsAllowed: true,
    minRunLength: 2,
    maxRunLength: 99
  });

  assert(options.jackOfDiamondsBomb === false, 'Expected J♦ bomb to remain disabled');
  assert(options.tripleSixesBeatJd === true, 'Expected perfect 666 to remain enabled');
  assert(options.runsAllowed === true, 'Expected runs to remain enabled');
  assert(options.minRunLength === 3, 'Expected minimum run length to clamp to the lower bound');
  assert(options.maxRunLength === GameRules.runRanks.length, 'Expected maximum run length to clamp to the upper bound');
});

console.log('');
console.log('========================================');
console.log('RANK SYSTEM TESTS');
console.log('========================================');

test('Red 3s have rank 0 (lowest)', function() {
  const red3h = new Card('3', 'H');
  assert(RankSystem.rankValue(red3h) === 0);
});

test('Black 3s have rank 14 (beat 2s)', function() {
  const black3c = new Card('3', 'C');
  assert(RankSystem.rankValue(black3c) === 14);
});

test('2s have rank 13', function() {
  const two = new Card('2', 'H');
  assert(RankSystem.rankValue(two) === 13);
});

test('J♦ has rank 15 (highest)', function() {
  const jd = new Card('J', 'D');
  assert(RankSystem.rankValue(jd) === 15);
});

console.log('');
console.log('========================================');
console.log('VALIDATOR TESTS');
console.log('========================================');

test('Single Black 3 can beat pair as bomb', function() {
  const pair = [new Card('4', 'H'), new Card('4', 'C')];
  const black3 = new Card('3', 'C');

  const lastPlay = Validator.getPlayType(pair, {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Single Black 3 should beat pair');
});

test('Single Black 3 cannot beat Jack of Diamonds', function() {
  const jd = new Card('J', 'D');
  const black3 = new Card('3', 'S');

  const lastPlay = Validator.getPlayType([jd], {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, 'Black 3 should not beat Jack of Diamonds');
  assert(result.error === 'Cannot beat Jack of Diamonds');
});

test('Jack of Diamonds bomb cannot be combined with other cards', function() {
  const jd = new Card('J', 'D');
  const four = new Card('4', 'H');

  const play = Validator.getPlayType([jd, four], { jackOfDiamondsBomb: true });

  assert(play.type === 'invalid', 'Jack of Diamonds bomb should be played alone');
});

test('Jack of Diamonds bomb beats ordinary plays', function() {
  const jd = new Card('J', 'D');
  const fourH = new Card('4', 'H');
  const fourC = new Card('4', 'C');

  const lastPlay = Validator.getPlayType([fourH, fourC], {});
  const newPlay = Validator.getPlayType([jd], { jackOfDiamondsBomb: true });
  const result = Validator.canBeatPlay(newPlay, lastPlay, { jackOfDiamondsBomb: true });

  assert(newPlay.isJackBomb, 'Expected single Jack of Diamonds to be flagged as a bomb');
  assert(result.canBeat, 'Jack of Diamonds bomb should beat a pair');
});

test('Perfect 666 beats Jack of Diamonds', function() {
  const jd = new Card('J', 'D');
  const sixH = new Card('6', 'H');
  const sixC = new Card('6', 'C');
  const sixS = new Card('6', 'S');

  const lastPlay = Validator.getPlayType([jd], {});
  const newPlay = Validator.getPlayType([sixH, sixC, sixS], { tripleSixesBeatJd: true });
  const result = Validator.canBeatPlay(newPlay, lastPlay, { tripleSixesBeatJd: true });

  assert(newPlay.isTripleSix, 'Expected three 6s to be flagged as the special bomb');
  assert(result.canBeat, 'Perfect 666 should beat Jack of Diamonds');
});

test('Runs are detected when enabled', function() {
  const fiveH = new Card('5', 'H');
  const sixH = new Card('6', 'H');
  const sevenH = new Card('7', 'H');

  const play = Validator.getPlayType([fiveH, sixH, sevenH], { runsAllowed: true, minRunLength: 3, maxRunLength: 5 });

  assert(play.type === 'run', 'Expected a valid run when runs are enabled');
  assert(play.length === 3, 'Expected run length to match the selected cards');
});

test('Jack of Diamonds bomb is not allowed inside runs', function() {
  const fiveH = new Card('5', 'H');
  const sixH = new Card('6', 'H');
  const jd = new Card('J', 'D');

  const play = Validator.getPlayType([fiveH, sixH, jd], {
    jackOfDiamondsBomb: true,
    runsAllowed: true,
    minRunLength: 3,
    maxRunLength: 5
  });

  assert(play.type === 'invalid', 'Jack of Diamonds bomb should not be allowed inside a run');
});

test('Jack of Diamonds can be disabled as a bomb', function() {
  const jd = new Card('J', 'D');

  assert(RankSystem.rankValue(jd, { jackOfDiamondsBomb: false }) === 8, 'Expected J♦ to fall back to a normal Jack when the bomb is off');
});

test('Runs obey the maximum run length', function() {
  const cards = [
    new Card('4', 'S'),
    new Card('5', 'S'),
    new Card('6', 'S'),
    new Card('7', 'S')
  ];

  const allowed = Validator.getPlayType(cards, { runsAllowed: true, minRunLength: 3, maxRunLength: 4 });
  const blocked = Validator.getPlayType([...cards, new Card('8', 'S')], { runsAllowed: true, minRunLength: 3, maxRunLength: 4 });

  assert(allowed.type === 'run', 'Expected a four-card run to be valid');
  assert(blocked.type === 'invalid', 'Expected a five-card run to fail the max-length rule');
});

test('Single 2 cannot beat pair', function() {
  const pair = [new Card('4', 'H'), new Card('4', 'C')];
  const two = new Card('2', 'D');

  const lastPlay = Validator.getPlayType(pair, {});
  const newPlay = Validator.getPlayType([two], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, 'Single 2 should not beat pair');
  assert(result.error === 'Single 2 cannot beat pairs/sets');
});

test('Pair beats lower pair', function() {
  const pair1 = [new Card('4', 'H'), new Card('4', 'C')];
  const pair2 = [new Card('5', 'D'), new Card('5', 'S')];

  const lastPlay = Validator.getPlayType(pair1, {});
  const newPlay = Validator.getPlayType(pair2, {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Pair of 5s should beat pair of 4s');
});

console.log('');
console.log('========================================');
console.log('GAME ROOM TESTS');
console.log('========================================');

test('GameRoom rejects duplicate card indices', function() {
  const room = new GameRoom('ROOM1', 'p1', { num_players: 2 });
  room.addPlayer('p1', 'Alice', false);
  room.addPlayer('p2', 'Bob', false);
  room.gameState.phase = 'playing';
  room.gameState.currentPlayerIndex = 0;
  room.players[0].hand = [new Card('4', 'H'), new Card('5', 'C')];
  room.players[1].hand = [new Card('6', 'D')];

  const result = room.playCards('p1', [0, 0]);

  assert(!result.success, 'Expected duplicate index selection to fail');
  assert(result.error === 'Invalid card selection');
});

test('GameRoom clears the pile after the last active opponent passes', function() {
  const room = new GameRoom('ROOM2', 'p1', { num_players: 3 });
  room.addPlayer('p1', 'Alice', false);
  room.addPlayer('p2', 'Bob', false);
  room.addPlayer('p3', 'Cara', false);
  room.gameState.phase = 'playing';
  room.gameState.currentPlayerIndex = 1;
  room.gameState.lastPlay = Validator.getPlayType([new Card('4', 'H')], {});
  room.gameState.pile = [new Card('4', 'H')];
  room.gameState.passCount = 1;

  const result = room.passTurn('p2');

  assert(result.success, 'Expected pass to succeed');
  assert(room.gameState.lastPlay.type === 'none', 'Expected pile to reset after last pass');
  assert(room.gameState.passCount === 0, 'Expected pass count to reset after pile clear');
});

test('GameRoom initializes role swaps for four players', function() {
  const room = new GameRoom('ROOM3', 'p1', { num_players: 4 });
  room.addPlayer('p1', 'Alice', false);
  room.addPlayer('p2', 'Bob', false);
  room.addPlayer('p3', 'Cara', false);
  room.addPlayer('p4', 'Dan', false);
  room.gameState.finishOrder = ['p1', 'p2', 'p3', 'p4'];

  room.initializeSwaps();

  assert(room.gameState.swapPending.p1.count === 2, 'President should give 2 cards');
  assert(room.gameState.swapPending.p4.count === 2, 'Asshole should give 2 cards');
  assert(room.gameState.swapPending.p2.count === 1, 'Vice President should give 1 card');
  assert(room.gameState.swapPending.p3.count === 1, 'Vice Asshole should give 1 card');
  assert(room.gameState.swapPending.p1.to === 'p4');
  assert(room.gameState.swapPending.p4.to === 'p1');
});

test('GameRoom rejects duplicate swap indices', function() {
  const room = new GameRoom('ROOM3B', 'p1', { num_players: 2 });
  room.addPlayer('p1', 'Alice', false);
  room.addPlayer('p2', 'Bob', false);
  room.gameState.phase = 'swapping';
  room.players[0].hand = [new Card('4', 'H'), new Card('5', 'C')];
  room.gameState.swapPending.p1 = { role: 'President', count: 2, cards: [], to: 'p2' };

  const result = room.submitSwap('p1', [0, 0]);

  assert(!result.success, 'Expected duplicate swap indices to fail');
});

test('GameRoom prevents starting the same game twice', function() {
  const room = new GameRoom('ROOM4', null, { num_players: 2 });
  room.addPlayer('p1', 'Alice', false);
  room.addPlayer('p2', 'Bob', false);

  const firstStart = room.startGame();
  const secondStart = room.startGame();

  assert(firstStart.success, 'Expected first start to succeed');
  assert(!secondStart.success, 'Expected second start to fail');
  assert(secondStart.error === 'Game already started');
});

test('GameRoom exposes canStart only when start is actually valid', function() {
  const room = new GameRoom('ROOM4B', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.hostId = 'player-a';

  const stateBefore = room.getPublicState('player-a');
  assert(stateBefore.canStart === false, 'Expected canStart to be false with only one player');

  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  const stateAfter = room.getPublicState('player-a');
  assert(stateAfter.canStart === true, 'Expected canStart to be true once two players are present');
});

test('GameRoom public state exposes room CPU speed settings', function() {
  const room = new GameRoom('ROOM4C', null, { num_players: 2, cpuSpeedMultiplier: 1.6 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.hostId = 'player-a';

  const state = room.getPublicState('player-a');
  assert(state.settings.cpuSpeedMultiplier === 1.6, 'Expected public state to include CPU speed multiplier');
});

test('GameRoom public state exposes gameplay rules', function() {
  const room = new GameRoom('ROOM4D', null, {
    num_players: 2,
    jackOfDiamondsBomb: true,
    tripleSixesBeatJd: true,
    runsAllowed: true,
    minRunLength: 4,
    maxRunLength: 6
  });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });

  const state = room.getPublicState('player-a');

  assert(state.settings.gameplayRules.jackOfDiamondsBomb === true, 'Expected J♦ bomb rule to be visible');
  assert(state.settings.gameplayRules.tripleSixesBeatJd === true, 'Expected perfect 666 rule to be visible');
  assert(state.settings.gameplayRules.runsAllowed === true, 'Expected run toggle to be visible');
  assert(state.settings.gameplayRules.minRunLength === 4, 'Expected minimum run length to be visible');
  assert(state.settings.gameplayRules.maxRunLength === 6, 'Expected maximum run length to be visible');
});

test('GameRoom removes a waiting player and reassigns host on disconnect', function() {
  const room = new GameRoom('ROOM5', null, { num_players: 3 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });

  const disconnectResult = room.disconnectSocket('socket-a');

  assert(disconnectResult.success, 'Expected waiting-room disconnect to succeed');
  assert(disconnectResult.type === 'player-removed');
  assert(room.players.length === 1, 'Expected the disconnected waiting player to be removed');
  assert(room.hostId === 'player-b', 'Expected host to transfer to the remaining player');
});

test('GameRoom reconnects a disconnected player by token without changing identity', function() {
  const room = new GameRoom('ROOM6', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  room.hostId = 'player-a';
  room.gameState.phase = 'playing';

  const disconnectResult = room.disconnectSocket('socket-a');
  const reconnectResult = room.reconnectPlayer('token-a', 'socket-a-2');

  assert(disconnectResult.success, 'Expected in-game disconnect to succeed');
  assert(disconnectResult.type === 'player-disconnected');
  assert(reconnectResult.success, 'Expected reconnect by token to succeed');
  assert(reconnectResult.player.id === 'player-a', 'Expected stable player id to be preserved');
  assert(room.getPlayerIdBySocketId('socket-a-2') === 'player-a', 'Expected new socket to map to the same player id');
  assert(room.isHostSocket('socket-a-2'), 'Expected host privileges to survive reconnect');
});

test('GameRoom promotes a disconnected player to bot control', function() {
  const room = new GameRoom('ROOM7', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  room.gameState.phase = 'playing';
  room.gameState.currentPlayerIndex = 0;

  room.disconnectSocket('socket-a');
  const takeoverResult = room.promoteDisconnectedPlayerToCPU('player-a');

  assert(takeoverResult.success, 'Expected bot takeover to succeed');
  assert(room.getPlayerById('player-a').isCPU === true, 'Expected the disconnected player to become CPU-controlled');
});

test('GameRoom reconnects a bot-taken-over player back to human control', function() {
  const room = new GameRoom('ROOM7B', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  room.gameState.phase = 'playing';

  room.disconnectSocket('socket-a');
  room.promoteDisconnectedPlayerToCPU('player-a');

  const reconnectResult = room.reconnectPlayer('token-a', 'socket-a-2');

  assert(reconnectResult.success, 'Expected reconnect to work after bot takeover');
  assert(room.getPlayerById('player-a').isCPU === false, 'Expected human control to be restored');
  assert(room.getPlayerBySocketId('socket-a-2').id === 'player-a', 'Expected new socket to map back to the human player');
});

test('GameRoom bot takeover can choose swap cards', function() {
  const room = new GameRoom('ROOM8', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  room.gameState.phase = 'swapping';
  room.players[0].hand = [new Card('3', 'C'), new Card('A', 'S'), new Card('5', 'D')];
  room.gameState.swapPending['player-a'] = { role: 'President', count: 2, cards: [], to: 'player-b' };

  const indices = room.getBotSwapIndices('player-a');

  assert(indices.length === 2, 'Expected bot swap helper to return the required number of cards');
  assert(indices.includes(0), 'Expected the bot to prefer the black 3');
  assert(indices.includes(1), 'Expected the bot to prefer the ace');
});

test('GameRoom bot takeover can finish a pending swap after disconnect', function() {
  const room = new GameRoom('ROOM9', null, { num_players: 2 });
  room.addPlayer('socket-a', 'Alice', false, { playerId: 'player-a', reconnectToken: 'token-a' });
  room.addPlayer('socket-b', 'Bob', false, { playerId: 'player-b', reconnectToken: 'token-b' });
  room.gameState.phase = 'swapping';
  room.players[0].hand = [new Card('A', 'S'), new Card('K', 'H')];
  room.players[1].hand = [new Card('4', 'C'), new Card('5', 'D')];
  room.gameState.swapPending['player-a'] = { role: 'President', count: 1, cards: [], to: 'player-b' };
  room.gameState.swapPending['player-b'] = { role: 'Asshole', count: 1, cards: [], to: 'player-a' };
  room.gameState.swapsCompleted['player-b'] = true;

  room.disconnectSocket('socket-a');
  room.promoteDisconnectedPlayerToCPU('player-a');

  const result = room.submitSwap('player-a', room.getBotSwapIndices('player-a'));

  assert(result.success, 'Expected the bot-controlled swap to succeed');
  assert(result.allCompleted, 'Expected all swaps to complete after bot submission');
  assert(room.gameState.phase === 'playing', 'Expected the round to resume after swap processing');
});

test('GameRoom CPU-only rooms expose spectator state correctly', function() {
  const room = new GameRoom('ROOM10', null, { num_players: 3, cpuOnly: true });
  room.addPlayer('cpu-1', 'CPU 1', true, { playerId: 'cpu-1' });
  room.addPlayer('cpu-2', 'CPU 2', true, { playerId: 'cpu-2' });
  room.addPlayer('cpu-3', 'CPU 3', true, { playerId: 'cpu-3' });
  room.addSpectator('spectator-1', 'Watcher');

  const state = room.getSpectatorState('spectator-1');

  assert(room.isCPUOnly(), 'Expected the room to be CPU-only');
  assert(room.hasConnectedParticipants(), 'Expected the spectator to count as a connected participant');
  assert(state.isSpectator, 'Expected spectator state to be flagged as spectator view');
  assert(state.players.every(player => player.isCPU), 'Expected all players to be CPUs');
  assert(state.players.every(player => Array.isArray(player.hand)), 'Expected spectator view to expose player hands');
});

console.log('');
console.log('========================================');
console.log('SUMMARY');
console.log('========================================');
console.log('Total tests: ' + (passed + failed));
console.log('PASSED: ' + passed);
console.log('FAILED: ' + failed);
console.log('========================================');

if (failed === 0) {
  console.log('');
  console.log('ALL TESTS PASSED');
  console.log('');
} else {
  console.log('');
  console.log('SOME TESTS FAILED');
  process.exit(1);
}
