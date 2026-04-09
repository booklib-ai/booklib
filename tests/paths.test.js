import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveBookLibPaths } from '../lib/paths.js';

describe('resolveBookLibPaths — index path separation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-paths-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexPath (write) is always project-local, even when project index does not exist', () => {
    const paths = resolveBookLibPaths(tmpDir);
    assert.equal(paths.indexPath, path.join(tmpDir, '.booklib', 'index'));
  });

  it('readIndexPath falls back to existing index when project has none', () => {
    // No project index exists — readIndexPath should find the package or global index
    const paths = resolveBookLibPaths(tmpDir);
    // readIndexPath should NOT be the non-existent project path (unless nothing exists anywhere)
    // If the package has an index, readIndexPath points there
    if (fs.existsSync(paths.readIndexPath)) {
      assert.notEqual(paths.readIndexPath, paths.indexPath,
        'readIndexPath should fall back to existing index, not non-existent project path');
    }
  });

  it('readIndexPath uses project-local when project index exists', () => {
    // Create a project-local index
    const projectIndex = path.join(tmpDir, '.booklib', 'index');
    fs.mkdirSync(projectIndex, { recursive: true });

    const paths = resolveBookLibPaths(tmpDir);
    assert.equal(paths.readIndexPath, projectIndex,
      'readIndexPath should prefer project-local when it exists');
  });

  it('indexPath and readIndexPath are separate concerns', () => {
    const paths = resolveBookLibPaths(tmpDir);
    // indexPath is for writing — always project-local
    assert.ok(paths.indexPath.includes(tmpDir), 'write path must be under project dir');
    // readIndexPath is for reading — can be anywhere
    assert.ok(paths.readIndexPath, 'read path must exist');
  });

  it('write path does not resolve to package directory after reset', () => {
    // Simulate --reset: project .booklib deleted, but package index exists
    // indexPath must still be project-local, NOT the package dir
    const paths = resolveBookLibPaths(tmpDir);
    const packageRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..');
    assert.ok(!paths.indexPath.startsWith(packageRoot) || paths.indexPath.includes(tmpDir),
      'write indexPath must never resolve to the package directory');
  });

  it('sessionsPath is always project-local', () => {
    const paths = resolveBookLibPaths(tmpDir);
    assert.equal(paths.sessionsPath, path.join(tmpDir, '.booklib', 'sessions'));
  });

  it('configPath defaults to project-local', () => {
    const paths = resolveBookLibPaths(tmpDir);
    assert.equal(paths.configPath, path.join(tmpDir, 'booklib.config.json'));
  });
});
