// lib/wizard/integration-detector.js
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Detects installed integrations and tools.
 *
 * @param {{ cwd?: string, home?: string }} opts - override for testing
 * @returns {{ superpowers: boolean, ruflo: boolean, claudeCode: boolean }}
 */
export function detectIntegrations({ cwd = process.cwd(), home = os.homedir() } = {}) {
  return {
    superpowers: _detectSuperpowers(home),
    ruflo: _detectRuflo(cwd, home),
    claudeCode: _detectClaudeCode(home),
  };
}

function _detectSuperpowers(home) {
  const pluginsDir = path.join(home, '.claude', 'plugins');
  if (!fs.existsSync(pluginsDir)) return false;
  try {
    return fs.readdirSync(pluginsDir).some(d => d.toLowerCase().includes('superpowers'));
  } catch { return false; }
}

function _detectRuflo(cwd, home) {
  const candidates = [
    path.join(cwd,  'ruflo.config.js'),
    path.join(cwd,  'ruflo.config.ts'),
    path.join(cwd,  'ruflo.config.json'),
    path.join(cwd,  '.ruflo'),
    path.join(home, '.ruflo'),
  ];
  return candidates.some(p => fs.existsSync(p));
}

function _detectClaudeCode(home) {
  return fs.existsSync(path.join(home, '.claude'));
}
