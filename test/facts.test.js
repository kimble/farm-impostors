import test from 'node:test';
import assert from 'node:assert/strict';
import { FactTrainer, factKey, priorBox, MAX_BOX } from '../src/facts.js';

// Small seeded generator so the tests are repeatable.
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('fact keys ignore order', () => {
  assert.equal(factKey(7, 6), '6x7');
  assert.equal(factKey(6, 7), '6x7');
});

test('starting guess puts 6-9 times 6-9 lowest', () => {
  assert.equal(priorBox(2, 9), 3);
  assert.equal(priorBox(5, 5), 3);
  assert.equal(priorBox(3, 8), 2);
  assert.equal(priorBox(7, 8), 1);
});

test('covers every fact from 2x2 to 10x10 once', () => {
  const trainer = new FactTrainer(null, seeded(1));
  assert.equal(trainer.all().length, 45);
});

test('every question is a consistent fact within the table', () => {
  const trainer = new FactTrainer(null, seeded(2));
  for (let i = 0; i < 300; i++) {
    const q = trainer.next();
    assert.equal(q.product, q.gun * q.animal);
    assert.ok(q.gun >= 2 && q.gun <= 10, `gun ${q.gun}`);
    assert.ok(q.animal >= 2 && q.animal <= 10, `animal ${q.animal}`);
    assert.equal(q.key, factKey(q.gun, q.animal));
    trainer.record(q.key, { firstTry: i % 4 !== 0, ms: 5000 });
  }
});

test('only a deliberate retry repeats a recent fact, and never straight away', () => {
  const trainer = new FactTrainer(null, seeded(3));
  const asked = [];
  let lastReason = null;
  for (let i = 0; i < 400; i++) {
    const q = trainer.next();
    assert.notEqual(q.key, asked[asked.length - 1], `back-to-back ${q.key} at round ${i}`);
    if (q.reason === 'retry') {
      assert.notEqual(lastReason, 'retry', `two retries in a row at round ${i}`);
    } else {
      assert.ok(!asked.slice(-3).includes(q.key), `repeat of ${q.key} at round ${i}`);
    }
    asked.push(q.key);
    lastReason = q.reason;
    trainer.record(q.key, { firstTry: i % 3 !== 0, ms: 5000 });
  }
});

test('a missed fact comes back within three rounds, after an easy one', () => {
  const trainer = new FactTrainer(null, seeded(4));
  const missed = trainer.next();
  trainer.record(missed.key, { firstTry: false });

  const comfort = trainer.next();
  assert.equal(comfort.reason, 'easy');
  assert.notEqual(comfort.key, missed.key);
  assert.ok(trainer.facts.get(comfort.key).box >= 3);
  trainer.record(comfort.key, { firstTry: true, ms: 4000 });

  let returned = false;
  for (let i = 0; i < 2 && !returned; i++) {
    const q = trainer.next();
    returned = q.key === missed.key;
    trainer.record(q.key, { firstTry: true, ms: 4000 });
  }
  assert.ok(returned, 'missed fact was not asked again');
});

test('answers move a fact between boxes', () => {
  const trainer = new FactTrainer(null, seeded(5));
  trainer.record('7x8', { firstTry: true, ms: 4000 });
  assert.equal(trainer.facts.get('7x8').box, 2);
  trainer.record('7x8', { firstTry: false });
  assert.equal(trainer.facts.get('7x8').box, 0);
  for (let i = 0; i < 10; i++) trainer.record('2x2', { firstTry: true, ms: 4000 });
  assert.equal(trainer.facts.get('2x2').box, MAX_BOX);
});

test('a correct but very slow answer does not count as progress', () => {
  const trainer = new FactTrainer(null, seeded(6));
  for (let i = 0; i < 6; i++) trainer.record('2x3', { firstTry: true, ms: 4000 });
  const before = trainer.facts.get('6x7').box;
  trainer.record('6x7', { firstTry: true, ms: 30000 });
  assert.equal(trainer.facts.get('6x7').box, before);
});

test('leans into weak facts while still mixing in easy ones', () => {
  const trainer = new FactTrainer(null, seeded(7));
  // A learner who knows everything except three facts.
  const weak = new Set(['6x7', '7x8', '8x9']);
  const counts = new Map();
  let easyRounds = 0;
  const rounds = 600;
  for (let i = 0; i < rounds; i++) {
    const q = trainer.next();
    counts.set(q.key, (counts.get(q.key) || 0) + 1);
    if (q.reason === 'easy') easyRounds += 1;
    trainer.record(q.key, { firstTry: !weak.has(q.key), ms: 4000 });
  }
  const weakAverage = [...weak].reduce((sum, key) => sum + counts.get(key), 0) / weak.size;
  const others = [...counts].filter(([key]) => !weak.has(key)).map(([, n]) => n);
  const otherAverage = others.reduce((sum, n) => sum + n, 0) / others.length;
  assert.ok(weakAverage > otherAverage * 4, `weak ${weakAverage} vs other ${otherAverage}`);
  assert.ok(easyRounds / rounds > 0.25, `easy share ${easyRounds / rounds}`);
});

test('progress survives saving and loading', () => {
  const first = new FactTrainer(null, seeded(8));
  first.record('7x8', { firstTry: false });
  first.record('2x5', { firstTry: true, ms: 3000 });
  const saved = JSON.parse(JSON.stringify(first.toJSON()));

  const second = new FactTrainer(saved, seeded(9));
  assert.equal(second.facts.get('7x8').box, 0);
  assert.equal(second.facts.get('7x8').wrong, 1);
  assert.equal(second.facts.get('2x5').box, 4);
  assert.equal(second.facts.get('9x9').box, priorBox(9, 9));
});

test('ignores damaged saved data', () => {
  const trainer = new FactTrainer({ facts: { '7x8': { box: 'oops', seen: -3 } }, times: 'nope' }, seeded(10));
  assert.equal(trainer.facts.get('7x8').box, priorBox(7, 8));
  assert.equal(trainer.facts.get('7x8').seen, 0);
  assert.deepEqual(trainer.times, []);
});
