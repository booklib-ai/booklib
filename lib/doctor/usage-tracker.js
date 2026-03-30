// lib/doctor/usage-tracker.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_USAGE_PATH = path.join(os.homedir(), '.booklib', 'usage.json');

/**
 * Appends a single usage entry to the usage log.
 * Creates the file (and parent dirs) if absent.
 */
export function appendUsage(skillName, usagePath = DEFAULT_USAGE_PATH) {
  fs.mkdirSync(path.dirname(usagePath), { recursive: true });
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  entries.push({ skill: skillName, timestamp: new Date().toISOString() });
  fs.writeFileSync(usagePath, JSON.stringify(entries, null, 2));
}

/**
 * Reads and parses the usage log. Returns [] if file does not exist.
 */
export function readUsage(usagePath = DEFAULT_USAGE_PATH) {
  if (!fs.existsSync(usagePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(usagePath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Derives per-skill health summaries from raw usage data.
 *
 * @param {{ skill: string, timestamp: string }[]} usageData
 * @param {string[]} installedNames
 * @param {Object.<string, Date>} [installDates]
 */
export function summarize(usageData, installedNames, installDates = {}) {
  const NOW    = Date.now();
  const MS_1D  = 24 * 60 * 60 * 1000;
  const MS_60D = 60 * MS_1D;
  const MS_30D = 30 * MS_1D;

  const countMap   = new Map();
  const lastMap    = new Map();
  const recent60Map = new Map();
  const cutoff60   = new Date(NOW - MS_60D);

  for (const { skill, timestamp } of usageData) {
    countMap.set(skill, (countMap.get(skill) ?? 0) + 1);
    const ts = new Date(timestamp);
    if (!lastMap.has(skill) || ts > lastMap.get(skill)) lastMap.set(skill, ts);
    if (ts >= cutoff60) recent60Map.set(skill, (recent60Map.get(skill) ?? 0) + 1);
  }

  const results = installedNames.map(name => {
    const uses       = countMap.get(name) ?? 0;
    const lastUsed   = lastMap.get(name) ?? null;
    const daysSince  = lastUsed ? Math.floor((NOW - lastUsed.getTime()) / MS_1D) : null;
    const recent60   = recent60Map.get(name) ?? 0;
    const installDate = installDates[name] ?? null;

    const isEstablished = uses > 0 || (installDate && (NOW - installDate.getTime()) > 14 * MS_1D);

    let suggestion = null;
    if (uses === 0 && installDate && (NOW - installDate.getTime()) > MS_30D) {
      suggestion = 'remove';
    } else if (isEstablished && recent60 < 2) {
      suggestion = 'low-activity';
    }

    return { name, uses, lastUsed, daysSinceLastUse: daysSince, suggestion };
  });

  results.sort((a, b) => {
    if (a.suggestion === null && b.suggestion !== null) return -1;
    if (a.suggestion !== null && b.suggestion === null) return 1;
    return b.uses - a.uses;
  });

  return results;
}
