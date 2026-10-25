// Independent rules check — President (Daihinmin family variant)
// Replays the port's OWN documented rules (references/rulebook-extract.md, GameRules.js,
// RankSystem.js, Validator.js) against the live engine. President has no canonical rulebook,
// so this verifies internal consistency + family-standard alignment.
// Run: node scripts/independent-rules-check.mjs  (exit 0 = all pass)
import { Validator } from '../Validator.js';
import { RankSystem } from '../RankSystem.js';
import { GameRules } from '../GameRules.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, note = '') {
  if (ok) pass++; else { fail++; failures.push(name + (note ? ` — ${note}` : '')); }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
}
const C = (rank, suit) => ({ rank, suit });

// --- Rank values (RankSystem) ---
console.log('— Rank order (RankSystem) —');
const opts = GameRules.getDefaultOptions();
check('base order: 3 low, 2 high', RankSystem.rankValue(C('3', 'H'), opts) === 0 && RankSystem.rankValue(C('2', 'S'), opts) === 13);
check('black 3 is a bomb (rank 14)', RankSystem.rankValue(C('3', 'C'), opts) === 14 && RankSystem.rankValue(C('3', 'S'), opts) === 14);
check('J♦ bomb is 15', RankSystem.rankValue(C('J', 'D'), opts) === 15);
check('J♦ with jackOfDiamondsBomb=false ranks as J', RankSystem.rankValue(C('J', 'D'), { jackOfDiamondsBomb: false }) === RankSystem.baseRankOrder.indexOf('J'));
check('A > K > Q > J > 10', RankSystem.rankValue(C('A', 'H'), opts) > RankSystem.rankValue(C('K', 'H'), opts) && RankSystem.rankValue(C('K', 'H'), opts) > RankSystem.rankValue(C('Q', 'H'), opts) && RankSystem.rankValue(C('Q', 'H'), opts) > RankSystem.rankValue(C('J', 'H'), opts) && RankSystem.rankValue(C('J', 'H'), opts) > RankSystem.rankValue(C('10', 'H'), opts));

// --- Play types (Validator.getPlayType) ---
console.log('— Play types (Validator) —');
check('single valid', Validator.getPlayType([C('5', 'H')], opts).type === 'single');
check('pair valid', Validator.getPlayType([C('5', 'H'), C('5', 'S')], opts).type === 'set');
check('triple valid', Validator.getPlayType([C('5', 'H'), C('5', 'S'), C('5', 'C')], opts).type === 'set');
check('quad valid', Validator.getPlayType([C('5', 'H'), C('5', 'S'), C('5', 'C'), C('5', 'D')], opts).type === 'set');
check('mixed ranks invalid', Validator.getPlayType([C('5', 'H'), C('6', 'S')], opts).type === 'invalid');
check('J♦ must be played alone', Validator.getPlayType([C('J', 'D'), C('J', 'H')], opts).type === 'invalid');
check('runs disabled by default', Validator.getPlayType([C('5', 'H'), C('6', 'H'), C('7', 'H')], opts).type === 'invalid');
check('run valid when allowed', Validator.getPlayType([C('5', 'H'), C('6', 'H'), C('7', 'H')], { ...opts, runsAllowed: true }).type === 'run');
check('run must be same suit', Validator.getPlayType([C('5', 'H'), C('6', 'H'), C('7', 'S')], { ...opts, runsAllowed: true }).type === 'invalid');
check('run ranks 4..A only (no 3)', Validator.getPlayType([C('3', 'H'), C('4', 'H'), C('5', 'H')], { ...opts, runsAllowed: true }).type === 'invalid');
check('run min length 3', Validator.getPlayType([C('5', 'H'), C('6', 'H')], { ...opts, runsAllowed: true }).type === 'invalid');

// --- Beat logic (Validator.canBeatPlay) ---
console.log('— Beat logic (Validator) —');
const single5 = Validator.getPlayType([C('5', 'H')], opts);
const single6 = Validator.getPlayType([C('6', 'H')], opts);
const single4 = Validator.getPlayType([C('4', 'H')], opts);
check('6 beats 5', Validator.canBeatPlay(single6, single5, opts).canBeat === true);
check('4 does not beat 5', Validator.canBeatPlay(single4, single5, opts).canBeat === false);
const pair5 = Validator.getPlayType([C('5', 'H'), C('5', 'S')], opts);
const pair6 = Validator.getPlayType([C('6', 'H'), C('6', 'S')], opts);
check('pair 6 beats pair 5', Validator.canBeatPlay(pair6, pair5, opts).canBeat === true);
check('single cannot beat pair (length mismatch)', Validator.canBeatPlay(single6, pair5, opts).canBeat === false);

// --- Bombs ---
console.log('— Bombs —');
const jdBomb = Validator.getPlayType([C('J', 'D')], opts);
const black3 = Validator.getPlayType([C('3', 'C')], opts);
check('J♦ bomb beats single 5', Validator.canBeatPlay(jdBomb, single5, opts).canBeat === true);
check('nothing beats J♦ bomb', Validator.canBeatPlay(pair6, jdBomb, opts).canBeat === false);
check('black 3 bomb beats pair 5', Validator.canBeatPlay(black3, pair5, opts).canBeat === true);
check('black 3 bomb beats J♦? NO', Validator.canBeatPlay(black3, jdBomb, opts).canBeat === false);
const twoSingle = Validator.getPlayType([C('2', 'S')], opts);
check('single 2 beats single 5', Validator.canBeatPlay(twoSingle, single5, opts).canBeat === true);
check('single 2 cannot beat another 2', Validator.canBeatPlay(twoSingle, Validator.getPlayType([C('2', 'H')], opts), opts).canBeat === false);
const triple6 = Validator.getPlayType([C('6', 'H'), C('6', 'S'), C('6', 'C')], { ...opts, tripleSixesBeatJd: true });
check('triple 6 beats J♦ when option on', Validator.canBeatPlay(triple6, jdBomb, { ...opts, tripleSixesBeatJd: true }).canBeat === true);

// --- Roles ---
console.log('— Roles (GameRules.assignRoles) —');
const roles4 = GameRules.assignRoles(['p0', 'p1', 'p2', 'p3'], 4);
check('4p: President, VP, Vice Asshole, Asshole', roles4['p0'] === 'President' && roles4['p1'] === 'Vice President' && roles4['p2'] === 'Vice Asshole' && roles4['p3'] === 'Asshole');
const roles3 = GameRules.assignRoles(['p0', 'p1', 'p2'], 3);
check('3p: President + Asshole only', roles3['p0'] === 'President' && roles3['p1'] === undefined && roles3['p2'] === 'Asshole');

// --- Start player (3♣ leads) ---
console.log('— Start (3♣ leads) —');
const players = [{ id: 'a', hand: [C('4', 'H'), C('9', 'S')] }, { id: 'b', hand: [C('3', 'C'), C('K', 'D')] }, { id: 'c', hand: [C('5', 'H')] }];
check('3♣ holder leads first', GameRules.getStartingPlayer(players) === 1);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('FAILURES:\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
