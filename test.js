import { RankSystem } from './RankSystem.js';
import { Validator } from './Validator.js';
import { Card } from './Card.js';

console.log('Running comprehensive test suite...');
console.log('');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('PASS: ' + name);
    passed++;
  } catch (e) {
    console.log('FAIL: ' + name);
    console.log('  Error: ' + e.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

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
console.log('BLACK 3 BOMBING TESTS (NEW FEATURE)');
console.log('========================================');

test('Single Black 3 CAN beat pair (bombing)', function() {
  const pair = [new Card('4', 'H'), new Card('4', 'C')];
  const black3 = new Card('3', 'C');

  const lastPlay = Validator.getPlayType(pair, {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Single Black 3 should beat pair');
});

test('Single Black 3 CAN beat triple (bombing)', function() {
  const triple = [new Card('5', 'H'), new Card('5', 'C'), new Card('5', 'D')];
  const black3 = new Card('3', 'S');

  const lastPlay = Validator.getPlayType(triple, {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Single Black 3 should beat triple');
});

test('Single Black 3 CAN beat quad (bombing)', function() {
  const quad = [new Card('6', 'H'), new Card('6', 'C'), new Card('6', 'D'), new Card('6', 'S')];
  const black3 = new Card('3', 'C');

  const lastPlay = Validator.getPlayType(quad, {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Single Black 3 should beat quad');
});

test('Single Black 3 CAN beat single 2', function() {
  const two = new Card('2', 'H');
  const black3 = new Card('3', 'C');

  const lastPlay = Validator.getPlayType([two], {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Black 3 (rank 14) should beat 2 (rank 13)');
});

test('Single Black 3 CANNOT beat J♦', function() {
  const jd = new Card('J', 'D');
  const black3 = new Card('3', 'S');

  const lastPlay = Validator.getPlayType([jd], {});
  const newPlay = Validator.getPlayType([black3], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, 'Black 3 should NOT beat J♦');
  assert(result.error === 'Cannot beat Jack of Diamonds');
});

console.log('');
console.log('========================================');
console.log('2 BEHAVIOR TESTS (UPDATED)');
console.log('========================================');

test('Single 2 CAN beat single lower rank', function() {
  const ace = new Card('A', 'H');
  const two = new Card('2', 'C');

  const lastPlay = Validator.getPlayType([ace], {});
  const newPlay = Validator.getPlayType([two], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, '2 should beat Ace');
});

test('Single 2 CANNOT beat Black 3', function() {
  const black3 = new Card('3', 'C');
  const two = new Card('2', 'H');

  const lastPlay = Validator.getPlayType([black3], {});
  const newPlay = Validator.getPlayType([two], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, '2 should NOT beat Black 3');
});

test('Single 2 CANNOT beat pair (no bombing)', function() {
  const pair = [new Card('4', 'H'), new Card('4', 'C')];
  const two = new Card('2', 'D');

  const lastPlay = Validator.getPlayType(pair, {});
  const newPlay = Validator.getPlayType([two], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, 'Single 2 should NOT beat pair');
  assert(result.error === 'Must match card count');
});

console.log('');
console.log('========================================');
console.log('J♦ ULTIMATE POWER TESTS');
console.log('========================================');

test('J♦ CAN beat single Black 3', function() {
  const black3 = new Card('3', 'C');
  const jd = new Card('J', 'D');

  const lastPlay = Validator.getPlayType([black3], {});
  const newPlay = Validator.getPlayType([jd], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'J♦ should beat Black 3');
});

test('J♦ CAN beat quad', function() {
  const quad = [new Card('A', 'H'), new Card('A', 'C'), new Card('A', 'D'), new Card('A', 'S')];
  const jd = new Card('J', 'D');

  const lastPlay = Validator.getPlayType(quad, {});
  const newPlay = Validator.getPlayType([jd], {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'J♦ should beat quad');
});

console.log('');
console.log('========================================');
console.log('NORMAL PLAY TESTS');
console.log('========================================');

test('Pair beats lower pair', function() {
  const pair1 = [new Card('4', 'H'), new Card('4', 'C')];
  const pair2 = [new Card('5', 'D'), new Card('5', 'S')];

  const lastPlay = Validator.getPlayType(pair1, {});
  const newPlay = Validator.getPlayType(pair2, {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(result.canBeat, 'Pair of 5s should beat pair of 4s');
});

test('Triple must match count', function() {
  const pair = [new Card('4', 'H'), new Card('4', 'C')];
  const triple = [new Card('5', 'D'), new Card('5', 'S'), new Card('5', 'H')];

  const lastPlay = Validator.getPlayType(pair, {});
  const newPlay = Validator.getPlayType(triple, {});
  const result = Validator.canBeatPlay(newPlay, lastPlay, {});

  assert(!result.canBeat, 'Triple should not beat pair (different count)');
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
  console.log('✅✅✅ ALL TESTS PASSED! ✅✅✅');
  console.log('');
  console.log('CONFIRMED:');
  console.log('  ✅ Single Black 3 can bomb pairs, triples, quads');
  console.log('  ✅ Single Black 3 beats single 2');
  console.log('  ✅ Only J♦ beats single Black 3');
  console.log('  ✅ Single 2 only beats singles (no bombing)');
  console.log('  ✅ J♦ beats everything');
  console.log('');
} else {
  console.log('');
  console.log('❌ SOME TESTS FAILED ❌');
  process.exit(1);
}
