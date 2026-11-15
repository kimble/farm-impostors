// Chooses which multiplication fact to ask next and remembers how each one is going.
//
// Every fact (2x2 up to 10x10, order ignored) sits in a box from 0 (keeps going wrong)
// to MAX_BOX (solid). Weak facts are asked more often, a share of rounds are easy ones
// to keep frustration down, and a missed fact comes back a few rounds later.
//
// This module is pure (no DOM, no three.js) so it can be tested with `npm test`.

export const MIN_FACTOR = 2;
export const MAX_FACTOR = 10;
export const MAX_BOX = 5;

const EASY_SHARE = 0.3; // share of rounds that are deliberately comfortable
const RECENT = 4; // a fact is not repeated within this many rounds
const EASY_BOX = 3;
const TIMES_KEPT = 15;

export function factKey(a, b) {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

// Starting guess before the game has seen him play: the 2, 5 and 10 tables are
// usually known, and 6-9 times 6-9 is where most people struggle.
export function priorBox(a, b) {
  const known = (n) => n === 2 || n === 5 || n === 10;
  if (known(a) || known(b)) return 3;
  if (Math.min(a, b) <= 4) return 2;
  return 1;
}

// ---------- How a fact reads for each blaster ----------
//
// `gun` is the number on the blaster and `answer` the number on the impostor.
// The × blaster asks  gun × ? = product.  The ÷ blaster asks  product ÷ gun = ?.

export function equation(op, gun, answer, product) {
  return op === '÷' ? `${product} ÷ ${gun} = ${answer}` : `${gun} × ${answer} = ${product}`;
}

// The same equation as the text before and after the missing number.
export function equationParts(op, gun, product) {
  return op === '÷' ? [`${product} ÷ ${gun} = `, ''] : [`${gun} × `, ` = ${product}`];
}

// The numbers in the order they are said aloud: "7 times 6 is 42", "42 divided by 7 is 6".
export function spokenOrder(op, gun, answer, product) {
  return op === '÷' ? [product, gun, answer] : [gun, answer, product];
}

// What the wrong animal would really have been the answer to.
export function mistake(op, gun, shot, product) {
  const made = gun * shot;
  return op === '÷'
    ? `${made} ÷ ${gun} = ${shot}, not ${product} ÷ ${gun}`
    : `${gun} × ${shot} = ${made}, not ${product}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

function count(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export class FactTrainer {
  constructor(saved = null, rng = Math.random) {
    this.rng = rng;
    this.facts = new Map();
    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
      for (let b = a; b <= MAX_FACTOR; b++) {
        const key = factKey(a, b);
        const old = saved?.facts?.[key];
        const box = Number.isFinite(old?.box)
          ? Math.min(MAX_BOX, Math.max(0, Math.round(old.box)))
          : priorBox(a, b);
        this.facts.set(key, {
          key,
          a,
          b,
          box,
          seen: count(old?.seen),
          right: count(old?.right),
          wrong: count(old?.wrong),
          missStreak: 0, // misses in a row this session (not saved)
        });
      }
    }
    this.times = Array.isArray(saved?.times)
      ? saved.times.filter((t) => Number.isFinite(t) && t > 0).slice(-TIMES_KEPT)
      : [];
    this.round = 0;
    this.recent = [];
    this.retries = [];
    this.comfortNext = false;
    this.lastReason = null;
  }

  // Returns the next fact to ask: the blaster is set to `gun`, the impostor wears `animal`,
  // and the scanner shows `product`.
  next() {
    this.round += 1;
    const last = this.recent[this.recent.length - 1];
    let fact;
    let reason;

    // A miss is always followed by an easy round, and retries never run back to back,
    // so someone stuck on a few facts still gets variety and some wins in between.
    const due =
      this.comfortNext || this.lastReason === 'retry'
        ? -1
        : this.retries.findIndex((r) => r.due <= this.round && r.key !== last);
    if (due >= 0) {
      fact = this.facts.get(this.retries[due].key);
      this.retries.splice(due, 1);
      reason = 'retry';
    } else {
      const pool = [...this.facts.values()].filter(
        (f) => !this.recent.includes(f.key) && !this.retries.some((r) => r.key === f.key),
      );
      if (this.comfortNext || this.rng() < EASY_SHARE) {
        fact = this.pickEasy(pool);
        reason = 'easy';
        this.comfortNext = false;
      } else {
        fact = this.pickWeak(pool);
        reason = 'weak';
      }
    }
    this.lastReason = reason;

    this.recent.push(fact.key);
    if (this.recent.length > RECENT) this.recent.shift();

    const swap = this.rng() < 0.5;
    const gun = swap ? fact.b : fact.a;
    const animal = swap ? fact.a : fact.b;
    return { key: fact.key, gun, animal, product: gun * animal, reason };
  }

  pickEasy(pool) {
    let easy = pool.filter((f) => f.box >= EASY_BOX);
    if (!easy.length) {
      const best = Math.max(...pool.map((f) => f.box));
      easy = pool.filter((f) => f.box === best);
    }
    return easy[Math.floor(this.rng() * easy.length)];
  }

  pickWeak(pool) {
    const weights = pool.map((f) => (MAX_BOX + 1 - f.box) ** 2 * (f.seen === 0 ? 1.5 : 1));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = this.rng() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // firstTry: the impostor was found without zapping a real animal first.
  // ms: time from the signal appearing to the catch (only meaningful when firstTry).
  record(key, { firstTry, ms = 0 }) {
    const fact = this.facts.get(key);
    if (!fact) return null;
    fact.seen += 1;
    if (firstTry) {
      fact.right += 1;
      fact.missStreak = 0;
      const typical = this.typicalMs();
      const slow = typical !== null && ms > typical * 2;
      if (!slow) fact.box = Math.min(MAX_BOX, fact.box + 1);
      if (ms > 0) {
        this.times.push(ms);
        if (this.times.length > TIMES_KEPT) this.times.shift();
      }
    } else {
      fact.wrong += 1;
      fact.box = Math.max(0, fact.box - 2);
      fact.missStreak += 1;
      if (!this.retries.some((r) => r.key === key)) {
        // First miss: back in 2-3 rounds. A fact that keeps being missed waits longer
        // each time, so it cannot crowd out everything else.
        const backoff = Math.min(3, fact.missStreak - 1) * 2;
        this.retries.push({ key, due: this.round + 2 + Math.floor(this.rng() * 2) + backoff });
      }
      this.comfortNext = true;
    }
    return fact;
  }

  all() {
    return [...this.facts.values()];
  }

  // His usual time for a first-try catch, or null until there are a few to go on.
  typicalMs() {
    return this.times.length >= 5 ? median(this.times) : null;
  }

  toJSON() {
    const facts = {};
    for (const f of this.facts.values()) {
      if (f.seen > 0) facts[f.key] = { box: f.box, seen: f.seen, right: f.right, wrong: f.wrong };
    }
    return { v: 1, facts, times: this.times };
  }
}

// ---------- Other ways to ask a fact ----------
//
// The farm and forest ask for a missing factor. The later levels ask differently:
//   'product' - the herd wears answers:  7 × 6 = ?   or   ? ÷ 7 = 6
//   'dial'    - the player sets a number that goes into the product
//   'pair'    - the player picks two numbers that multiply to the product
// The facts stay the same 2..10 × 2..10, so every level trains the same saved store.

// The text before and after the unknown when the answer is the product.
export function productParts(op, gun, answer) {
  return op === '÷' ? ['', ` ÷ ${gun} = ${answer}`] : [`${gun} × ${answer} = `, ''];
}

// Whether `n` goes into `product` with a partner that is also on the table (2..10).
export function fits(n, product) {
  if (!Number.isInteger(n) || n < MIN_FACTOR || n > MAX_FACTOR || product % n !== 0) return false;
  const partner = product / n;
  return partner >= MIN_FACTOR && partner <= MAX_FACTOR;
}

// Ten numbers for the herd to wear when the answer is a product: the answer and the
// nine products closest to it from the same two tables (for 7 × 6 = 42: 36, 48, 35,
// 49 ...), which are the ones most easily mixed up with it. Shuffled.
export function productChoices(gun, answer, rng = Math.random) {
  const product = gun * answer;
  const near = new Set();
  for (let k = 1; k <= MAX_FACTOR; k++) {
    near.add(gun * k);
    near.add(k * answer);
  }
  near.delete(product);
  const closest = [...near]
    .sort((x, y) => Math.abs(x - product) - Math.abs(y - product) || x - y)
    .slice(0, 9);
  const out = [product, ...closest];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Explains a wrong answer with a true fact, so a miss still teaches something.
// Returns { text, fact }, where `fact` is { op, gun, answer, product } to say aloud
// (or null when there is no fact worth saying).
//   ask 'factor':  shot is the number on the animal that was hit
//   ask 'product': shot is the product the animal was wearing
//   ask 'dial':    shot is the number on the dial
//   ask 'pair':    shot is the second number, `first` the one already picked
export function explainMiss({ ask = 'factor', op = '×', gun, answer, product, shot, first = null }) {
  const times = (a, b) => ({ op: '×', gun: a, answer: b, product: a * b });
  if (ask === 'product') {
    const viaGun = shot % gun === 0 && shot / gun <= MAX_FACTOR;
    const k = viaGun ? shot / gun : shot / answer;
    if (!viaGun && (!Number.isInteger(k) || k > MAX_FACTOR)) {
      return { text: `${shot} is not the answer`, fact: null };
    }
    if (op === '÷') {
      return viaGun
        ? { text: `${shot} ÷ ${gun} = ${k}, not ${answer}`, fact: { op: '÷', gun, answer: k, product: shot } }
        : { text: `${shot} ÷ ${k} = ${answer}, not ${shot} ÷ ${gun}`, fact: { op: '÷', gun: k, answer, product: shot } };
    }
    const fact = viaGun ? times(gun, k) : times(k, answer);
    return { text: `${fact.gun} × ${fact.answer} = ${shot}, not ${gun} × ${answer}`, fact };
  }
  if (ask === 'dial' || (ask === 'pair' && first === null)) {
    // The table row of the number he chose, at the step nearest the target.
    const q = Math.max(1, Math.min(MAX_FACTOR, Math.round(product / shot)));
    return { text: `${shot} × ${q} = ${shot * q}, not ${product}`, fact: times(shot, q) };
  }
  if (ask === 'pair') {
    return { text: `${first} × ${shot} = ${first * shot}, not ${product}`, fact: times(first, shot) };
  }
  return { text: mistake(op, gun, shot, product), fact: { op, gun, answer: shot, product: gun * shot } };
}
