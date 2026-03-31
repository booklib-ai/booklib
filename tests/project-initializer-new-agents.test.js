import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectInitializer } from '../lib/project-initializer.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-init-test-'));
}

const NEW_AGENTS = [
  { target: 'roo-code',   file: '.roo/rules/booklib-standards.md' },
  { target: 'openhands',  file: '.openhands/instructions.md' },
  { target: 'junie',      file: '.junie/guidelines.md' },
  { target: 'goose',      file: '.goose/context.md' },
  { target: 'opencode',   file: '.opencode/instructions.md' },
  { target: 'letta',      file: '.letta/skills/booklib.md' },
];

for (const { target, file } of NEW_AGENTS) {
  test(`${target}: writes to ${file}`, async () => {
    const cwd = tmpDir();
    const init = new ProjectInitializer({ projectCwd: cwd });
    await init.init({ skills: ['effective-kotlin'], target });
    assert.ok(existsSync(path.join(cwd, file)), `Missing ${file}`);
    rmSync(cwd, { recursive: true });
  });

  test(`${target}: written file contains booklib marker`, async () => {
    const cwd = tmpDir();
    const init = new ProjectInitializer({ projectCwd: cwd });
    await init.init({ skills: ['effective-kotlin'], target });
    const content = readFileSync(path.join(cwd, file), 'utf8');
    assert.ok(content.includes('booklib-standards-start'), `Missing marker in ${file}`);
    rmSync(cwd, { recursive: true });
  });
}

test('ALL_TARGETS includes all new agents', async () => {
  const cwd = tmpDir();
  const init = new ProjectInitializer({ projectCwd: cwd });
  const written = await init.init({ skills: ['effective-kotlin'], target: 'all' });
  for (const { file } of NEW_AGENTS) {
    assert.ok(written.includes(file), `all target missed ${file}`);
  }
  rmSync(cwd, { recursive: true });
});
