import { STORAGE_KEY } from './config.js';

// Progress and settings live in the browser's localStorage. It can be unavailable
// (private windows, blocked site data), in which case the game still works but
// forgets between visits.

const SETTINGS_KEY = `${STORAGE_KEY}.settings`;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Nothing useful to do: the game carries on without saving.
  }
}

// What the fact trainer has learned about him.
export function loadProgress() {
  return read(STORAGE_KEY);
}

export function saveProgress(data) {
  write(STORAGE_KEY, data);
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
}

// Voice language and best score.
export function loadSettings() {
  const saved = read(SETTINGS_KEY);
  return saved && typeof saved === 'object' ? saved : {};
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}
