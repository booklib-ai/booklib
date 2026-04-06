import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GapResolver } from '../../lib/engine/gap-resolver.js';

/**
 * Subclass that stubs _tryContext7 and _tryGitHub to avoid real API calls.
 * Inject results via constructor options.
 */
class TestGapResolver extends GapResolver {
  constructor(opts = {}) {
    super(opts);
    this._ctx7Result = opts.ctx7Result ?? { resolved: false, source: 'context7' };
    this._ghResult = opts.ghResult ?? { resolved: false, source: 'github' };
  }
  async _tryContext7() { return this._ctx7Result; }
  async _tryGitHub() { return this._ghResult; }
}

const makeDep = (name, version = '1.0.0', ecosystem = 'npm') => ({
  name, version, ecosystem,
});

describe('GapResolver', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-resolver-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolve', () => {
    it('returns resolved:true when Context7 has the library', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: {
          resolved: true,
          source: 'context7',
          pageCount: 5,
          sourceName: 'ctx7-next',
          outputDir: '/tmp/ctx7-next',
        },
      });

      const result = await resolver.resolve(makeDep('next', '15.0.0'));
      assert.equal(result.resolved, true);
      assert.equal(result.source, 'context7');
      assert.equal(result.pageCount, 5);
    });

    it('falls through to GitHub when Context7 fails', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: { resolved: false, source: 'context7' },
        ghResult: {
          resolved: true,
          source: 'github',
          pageCount: 3,
          sourceName: 'gh-next-releases',
          outputDir: '/tmp/gh-next',
        },
      });

      const result = await resolver.resolve(makeDep('next', '15.0.0'));
      assert.equal(result.resolved, true);
      assert.equal(result.source, 'github');
      assert.equal(result.pageCount, 3);
    });

    it('returns manual suggestion when all sources fail', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
      });

      const result = await resolver.resolve(makeDep('some-lib', '2.0.0'));
      assert.equal(result.resolved, false);
      assert.equal(result.source, 'manual');
      assert.equal(result.pageCount, 0);
      assert.ok(result.suggestion.includes('npmjs.com'));
    });

    it('includes sourceName and outputDir on success', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: {
          resolved: true,
          source: 'context7',
          pageCount: 2,
          sourceName: 'ctx7-react',
          outputDir: '/tmp/ctx7-react',
        },
      });

      const result = await resolver.resolve(makeDep('react', '19.0.0'));
      assert.ok(result.sourceName);
      assert.ok(result.outputDir);
      assert.equal(result.sourceName, 'ctx7-react');
    });

    it('stops at first successful source (does not try GitHub after Context7 succeeds)', async () => {
      let ghCalled = false;
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: { resolved: true, source: 'context7', pageCount: 1, sourceName: 'ctx7-x', outputDir: '/tmp/x' },
      });
      // Override _tryGitHub to track whether it gets called
      resolver._tryGitHub = async () => {
        ghCalled = true;
        return { resolved: false, source: 'github' };
      };

      await resolver.resolve(makeDep('x'));
      assert.equal(ghCalled, false);
    });
  });

  describe('resolveAll', () => {
    it('resolves multiple deps in sequence', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: { resolved: true, source: 'context7', pageCount: 1, sourceName: 'ctx7-a', outputDir: '/tmp/a' },
      });

      const deps = [makeDep('a'), makeDep('b'), makeDep('c')];
      const results = await resolver.resolveAll(deps);

      assert.equal(results.length, 3);
      for (const r of results) {
        assert.equal(r.result.resolved, true);
      }
    });

    it('calls onProgress for each dep', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
        ctx7Result: { resolved: true, source: 'context7', pageCount: 1, sourceName: 'ctx7-x', outputDir: '/tmp/x' },
      });

      const progress = [];
      const deps = [makeDep('a'), makeDep('b')];
      await resolver.resolveAll(deps, (info) => {
        progress.push(info);
      });

      assert.equal(progress.length, 2);
      assert.equal(progress[0].index, 0);
      assert.equal(progress[0].total, 2);
      assert.equal(progress[0].dep.name, 'a');
      assert.equal(progress[1].index, 1);
      assert.equal(progress[1].dep.name, 'b');
    });

    it('handles mixed results (some resolved, some not)', async () => {
      let callCount = 0;
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
      });
      // Alternate between success and failure
      resolver._tryContext7 = async () => {
        callCount++;
        if (callCount % 2 === 1) {
          return { resolved: true, source: 'context7', pageCount: 1, sourceName: `ctx7-${callCount}`, outputDir: `/tmp/${callCount}` };
        }
        return { resolved: false, source: 'context7' };
      };

      const deps = [makeDep('a'), makeDep('b'), makeDep('c')];
      const results = await resolver.resolveAll(deps);

      const resolved = results.filter(r => r.result.resolved);
      const unresolved = results.filter(r => !r.result.resolved);
      assert.equal(resolved.length, 2); // a, c succeed
      assert.equal(unresolved.length, 1); // b fails
    });

    it('works with empty deps array', async () => {
      const resolver = new TestGapResolver({
        outputBase: path.join(tmpDir, 'sources'),
      });

      const results = await resolver.resolveAll([]);
      assert.equal(results.length, 0);
    });
  });

  describe('_suggestManual', () => {
    const resolver = new GapResolver({ outputBase: '/tmp/test' });

    it('returns npm URL for npm deps', () => {
      const result = resolver._suggestManual(makeDep('express', '5.0.0', 'npm'));
      assert.ok(result.suggestion.includes('npmjs.com/package/express'));
      assert.equal(result.resolved, false);
      assert.equal(result.source, 'manual');
    });

    it('returns pypi URL for pypi deps', () => {
      const result = resolver._suggestManual(makeDep('flask', '3.0.0', 'pypi'));
      assert.ok(result.suggestion.includes('pypi.org/project/flask'));
    });

    it('returns crates URL for crates deps', () => {
      const result = resolver._suggestManual(makeDep('serde', '1.0.0', 'crates'));
      assert.ok(result.suggestion.includes('docs.rs/serde'));
    });

    it('returns go URL for go deps', () => {
      const result = resolver._suggestManual(makeDep('github.com/gin-gonic/gin', '1.9.0', 'go'));
      assert.ok(result.suggestion.includes('pkg.go.dev'));
    });

    it('returns rubygems URL for rubygems deps', () => {
      const result = resolver._suggestManual(makeDep('rails', '7.1.0', 'rubygems'));
      assert.ok(result.suggestion.includes('rubygems.org/gems/rails'));
    });

    it('returns maven URL for maven deps', () => {
      const result = resolver._suggestManual(makeDep('org.springframework:spring-core', '6.0.0', 'maven'));
      assert.ok(result.suggestion.includes('search.maven.org'));
    });

    it('returns generic suggestion for unknown ecosystems', () => {
      const result = resolver._suggestManual(makeDep('some-dep', '1.0.0', 'unknown-ecosystem'));
      assert.ok(result.suggestion.includes('<docs-url>'));
      assert.equal(result.resolved, false);
    });
  });
});
