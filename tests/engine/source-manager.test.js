import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceManager } from '../../lib/engine/source-manager.js';

describe('SourceManager', () => {
  let tmpDir;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-sources-'));
    manager = new SourceManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('registerSource', () => {
    it('saves source to sources.json with name, path, type, timestamp', () => {
      const result = manager.registerSource({
        name: 'my-docs',
        sourcePath: '/tmp/docs',
        type: 'local',
      });

      assert.equal(result.name, 'my-docs');
      assert.equal(result.sourcePath, '/tmp/docs');
      assert.equal(result.type, 'local');
      assert.ok(result.created_at, 'should have a created_at timestamp');

      const registry = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'sources.json'), 'utf8')
      );
      assert.equal(registry.sources.length, 1);
      assert.equal(registry.sources[0].name, 'my-docs');
    });
  });

  describe('listSources', () => {
    it('returns all registered sources', () => {
      manager.registerSource({ name: 'docs-a', sourcePath: '/tmp/a', type: 'local' });
      manager.registerSource({ name: 'docs-b', sourcePath: '/tmp/b', type: 'local' });

      const sources = manager.listSources();
      assert.equal(sources.length, 2);
      assert.equal(sources[0].name, 'docs-a');
      assert.equal(sources[1].name, 'docs-b');
    });
  });

  describe('removeSource', () => {
    it('removes source from sources.json', () => {
      manager.registerSource({ name: 'to-remove', sourcePath: '/tmp/rm', type: 'local' });
      assert.equal(manager.listSources().length, 1);

      manager.removeSource('to-remove');
      assert.equal(manager.listSources().length, 0);
    });

    it('throws when source does not exist', () => {
      assert.throws(
        () => manager.removeSource('nonexistent'),
        { message: /not found.*nonexistent/i }
      );
    });
  });

  describe('getSource', () => {
    it('returns a single source by name', () => {
      manager.registerSource({ name: 'my-src', sourcePath: '/tmp/src', type: 'local' });

      const source = manager.getSource('my-src');
      assert.equal(source.name, 'my-src');
      assert.equal(source.sourcePath, '/tmp/src');
    });

    it('returns null for unknown source', () => {
      const source = manager.getSource('unknown');
      assert.equal(source, null);
    });
  });

  describe('auto-generated name', () => {
    it('derives name from path basename if not provided', () => {
      const result = manager.registerSource({
        sourcePath: '/foo/bar/docs',
        type: 'local',
      });

      assert.equal(result.name, 'docs');
    });
  });

  describe('duplicate name', () => {
    it('throws error when registering duplicate name', () => {
      manager.registerSource({ name: 'dup', sourcePath: '/tmp/a', type: 'local' });

      assert.throws(
        () => manager.registerSource({ name: 'dup', sourcePath: '/tmp/b', type: 'local' }),
        { message: /already exists.*dup/i }
      );
    });
  });

  describe('sources.json lifecycle', () => {
    it('creates sources.json if it does not exist', () => {
      const registryPath = path.join(tmpDir, 'sources.json');
      assert.ok(!fs.existsSync(registryPath), 'should not exist before first use');

      manager.registerSource({ name: 'first', sourcePath: '/tmp/first', type: 'local' });
      assert.ok(fs.existsSync(registryPath), 'should exist after registration');
    });

    it('persists across instances', () => {
      manager.registerSource({ name: 'persist', sourcePath: '/tmp/persist', type: 'local' });

      const manager2 = new SourceManager(tmpDir);
      const sources = manager2.listSources();
      assert.equal(sources.length, 1);
      assert.equal(sources[0].name, 'persist');
    });
  });

  describe('markIndexed', () => {
    it('updates indexed_at and chunk_count on a source', () => {
      manager.registerSource({ name: 'idx-test', sourcePath: '/tmp/idx', type: 'local' });

      manager.markIndexed('idx-test', 42);

      const source = manager.getSource('idx-test');
      assert.ok(source.indexed_at, 'should have indexed_at timestamp');
      assert.equal(source.chunk_count, 42);
    });

    it('throws when marking unknown source', () => {
      assert.throws(
        () => manager.markIndexed('ghost', 10),
        { message: /not found.*ghost/i }
      );
    });
  });
});
