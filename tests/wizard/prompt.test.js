// tests/wizard/prompt.test.js
import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sep, formatProgress, LEGENDS, ensureBooklibGitignore } from '../../lib/wizard/prompt.js';

test('sep returns correct length string', () => {
  assert.equal(sep('─', 10).length, 10);
  assert.equal(sep('─', 10), '──────────');
});

test('formatProgress renders bar', () => {
  const s = formatProgress(15, 30, 20);
  assert.ok(s.includes('15/30'));
  assert.ok(s.includes('█'));
  assert.ok(s.includes('░'));
});

describe('Navigation legend shows colored key hints for each prompt type', () => {
  it('select legend shows navigate and select keys', () => {
    const legend = LEGENDS.select();
    assert.ok(legend.includes('↑↓'), 'should show arrow keys');
    assert.ok(legend.includes('navigate'), 'should label navigation');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('select'), 'should label selection');
  });

  it('multiselect legend shows navigate, toggle, all, and submit keys', () => {
    const legend = LEGENDS.multiselect();
    assert.ok(legend.includes('↑↓'), 'should show arrow keys');
    assert.ok(legend.includes('space'), 'should show space key');
    assert.ok(legend.includes('toggle'), 'should label toggling');
    assert.ok(legend.includes('a'), 'should show "a" for all');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('submit'), 'should label submission');
  });

  it('confirm legend shows switch and confirm keys', () => {
    const legend = LEGENDS.confirm();
    assert.ok(legend.includes('←→'), 'should show left/right arrows');
    assert.ok(legend.includes('switch'), 'should label switching');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('confirm'), 'should label confirmation');
  });

  it('all legends are single-line for clean rendering', () => {
    for (const [name, fn] of Object.entries(LEGENDS)) {
      const legend = fn();
      const lines = legend.split('\n').filter(l => l.trim());
      assert.equal(lines.length, 1, `${name} legend should be a single line`);
    }
  });
});

describe('ensureBooklibGitignore adds derived file entries', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-gitignore-'));
    // Create .git dir so the function knows it's a git repo
    fs.mkdirSync(path.join(tmpDir, '.git'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create .gitignore with BookLib entries in a git repo', () => {
    const added = ensureBooklibGitignore(tmpDir);
    assert.equal(added.length, 5, 'should add all 5 entries');

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('.booklib/index/'));
    assert.ok(content.includes('.booklib/bm25.json'));
    assert.ok(content.includes('.booklib/sources/'));
    assert.ok(content.includes('.booklib/context-map.json'));
    assert.ok(content.includes('.booklib/version-cache.json'));
    assert.ok(content.includes('# BookLib'), 'should have a section comment');
  });

  it('should append to existing .gitignore without duplicating', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n.env\n');

    const added = ensureBooklibGitignore(tmpDir);
    assert.equal(added.length, 5);

    // Call again — should add nothing
    const addedAgain = ensureBooklibGitignore(tmpDir);
    assert.equal(addedAgain.length, 0, 'should not duplicate entries');

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(content.startsWith('node_modules/'), 'should preserve existing content');
    // Count occurrences — each entry should appear exactly once
    const matches = content.match(/\.booklib\/index\//g);
    assert.equal(matches.length, 1, 'entry should appear exactly once');
  });

  it('should skip entries already present in .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.booklib/index/\n.booklib/bm25.json\n');

    const added = ensureBooklibGitignore(tmpDir);
    assert.equal(added.length, 3, 'should only add the 3 missing entries');
    assert.ok(!added.includes('.booklib/index/'), 'should not re-add existing');
    assert.ok(!added.includes('.booklib/bm25.json'), 'should not re-add existing');
  });

  it('should do nothing when there is no .git dir and no .gitignore', () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-nogit-'));
    const added = ensureBooklibGitignore(noGitDir);
    assert.equal(added.length, 0, 'should not create .gitignore in non-git project');
    assert.ok(!fs.existsSync(path.join(noGitDir, '.gitignore')));
    fs.rmSync(noGitDir, { recursive: true, force: true });
  });

  it('should work when .gitignore exists but .git does not', () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-nogit2-'));
    fs.writeFileSync(path.join(noGitDir, '.gitignore'), '');

    const added = ensureBooklibGitignore(noGitDir);
    assert.equal(added.length, 5, 'should add entries if .gitignore exists even without .git');
    fs.rmSync(noGitDir, { recursive: true, force: true });
  });
});
