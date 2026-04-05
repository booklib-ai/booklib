import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalConnector } from '../../lib/connectors/local.js';

describe('LocalConnector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-local-'));
    // Create test file structure
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hello');
    fs.writeFileSync(path.join(tmpDir, 'guide.mdx'), '# Guide');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'notes');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'script.js'), 'console.log()');

    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'deep.md'), '# Deep');

    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'index.md'), '# pkg');

    fs.mkdirSync(path.join(tmpDir, '.git', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.git', 'config.md'), '# git');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('listFiles', () => {
    it('returns only matching extensions (.md, .mdx, .txt)', () => {
      const lc = new LocalConnector();
      const files = lc.listFiles(tmpDir);
      const basenames = files.map(f => path.basename(f));

      assert.ok(basenames.includes('readme.md'));
      assert.ok(basenames.includes('guide.mdx'));
      assert.ok(basenames.includes('notes.txt'));
      assert.ok(basenames.includes('deep.md'));
      assert.ok(!basenames.includes('data.json'), 'should not include .json');
      assert.ok(!basenames.includes('script.js'), 'should not include .js');
    });

    it('excludes node_modules and .git directories', () => {
      const lc = new LocalConnector();
      const files = lc.listFiles(tmpDir);
      const hasNodeModules = files.some(f => f.includes('node_modules'));
      const hasGit = files.some(f => f.includes('.git'));

      assert.ok(!hasNodeModules, 'should exclude node_modules');
      assert.ok(!hasGit, 'should exclude .git');
    });

    it('with custom include filter returns only those extensions', () => {
      const lc = new LocalConnector({ include: ['*.rst'] });
      fs.writeFileSync(path.join(tmpDir, 'doc.rst'), 'reStructuredText');
      const files = lc.listFiles(tmpDir);
      const basenames = files.map(f => path.basename(f));

      assert.ok(basenames.includes('doc.rst'));
      assert.ok(!basenames.includes('readme.md'), 'should not include .md with *.rst filter');
      assert.ok(!basenames.includes('notes.txt'), 'should not include .txt with *.rst filter');
    });

    it('returns absolute paths sorted', () => {
      const lc = new LocalConnector();
      const files = lc.listFiles(tmpDir);

      for (const f of files) {
        assert.ok(path.isAbsolute(f), `expected absolute path: ${f}`);
      }
      const sorted = [...files].sort();
      assert.deepEqual(files, sorted, 'files should be sorted');
    });
  });

  describe('getFileMtimes', () => {
    it('returns relative paths with mtime numbers', () => {
      const lc = new LocalConnector();
      const mtimes = lc.getFileMtimes(tmpDir);

      assert.ok('readme.md' in mtimes, 'should have readme.md as relative key');
      assert.ok(typeof mtimes['readme.md'] === 'number', 'mtime should be a number');
      assert.ok(path.join('sub', 'deep.md') in mtimes, 'should include nested files');
      assert.ok(!('node_modules/pkg/index.md' in mtimes), 'should not include excluded dirs');
    });
  });

  describe('findChanges', () => {
    it('detects new files not in previousMtimes', () => {
      const lc = new LocalConnector();
      const { changed, removed } = lc.findChanges(tmpDir, {});
      const basenames = changed.map(f => path.basename(f));

      assert.ok(basenames.includes('readme.md'), 'new file should appear in changed');
      assert.ok(basenames.includes('deep.md'), 'new nested file should appear');
      assert.equal(removed.length, 0, 'no files removed');
    });

    it('detects modified files with newer mtime', () => {
      const lc = new LocalConnector();
      const oldMtimes = lc.getFileMtimes(tmpDir);

      // Simulate an older mtime for readme.md
      const stale = { ...oldMtimes };
      stale['readme.md'] = oldMtimes['readme.md'] - 10000;

      const { changed } = lc.findChanges(tmpDir, stale);
      const basenames = changed.map(f => path.basename(f));

      assert.ok(basenames.includes('readme.md'), 'modified file should appear in changed');
    });

    it('detects removed files present in previousMtimes but not on disk', () => {
      const lc = new LocalConnector();
      const fakePrevious = { 'deleted.md': Date.now() - 50000 };

      const { removed } = lc.findChanges(tmpDir, fakePrevious);
      assert.ok(removed.includes('deleted.md'), 'removed file should be listed');
    });

    it('returns empty when nothing changed', () => {
      const lc = new LocalConnector();
      const mtimes = lc.getFileMtimes(tmpDir);

      const { changed, removed } = lc.findChanges(tmpDir, mtimes);
      assert.equal(changed.length, 0, 'no changed files expected');
      assert.equal(removed.length, 0, 'no removed files expected');
    });
  });

  describe('_matchesFilters', () => {
    it('accepts files matching include extensions', () => {
      const lc = new LocalConnector();
      assert.ok(lc._matchesFilters('readme.md'));
      assert.ok(lc._matchesFilters('guide.mdx'));
      assert.ok(lc._matchesFilters('notes.txt'));
      assert.ok(lc._matchesFilters('doc.rst'));
      assert.ok(lc._matchesFilters('page.adoc'));
    });

    it('rejects files not matching include extensions', () => {
      const lc = new LocalConnector();
      assert.ok(!lc._matchesFilters('script.js'));
      assert.ok(!lc._matchesFilters('style.css'));
      assert.ok(!lc._matchesFilters('data.json'));
    });

    it('rejects files matching exclude patterns', () => {
      const lc = new LocalConnector();
      assert.ok(!lc._matchesFilters('node_modules/pkg/readme.md'));
      assert.ok(!lc._matchesFilters('.git/config.md'));
      assert.ok(!lc._matchesFilters('.booklib/sources.md'));
    });
  });
});
