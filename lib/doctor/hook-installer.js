// lib/doctor/hook-installer.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TRACK_USAGE_CONTENT = `#!/usr/bin/env node
// track-usage.mjs — installed by: booklib doctor --install-hook
// Appends { skill, timestamp } to ~/.booklib/usage.json on every Skill tool invocation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const raw = process.argv[2] ?? '{}';
let input;
try { input = JSON.parse(raw); } catch { process.exit(0); }

const skill = input?.skill ?? input?.name ?? input?.args?.skill;
if (!skill || typeof skill !== 'string') process.exit(0);

const dir  = path.join(os.homedir(), '.booklib');
const file = path.join(dir, 'usage.json');

try {
  fs.mkdirSync(dir, { recursive: true });
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first write */ }
  entries.push({ skill: skill.trim(), timestamp: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2));
} catch {
  process.exit(0);
}
`;

const HOOK_COMMAND = `node ~/.booklib/track-usage.mjs "$TOOL_INPUT"`;

/**
 * Installs the usage-tracking hook into Claude Code settings.
 *
 * @param {string} [home]
 * @returns {{ scriptPath: string, settingsPath: string, alreadyInstalled: boolean }}
 */
export function installTrackingHook(home = os.homedir()) {
  const booklibDir   = path.join(home, '.booklib');
  const claudeDir    = path.join(home, '.claude');
  const scriptPath   = path.join(booklibDir, 'track-usage.mjs');
  const settingsPath = path.join(claudeDir, 'settings.json');

  fs.mkdirSync(booklibDir, { recursive: true });
  fs.writeFileSync(scriptPath, TRACK_USAGE_CONTENT);

  fs.mkdirSync(claudeDir, { recursive: true });
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { /* new file */ }

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  const newEntry = {
    matcher: 'Skill',
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  };

  const existingIdx = settings.hooks.PreToolUse.findIndex(e => e.matcher === 'Skill');
  const alreadyInstalled = existingIdx !== -1 &&
    settings.hooks.PreToolUse[existingIdx]?.hooks?.[0]?.command === HOOK_COMMAND;

  if (existingIdx !== -1) {
    settings.hooks.PreToolUse[existingIdx] = newEntry;
  } else {
    settings.hooks.PreToolUse.push(newEntry);
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { scriptPath, settingsPath, alreadyInstalled };
}
