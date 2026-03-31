// lib/engine/corrections.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from '@huggingface/transformers';

// ── Constants ────────────────────────────────────────────────────────────────

export const LEVEL_THRESHOLDS = [
  { level: 4, min: 10 },
  { level: 3, min: 5 },
  { level: 2, min: 3 },
  { level: 1, min: 1 },
];

const DEDUP_THRESHOLD = 0.85;
const MAX_INJECTED    = 20;

export const MARKER_START = '<!-- booklib-learned-start -->';
export const MARKER_END   = '<!-- booklib-learned-end -->';

// ── Embedding model (lazy-loaded, module-level singleton) ────────────────────

let _extractor = null;

async function _getEmbedding(text) {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await _extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// ── Pure functions ────────────────────────────────────────────────────────────

export function levelFromMentions(n) {
  for (const { level, min } of LEVEL_THRESHOLDS) {
    if (n >= min) return level;
  }
  return 1;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function _generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function _escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── File paths ────────────────────────────────────────────────────────────────

function _correctionsPath(home) {
  return path.join(home, '.booklib', 'corrections.jsonl');
}

function _claudeMdPath(home) {
  return path.join(home, '.claude', 'CLAUDE.md');
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadCorrections(home = os.homedir()) {
  const p = _correctionsPath(home);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .reduce((acc, line) => {
      try {
        acc.push(JSON.parse(line));
      } catch {
        process.stderr.write(`Warning: skipping corrupt line in corrections.jsonl: ${line.slice(0, 40)}\n`);
      }
      return acc;
    }, []);
}

function _saveCorrections(corrections, home) {
  const p = _correctionsPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = corrections.map(c => JSON.stringify(c)).join('\n');
  fs.writeFileSync(p, corrections.length ? lines + '\n' : '');
}

// ── CLAUDE.md injection ────────────────────────────────────────────────────────

export function rebuildLearnedSection(home = os.homedir()) {
  const corrections = loadCorrections(home);
  const active = corrections
    .filter(c => c.level >= 3)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, MAX_INJECTED);

  const claudeFile = _claudeMdPath(home);
  fs.mkdirSync(path.dirname(claudeFile), { recursive: true });

  let existing = '';
  try { existing = fs.readFileSync(claudeFile, 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  if (active.length === 0) {
    const re = new RegExp(
      `\\n?${_escapeRegex(MARKER_START)}[\\s\\S]*?${_escapeRegex(MARKER_END)}\\n?`
    );
    const updated = existing.replace(re, '').trimEnd();
    fs.writeFileSync(claudeFile, updated ? updated + '\n' : '');
    return;
  }

  const bullets = active.map(c => `- ${c.text.slice(0, 120)}`).join('\n');
  const section = [
    MARKER_START,
    '## Learned Corrections (BookLib)',
    '',
    '> When the user corrects your approach, run: booklib correction add "brief rule"',
    '',
    bullets,
    '',
    MARKER_END,
  ].join('\n');

  const re = new RegExp(
    `${_escapeRegex(MARKER_START)}[\\s\\S]*?${_escapeRegex(MARKER_END)}`
  );
  const updated = existing.includes(MARKER_START)
    ? existing.replace(re, section)
    : (existing.trimEnd() ? `${existing.trimEnd()}\n\n${section}\n` : `${section}\n`);

  fs.writeFileSync(claudeFile, updated);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listCorrections(home = os.homedir()) {
  return loadCorrections(home).sort((a, b) => b.mentions - a.mentions);
}

export function removeCorrection(id, home = os.homedir()) {
  const corrections = loadCorrections(home);
  const idx = corrections.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const [removed] = corrections.splice(idx, 1);
  _saveCorrections(corrections, home);
  rebuildLearnedSection(home);
  return removed;
}

export async function addCorrection(text, home = os.homedir(), embedFn = _getEmbedding) {
  const corrections = loadCorrections(home);
  const now = new Date().toISOString();
  const newVec = await embedFn(text);

  for (const c of corrections) {
    const existVec = c.embedding ?? await embedFn(c.text);
    if (!c.embedding) c.embedding = existVec; // backfill on first encounter
    const sim = cosine(newVec, existVec);
    if (sim >= DEDUP_THRESHOLD) {
      const oldLevel = c.level;
      c.mentions += 1;
      c.level = levelFromMentions(c.mentions);
      c.lastSeen = now;
      c.sessions.push(now);
      _saveCorrections(corrections, home);
      if (c.level >= 3 && c.level !== oldLevel) rebuildLearnedSection(home);
      const { embedding: _emb, ...rest } = c;
      return { ...rest, wasExisting: true };
    }
  }

  const entry = {
    id: _generateId(),
    text,
    mentions: 1,
    level: levelFromMentions(1),
    sessions: [now],
    firstSeen: now,
    lastSeen: now,
    embedding: newVec,
  };
  corrections.push(entry);
  _saveCorrections(corrections, home);
  const { embedding: _emb, ...rest } = entry;
  return { ...rest, wasExisting: false };
}
