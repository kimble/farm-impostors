import test from 'node:test';
import assert from 'node:assert/strict';
import { catchScore, waveFor, hunterTimeLimit } from '../src/score.js';
import { phrase, defaultMode } from '../src/voice.js';

test('a first-try catch scores more the faster it is', () => {
  const fast = catchScore({ firstTry: true, combo: 1, elapsed: 2, limit: 20 });
  const slow = catchScore({ firstTry: true, combo: 1, elapsed: 18, limit: 20 });
  assert.equal(fast.points, 190);
  assert.equal(slow.points, 110);
});

test('the combo multiplies the score and stops at five', () => {
  const at = (combo) => catchScore({ firstTry: true, combo, elapsed: 20, limit: 20 }).points;
  assert.equal(at(1), 100);
  assert.equal(at(3), 300);
  assert.equal(at(5), 500);
  assert.equal(at(12), 500);
});

test('a catch after a mistake scores a flat consolation', () => {
  assert.deepEqual(catchScore({ firstTry: false, combo: 0, elapsed: 1, limit: 20 }), {
    points: 50,
    multiplier: 1,
    speedBonus: 0,
  });
});

test('taking longer than the limit never scores below the base', () => {
  assert.equal(catchScore({ firstTry: true, combo: 2, elapsed: 99, limit: 20 }).points, 200);
});

test('waves advance every five rescues and stop at four', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 15, 19, 20, 40].map(waveFor), [1, 1, 2, 2, 3, 4, 4, 4, 4]);
});

test('the hunter is generous before the game knows his pace', () => {
  assert.equal(hunterTimeLimit({ typicalMs: null, wave: 1 }), 28);
  assert.equal(hunterTimeLimit({ typicalMs: null, wave: 1, first: true }), 40);
});

test('the hunter follows his pace, within sane limits', () => {
  assert.equal(hunterTimeLimit({ typicalMs: 8000, wave: 1 }), 20);
  assert.equal(hunterTimeLimit({ typicalMs: 2000, wave: 1 }), 16);
  assert.equal(hunterTimeLimit({ typicalMs: 60000, wave: 1 }), 30);
});

test('later waves give less time', () => {
  const times = [1, 2, 3, 4].map((wave) => hunterTimeLimit({ typicalMs: 8000, wave }));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1]);
  assert.ok(times[3] > 10, `final wave leaves ${times[3]} s`);
});

test('facts are phrased in the chosen language', () => {
  assert.equal(phrase('en', '×', 7, 6, 42), '7 times 6 is 42');
  assert.equal(phrase('no', '×', 7, 6, 42), '7 ganger 6 er 42');
  assert.equal(phrase('en', '÷', 42, 7, 6), '42 divided by 7 is 6');
  assert.equal(phrase('no', '÷', 42, 7, 6), '42 delt på 7 er 6');
  assert.equal(phrase('off', '×', 7, 6, 42), '');
});

test('the starting voice language follows the browser', () => {
  assert.equal(defaultMode('nb-NO'), 'no');
  assert.equal(defaultMode('no'), 'no');
  assert.equal(defaultMode('nn-NO'), 'no');
  assert.equal(defaultMode('en-GB'), 'en');
  assert.equal(defaultMode(''), 'en');
});

// ---------- Choosing a voice ----------

const { rankVoices } = await import('../src/voice.js');

test('prefers natural-sounding voices over robotic ones', () => {
  const voices = [
    { name: 'English (America) espeak-ng', lang: 'en-US', localService: true },
    { name: 'English (Great Britain) espeak-ng', lang: 'en-GB', localService: true },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Google Deutsch', lang: 'de-DE', localService: false },
  ];
  const ranked = rankVoices(voices, 'en').map((v) => v.name);
  assert.equal(ranked[0], 'Google US English');
  assert.equal(ranked[1], 'Google UK English Female');
  assert.equal(ranked.length, 4);
  assert.ok(ranked.indexOf('English (America) espeak-ng') > 1);
});

test('finds Norwegian voices under any of their language codes', () => {
  const voices = [
    { name: 'Microsoft Jon', lang: 'nb-NO', localService: true },
    { name: 'Nora', lang: 'no_NO', localService: true },
    { name: 'Samantha', lang: 'en-US', localService: true },
  ];
  assert.deepEqual(rankVoices(voices, 'no').map((v) => v.name), ['Microsoft Jon', 'Nora']);
  assert.deepEqual(rankVoices(voices, 'off'), []);
});
