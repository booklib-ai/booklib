// lib/wizard/registry-embeddings.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { BookLibSearcher } from '../engine/searcher.js';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const CACHE_PATH   = path.join(os.homedir(), '.booklib', 'registry-embeddings.json');

/**
 * Extracts description from SKILL.md frontmatter.
 * Exported for testing.
 */
export function extractDescription(content) {
  const match = content.match(/^---[\s\S]*?^description:\s*(.+)/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Returns unified skill catalog: bundled skills + community registry.
 * Each entry: { name, description, source: 'bundled'|'registry', entry? }
 */
export function loadSkillCatalog() {
  const skills = [];
  const seen = new Set();

  // 1. Bundled skills from package's skills/ directory
  const skillsDir = path.join(PACKAGE_ROOT, 'skills');
  try {
    for (const name of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, 'utf8');
      const description = extractDescription(content);
      if (description && !seen.has(name)) {
        skills.push({ name, description, source: 'bundled' });
        seen.add(name);
      }
    }
  } catch { /* skip if skills dir missing */ }

  // 2. Community registry
  const registryPath = path.join(PACKAGE_ROOT, 'community', 'registry.json');
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const entries = Array.isArray(raw) ? raw : raw.skills ?? [];
    for (const entry of entries) {
      if (entry.name && entry.description && !seen.has(entry.name)) {
        skills.push({ name: entry.name, description: entry.description, source: 'registry', entry });
        seen.add(entry.name);
      }
    }
  } catch { /* skip */ }

  return skills;
}

/**
 * Loads (or computes) embeddings for every skill in the catalog.
 * Caches result to ~/.booklib/registry-embeddings.json.
 *
 * @param {Function} [onProgress] - (done: number, total: number) => void
 * @returns {Promise<Map<string, number[]>>}
 */
export async function getEmbeddings(onProgress) {
  const catalog = loadSkillCatalog();
  const cached  = _loadCache();
  const result  = new Map(Object.entries(cached));
  const missing = catalog.filter(s => !result.has(s.name));

  if (missing.length > 0) {
    const searcher = new BookLibSearcher();
    for (let i = 0; i < missing.length; i++) {
      result.set(missing[i].name, await searcher.getEmbedding(missing[i].description));
      onProgress?.(i + 1, missing.length);
    }
    _saveCache(Object.fromEntries(result));
  }

  return result;
}

function _loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}

function _saveCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
  } catch { /* best-effort */ }
}
