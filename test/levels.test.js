import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, FIRST_LEVEL, opForRound, chooseLevel } from '../src/levels.js';
import { equation, equationParts, spokenOrder, mistake } from '../src/facts.js';

test('each blaster reads the same fact its own way', () => {
  assert.equal(equation('×', 7, 6, 42), '7 × 6 = 42');
  assert.equal(equation('÷', 7, 6, 42), '42 ÷ 7 = 6');
  assert.deepEqual(equationParts('×', 7, 42), ['7 × ', ' = 42']);
  assert.deepEqual(equationParts('÷', 7, 42), ['42 ÷ 7 = ', '']);
  assert.deepEqual(spokenOrder('×', 7, 6, 42), [7, 6, 42]);
  assert.deepEqual(spokenOrder('÷', 7, 6, 42), [42, 7, 6]);
});

test('a wrong shot is explained with the true fact it belongs to', () => {
  assert.equal(mistake('×', 7, 2, 42), '7 × 2 = 14, not 42');
  assert.equal(mistake('÷', 7, 2, 42), '14 ÷ 7 = 2, not 42 ÷ 7');
});

test('every level has ten animals, a blaster to find and shares that add up', () => {
  for (const level of Object.values(LEVELS)) {
    assert.equal(level.herd.length, 10, level.id);
    assert.ok(level.pickup in level.mix, level.id);
    const total = Object.values(level.mix).reduce((sum, share) => sum + share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, level.id);
    for (const op of level.carried) assert.ok(op in level.mix, level.id);
    if (level.next) assert.ok(LEVELS[level.next], level.id);
  }
});

test('the farm only ever sends multiplication', () => {
  for (let i = 0; i < 50; i++) assert.equal(opForRound(LEVELS.farm, i), '×');
});

test('the forest starts with division, then mixes in multiplication', () => {
  const { forest } = LEVELS;
  for (let i = 0; i < forest.warmup; i++) assert.equal(opForRound(forest, i, () => 0.99), '÷');
  assert.equal(opForRound(forest, forest.warmup, () => 0.1), '÷');
  assert.equal(opForRound(forest, forest.warmup, () => 0.9), '×');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(opForRound(forest, 10));
  assert.deepEqual([...seen].sort(), ['×', '÷']);
});

test('a locked level falls back to the first one', () => {
  assert.equal(chooseLevel('forest', []), FIRST_LEVEL);
  assert.equal(chooseLevel('forest', ['forest']), 'forest');
  assert.equal(chooseLevel('nowhere', ['forest']), FIRST_LEVEL);
  assert.equal(chooseLevel(undefined, undefined), FIRST_LEVEL);
});
