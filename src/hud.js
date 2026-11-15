// Everything drawn as HTML on top of the 3D view: hearts, scanner, score, messages, menus.

import { MIN_FACTOR, MAX_FACTOR, factKey, equationParts } from './facts.js';

const SLOTS = ['×', '÷', '+', '−'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function points(value) {
  return value.toLocaleString('en-US');
}

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('hud');
    this.hearts = $('hearts');
    this.scanner = $('scanner');
    this.equation = $('equation');
    this.threat = $('threat');
    this.threatFill = $('threat-fill');
    this.threatLabel = $('threat-label');
    this.progress = $('progress');
    this.score = $('score');
    this.combo = $('combo');
    this.rescued = $('rescued');
    this.total = $('total');
    this.wave = $('wave');
    this.bannerBox = $('banner');
    this.toastBox = $('toast');
    this.objective = $('objective');
    this.weapons = $('weapons');
    this.vignette = $('vignette');
    this.start = $('start');
    this.pause = $('pause');
    this.results = $('results');
    this.toastTimer = null;
    this.bannerTimer = null;
  }

  showHud() {
    this.root.hidden = false;
  }

  hideOverlays() {
    this.start.hidden = true;
    this.pause.hidden = true;
    this.results.hidden = true;
  }

  showPause() {
    this.hideOverlays();
    this.pause.hidden = false;
  }

  setHearts(count, max) {
    this.hearts.replaceChildren();
    for (let i = 0; i < max; i++) {
      this.hearts.append(el('span', i < count ? '' : 'lost', '♥'));
    }
  }

  // Shows "7 × ? = 42" or "42 ÷ 7 = ?". Pass `answer` to show the solved fact instead.
  setEquation(op, gun, product, answer = null) {
    const [before, after] = equationParts(op, gun, product);
    this.scanner.hidden = false;
    this.equation.classList.toggle('solved', answer !== null);
    this.equation.classList.toggle('divide', op === '÷');
    this.equation.replaceChildren(before, el('span', 'unknown', answer === null ? '?' : String(answer)), after);
  }

  hideScanner() {
    this.scanner.hidden = true;
  }

  // fraction: 0 (hunter just launched) to 1 (about to strike). null hides the readout.
  setThreat(fraction, metres = 0) {
    if (fraction === null) {
      this.threatFill.style.width = '0';
      this.threatLabel.textContent = '';
      this.threat.classList.remove('close');
      return;
    }
    this.threatFill.style.width = `${Math.round(fraction * 100)}%`;
    this.threatLabel.textContent = `Hunter ${Math.round(metres)} m`;
    this.threat.classList.toggle('close', fraction > 0.75);
  }

  setProgress({ score, multiplier, rescued, total, wave }) {
    this.progress.hidden = false;
    this.score.textContent = points(score);
    this.combo.textContent = multiplier >= 2 ? `×${multiplier} combo` : '';
    this.rescued.textContent = rescued;
    this.total.textContent = total;
    this.wave.textContent = wave;
  }

  // Points just earned. Kept away from the fact on screen: "7 × 6 = 42 +190" reads as a sum.
  scoreGain(points, bonusHeart = false) {
    const gain = document.getElementById('score-gain');
    gain.textContent = `+${points} points${bonusHeart ? ' · extra ♥' : ''}`;
    gain.classList.remove('show');
    void gain.offsetWidth; // restart the animation
    gain.classList.add('show');
  }

  hideProgress() {
    this.progress.hidden = true;
  }

  banner(text, seconds = 2) {
    this.bannerBox.textContent = text;
    this.bannerBox.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerBox.classList.remove('show'), seconds * 1000);
  }

  toast(text, kind = 'info', seconds = 2.5) {
    this.toastBox.textContent = text;
    this.toastBox.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastBox.classList.remove('show'), seconds * 1000);
  }

  setObjective(text) {
    this.objective.textContent = text;
  }

  // owned: the blasters found so far, e.g. ['×', '÷']. active: the one in hand.
  // wanted: the one the current signal needs, which pulses until it is in hand.
  setWeapons(owned, active, wanted = null) {
    this.weapons.replaceChildren();
    for (const symbol of SLOTS) {
      const has = owned.includes(symbol);
      const slot = el('div', 'slot', has ? symbol : '?');
      if (has) slot.classList.add('owned');
      if (has && symbol === '÷') slot.classList.add('divide');
      if (has && symbol === active) slot.classList.add('active');
      if (has && symbol === wanted && symbol !== active) slot.classList.add('wanted');
      this.weapons.append(slot);
    }
  }

  flashDamage() {
    this.vignette.classList.add('hit');
    // Removing the class on the next frame lets the fade-out transition run.
    requestAnimationFrame(() => requestAnimationFrame(() => this.vignette.classList.remove('hit')));
  }

  // Start-screen controls.
  setVoiceChoice(label, note) {
    document.getElementById('voice-button').textContent = label;
    document.getElementById('voice-note').textContent = note;
  }

  // name: the voice in use, or null to hide the row (nothing to choose between).
  setVoicePick(name, position, count) {
    document.getElementById('voice-pick').hidden = name === null;
    document.getElementById('voice-name-button').textContent = name || '';
    document.getElementById('voice-count').textContent = name ? `(${position} of ${count})` : '';
  }

  setGraphicsChoice(label) {
    document.getElementById('graphics-button').textContent = label;
  }

  // Start screen: the story of the level about to be played, and (once more than one
  // level is unlocked) which level that is.
  setLevel(level, choices) {
    document.getElementById('story').textContent = level.text.story;
    document.getElementById('level-row').hidden = choices < 2;
    document.getElementById('level-button').textContent = level.name;
  }

  setBest(best) {
    document.getElementById('best-line').textContent = best > 0 ? `Best score: ${points(best)}` : '';
  }

  showResults(data) {
    const $ = (id) => document.getElementById(id);
    $('results-title').textContent = data.won ? data.wonTitle : 'You went down';
    $('results-sub').textContent = data.won
      ? data.wonText
      : `${data.rescued} of ${data.total} rescued. The ones that got past you will be back, and so will you.`;
    const next = $('next-button');
    next.hidden = !(data.won && data.nextText);
    next.textContent = data.nextText || '';
    $('again-button').classList.toggle('primary', next.hidden);
    $('again-button').classList.toggle('link', !next.hidden);

    const stars = $('results-stars');
    stars.replaceChildren();
    stars.hidden = !data.won;
    for (let i = 0; i < 3; i++) stars.append(el('span', i < data.stars ? '' : 'off', '★'));

    const stats = $('results-stats');
    stats.replaceChildren();
    const stat = (value, label) => {
      const box = el('div', 'stat');
      box.append(el('b', '', value), el('span', '', label));
      stats.append(box);
    };
    stat(points(data.score), data.newBest ? 'score · new best!' : `score · best ${points(data.best)}`);
    stat(data.rounds ? `${Math.round(data.accuracy * 100)}%` : '–', 'right on first shot');
    stat(data.avgSeconds === null ? '–' : `${data.avgSeconds.toFixed(1)} s`, 'average time');
    stat(`${data.bestStreak}`, 'best streak');

    const missed = $('results-missed');
    missed.replaceChildren();
    if (data.missed.length) {
      missed.append(el('h3', '', 'Worth remembering'));
      const list = el('div', 'missed');
      for (const fact of data.missed) list.append(el('span', '', fact));
      missed.append(list);
    }

    $('results-grid').replaceChildren(...this.buildGrid(data.facts));
    this.bannerBox.classList.remove('show');
    this.toastBox.classList.remove('show');
    this.results.hidden = false;
  }

  // Times-table map: one cell per fact, coloured by how solid it is.
  buildGrid(facts) {
    const byKey = new Map(facts.map((f) => [f.key, f]));
    const table = el('table', 'grid');
    const head = el('tr');
    head.append(el('th', '', '×'));
    for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) head.append(el('th', '', b));
    table.append(head);
    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
      const row = el('tr');
      row.append(el('th', '', a));
      for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) {
        const fact = byKey.get(factKey(a, b));
        const cell = el('td', fact.seen ? `b${fact.box}` : 'unseen', a * b);
        cell.title = fact.seen
          ? `${a} × ${b}: right ${fact.right} of ${fact.seen} times`
          : `${a} × ${b}: not asked yet`;
        row.append(cell);
      }
      table.append(row);
    }
    const wrap = el('div', 'grid-wrap');
    wrap.append(table);
    return [
      el('h3', '', 'Times-table map'),
      wrap,
      el('p', 'legend', 'Green is solid, yellow is getting there, red needs practice, grey has not come up yet.'),
    ];
  }
}
