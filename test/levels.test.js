import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, FIRST_LEVEL, opForRound, chooseLevel } from '../src/levels.js';
import { equation, equationParts, spokenOrder, mistake, productChoices, productParts, fits, explainMiss } from '../src/facts.js';

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

const MODES = ['herd', 'products', 'swarm', 'gates', 'boss'];

test('every level is complete and its shares add up', () => {
  for (const level of Object.values(LEVELS)) {
    assert.ok(MODES.includes(level.mode), level.id);
    // Levels with animals have one for each number; the swarm and the boss have none.
    assert.equal(level.herd.length, ['swarm', 'boss'].includes(level.mode) ? 0 : 10, level.id);
    if (level.pickup) assert.ok(level.pickup in level.mix, level.id);
    else assert.ok(level.carried.length > 0, level.id);
    const total = Object.values(level.mix).reduce((sum, share) => sum + share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, level.id);
    // Every kind of signal can be answered with a blaster the player has.
    for (const op of Object.keys(level.mix)) assert.ok([...level.carried, level.pickup].includes(op), level.id);
    for (const key of ['story', 'go', 'how', 'counter', 'wonTitle']) assert.ok(level.text[key], `${level.id} ${key}`);
    if (level.next) assert.ok(LEVELS[level.next], level.id);
  }
});

test('the levels form one chain from the farm', () => {
  const seen = [];
  for (let id = FIRST_LEVEL; id; id = LEVELS[id].next) seen.push(id);
  assert.deepEqual(seen.sort(), Object.keys(LEVELS).sort());
});

test('levels without a blaster to find never ask for one', () => {
  for (let i = 0; i < 50; i++) assert.equal(opForRound(LEVELS.ridge, i), '×');
  for (let i = 0; i < 50; i++) assert.ok(['×', '÷'].includes(opForRound(LEVELS.hideout, i)));
  assert.equal(opForRound(LEVELS.mothership, 0, () => 0.9999999), '÷');
});

test('when the answer is the product, the herd wears the answer and its closest rivals', () => {
  const choices = productChoices(7, 6, () => 0.3);
  assert.equal(choices.length, 10);
  assert.equal(new Set(choices).size, 10);
  assert.ok(choices.includes(42));
  for (const n of [36, 48, 35, 49]) assert.ok(choices.includes(n), n);
  // Squares have only one table to draw from.
  const square = productChoices(7, 7);
  assert.equal(new Set(square).size, 10);
  assert.ok(square.includes(49));
  // Small facts still find nine rivals.
  assert.equal(new Set(productChoices(2, 2)).size, 10);
  assert.deepEqual(productParts('×', 7, 6), ['7 × 6 = ', '']);
  assert.deepEqual(productParts('÷', 7, 6), ['', ' ÷ 7 = 6']);
});

test('a dial number fits when it goes into the product with a partner on the table', () => {
  assert.ok(fits(7, 56));
  assert.ok(fits(8, 56));
  assert.ok(!fits(6, 56));
  assert.ok(!fits(1, 8)); // 1 × 8 is too easy to count
  assert.ok(!fits(2, 22)); // 11 is off the table
  assert.ok(fits(10, 20));
});

test('every kind of miss is explained with a true fact', () => {
  assert.equal(explainMiss({ op: '×', gun: 7, answer: 6, product: 42, shot: 2 }).text, '7 × 2 = 14, not 42');
  const product = explainMiss({ ask: 'product', op: '×', gun: 7, answer: 6, product: 42, shot: 49 });
  assert.equal(product.text, '7 × 7 = 49, not 7 × 6');
  assert.deepEqual(product.fact, { op: '×', gun: 7, answer: 7, product: 49 });
  assert.equal(explainMiss({ ask: 'product', op: '×', gun: 7, answer: 6, product: 42, shot: 48 }).text, '8 × 6 = 48, not 7 × 6');
  assert.equal(explainMiss({ ask: 'product', op: '÷', gun: 7, answer: 6, product: 42, shot: 49 }).text, '49 ÷ 7 = 7, not 6');
  assert.equal(explainMiss({ ask: 'product', op: '÷', gun: 7, answer: 6, product: 42, shot: 48 }).text, '48 ÷ 8 = 6, not 48 ÷ 7');
  assert.equal(explainMiss({ ask: 'dial', gun: 7, answer: 8, product: 56, shot: 6 }).text, '6 × 9 = 54, not 56');
  assert.equal(explainMiss({ ask: 'pair', gun: 4, answer: 9, product: 36, shot: 5 }).text, '5 × 7 = 35, not 36');
  assert.equal(explainMiss({ ask: 'pair', gun: 4, answer: 9, product: 36, shot: 8, first: 4 }).text, '4 × 8 = 32, not 36');
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
