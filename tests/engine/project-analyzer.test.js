import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { ProjectAnalyzer, findSourceFiles, extractApiNames, normalizePkgName, readProjectName } from '../../lib/engine/project-analyzer.js';

/** Mock GapDetector that returns predefined results without network calls. */
class MockGapDetector {
  constructor(result) { this._result = result; }
  async detect() { return this._result; }
}

function noGaps() {
  return {
    postTraining: [],
    uncapturedDocs: [],
    ecosystems: [],
    totalDeps: 0,
    checkedDeps: 0,
  };
}

function withGaps(deps) {
  return {
    postTraining: deps,
    uncapturedDocs: [],
    ecosystems: ['npm'],
    totalDeps: deps.length,
    checkedDeps: deps.length,
  };
}

function makeDep(name, version = '1.0.0') {
  return {
    name,
    version,
    ecosystem: 'npm',
    publishDate: new Date('2025-08-01'),
  };
}

/** Create a temporary directory with files described by a flat map. */
function createTmpProject(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-pa-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

function removeTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ── analyze ─────────────────────────────────────────────────────────────────

describe('ProjectAnalyzer', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) removeTmpDir(tmpDir); });

  describe('analyze', () => {
    it('finds affected files when code imports post-training deps', async () => {
      tmpDir = createTmpProject({
        'src/app.ts': `import { cacheLife } from 'next/cache';\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('next', '16.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].file, path.join('src', 'app.ts'));
      assert.equal(result.affected[0].dep.name, 'next');
      assert.deepEqual(result.affected[0].apis, ['cacheLife']);
    });

    it('returns multiple APIs from destructured imports', async () => {
      tmpDir = createTmpProject({
        'src/page.tsx': `import { cacheLife, after, unstable_rethrow } from 'next/cache';\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('next', '16.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.deepEqual(result.affected[0].apis, ['cacheLife', 'after', 'unstable_rethrow']);
    });

    it('handles default imports', async () => {
      tmpDir = createTmpProject({
        'lib/pay.js': `import Stripe from 'stripe';\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('stripe', '14.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.deepEqual(result.affected[0].apis, ['Stripe']);
    });

    it('finds affected files across multiple deps', async () => {
      tmpDir = createTmpProject({
        'src/app.ts': `import { cacheLife } from 'next/cache';\n`,
        'src/pay.ts': `import Stripe from 'stripe';\n`,
      });

      const deps = [makeDep('next', '16.0.0'), makeDep('stripe', '14.0.0')];
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps(deps)),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 2);
      assert.equal(result.totalFiles, 2);
      const names = result.affected.map(a => a.dep.name).sort();
      assert.deepEqual(names, ['next', 'stripe']);
    });

    it('returns empty when no post-training deps', async () => {
      tmpDir = createTmpProject({
        'src/app.ts': `import React from 'react';\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(noGaps()),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.deepEqual(result.affected, []);
      assert.equal(result.totalFiles, 0);
      assert.equal(result.totalApis, 0);
    });

    it('returns empty when no source files match', async () => {
      tmpDir = createTmpProject({
        'src/app.ts': `import React from 'react';\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('stripe', '14.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.deepEqual(result.affected, []);
      assert.equal(result.totalFiles, 0);
    });

    it('skips node_modules and build dirs', async () => {
      tmpDir = createTmpProject({
        'node_modules/next/index.js': `import { cacheLife } from 'next/cache';\n`,
        'dist/bundle.js': `import { cacheLife } from 'next/cache';\n`,
        'src/app.ts': `console.log('clean');\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('next', '16.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.deepEqual(result.affected, []);
    });

    it('handles Python from-import', async () => {
      tmpDir = createTmpProject({
        'app.py': `from flask import Blueprint, jsonify\n`,
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('flask', '3.1.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.deepEqual(result.affected[0].apis, ['Blueprint', 'jsonify']);
    });

    it('deduplicates APIs from multiple import lines', async () => {
      tmpDir = createTmpProject({
        'src/page.tsx': [
          `import { cacheLife } from 'next/cache';`,
          `import { cacheLife, after } from 'next/server';`,
        ].join('\n'),
      });

      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([makeDep('next', '16.0.0')])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      const apis = result.affected[0].apis;
      // cacheLife should appear only once despite being in two import lines
      assert.equal(apis.filter(a => a === 'cacheLife').length, 1);
      assert.ok(apis.includes('after'));
    });
  });

  // ── extractApiNames ─────────────────────────────────────────────────────────

  describe('extractApiNames', () => {
    it('extracts destructured JS imports', () => {
      const code = `import { useState, useEffect } from 'react';`;
      const result = extractApiNames(code, 'react', 'js');
      assert.deepEqual(result, ['useState', 'useEffect']);
    });

    it('extracts default JS imports', () => {
      const code = `import React from 'react';`;
      const result = extractApiNames(code, 'react', 'js');
      assert.deepEqual(result, ['React']);
    });

    it('extracts require destructured', () => {
      const code = `const { readFile, writeFile } = require('fs');`;
      const result = extractApiNames(code, 'fs', 'js');
      assert.deepEqual(result, ['readFile', 'writeFile']);
    });

    it('handles import-as aliasing', () => {
      const code = `import { useState as useStateHook } from 'react';`;
      const result = extractApiNames(code, 'react', 'js');
      // Should keep the original name, not the alias
      assert.deepEqual(result, ['useState']);
    });

    it('extracts Python from-import', () => {
      const code = `from flask import Blueprint, jsonify`;
      const result = extractApiNames(code, 'flask', 'python');
      assert.deepEqual(result, ['Blueprint', 'jsonify']);
    });

    it('returns module name when no specific APIs found', () => {
      const code = `const stripe = require('stripe');`;
      const result = extractApiNames(code, 'stripe', 'js');
      assert.deepEqual(result, ['stripe']);
    });

    it('handles subpath imports for JS packages', () => {
      const code = `import { cacheLife } from 'next/cache';`;
      const result = extractApiNames(code, 'next', 'js');
      assert.deepEqual(result, ['cacheLife']);
    });

    it('extracts Go function usage from pkg.FuncName calls', () => {
      const code = `
package main
import "github.com/gin-gonic/gin"
func main() {
  r := gin.Default()
  r.GET("/", gin.HandlerFunc(handler))
}`;
      const result = extractApiNames(code, 'github.com/gin-gonic/gin', 'go');
      assert.deepEqual(result, ['Default', 'HandlerFunc']);
    });

    it('extracts Rust grouped use imports', () => {
      const code = `use serde::{Serialize, Deserialize};`;
      const result = extractApiNames(code, 'serde', 'rust');
      assert.deepEqual(result, ['Serialize', 'Deserialize']);
    });

    it('extracts Rust single use import', () => {
      const code = `use tokio::runtime::Runtime;`;
      const result = extractApiNames(code, 'tokio', 'rust');
      assert.deepEqual(result, ['Runtime']);
    });

    it('extracts Java import class name', () => {
      const code = `import com.google.gson.Gson;\nimport com.google.gson.GsonBuilder;`;
      const result = extractApiNames(code, 'com.google.gson', 'java');
      assert.deepEqual(result, ['Gson', 'GsonBuilder']);
    });

    it('extracts Kotlin import class name', () => {
      const code = `import io.ktor.server.engine.embeddedServer`;
      const result = extractApiNames(code, 'io.ktor.server.engine', 'kotlin');
      assert.deepEqual(result, ['embeddedServer']);
    });

    it('extracts Java static import', () => {
      const code = `import static org.junit.Assert.assertEquals;`;
      const result = extractApiNames(code, 'org.junit.Assert', 'java');
      assert.deepEqual(result, ['assertEquals']);
    });

    it('returns module name for unsupported language', () => {
      const code = `require 'rails'`;
      const result = extractApiNames(code, 'rails', 'ruby');
      assert.deepEqual(result, ['rails']);
    });

    it('extracts PHP use statement (last segment)', () => {
      const code = `use Illuminate\\Support\\Facades\\DB;`;
      const result = extractApiNames(code, 'Illuminate\\Support\\Facades', 'php');
      assert.deepEqual(result, ['DB']);
    });

    it('extracts PHP use with alias', () => {
      const code = `use App\\Models\\User as UserModel;`;
      const result = extractApiNames(code, 'App\\Models', 'php');
      assert.deepEqual(result, ['UserModel']);
    });

    it('extracts PHP grouped use', () => {
      const code = `use App\\Models\\{User, Post, Comment};`;
      const result = extractApiNames(code, 'App\\Models', 'php');
      assert.deepEqual(result, ['User', 'Post', 'Comment']);
    });

    it('extracts PHP grouped use with alias', () => {
      const code = `use App\\Models\\{User as U, Post};`;
      const result = extractApiNames(code, 'App\\Models', 'php');
      assert.deepEqual(result, ['U', 'Post']);
    });
  });

  // ── findSourceFiles ─────────────────────────────────────────────────────────

  describe('findSourceFiles', () => {
    it('finds .ts and .js files recursively', () => {
      tmpDir = createTmpProject({
        'src/app.ts': '',
        'src/lib/utils.js': '',
        'src/deep/nested/file.tsx': '',
      });

      const files = findSourceFiles(tmpDir);
      assert.equal(files.length, 3);
    });

    it('skips node_modules', () => {
      tmpDir = createTmpProject({
        'src/app.ts': '',
        'node_modules/react/index.js': '',
      });

      const files = findSourceFiles(tmpDir);
      assert.equal(files.length, 1);
      assert.ok(files[0].endsWith('app.ts'));
    });

    it('returns empty for empty directory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-pa-empty-'));
      const files = findSourceFiles(tmpDir);
      assert.equal(files.length, 0);
    });

    it('ignores non-code files', () => {
      tmpDir = createTmpProject({
        'README.md': '# hi',
        'style.css': 'body {}',
        'src/app.ts': '',
      });

      const files = findSourceFiles(tmpDir);
      assert.equal(files.length, 1);
    });
  });

  // ── normalizePkgName ─────────────────────────────────────────────────────────

  describe('normalizePkgName', () => {
    it('normalizes underscores to hyphens', () => {
      assert.equal(normalizePkgName('typing_inspection'), 'typing-inspection');
    });

    it('normalizes hyphens consistently', () => {
      assert.equal(normalizePkgName('typing-inspection'), 'typing-inspection');
    });

    it('lowercases names', () => {
      assert.equal(normalizePkgName('Flask-RESTful'), 'flask-restful');
    });

    it('collapses consecutive separators', () => {
      assert.equal(normalizePkgName('foo__bar--baz'), 'foo-bar-baz');
    });
  });

  // ── analyze: hyphen/underscore normalization ─────────────────────────────────

  describe('analyze (hyphen/underscore normalization)', () => {
    it('matches Python dep with hyphens to import with underscores', async () => {
      tmpDir = createTmpProject({
        'app.py': `from typing_inspection import get_type_hints\n`,
      });

      const dep = makeDep('typing-inspection', '0.4.0');
      dep.ecosystem = 'pypi';
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([dep])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].dep.name, 'typing-inspection');
      assert.deepEqual(result.affected[0].apis, ['get_type_hints']);
    });

    it('matches Rust crate with hyphens to use with underscores', async () => {
      tmpDir = createTmpProject({
        'src/main.rs': `use tokio_tungstenite::connect_async;\n`,
      });

      const dep = makeDep('tokio-tungstenite', '0.25.0');
      dep.ecosystem = 'crates';
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([dep])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].dep.name, 'tokio-tungstenite');
    });
  });

  // ── analyze: Maven/Gradle colon-separated deps ──────────────────────────────

  describe('analyze (Maven/Gradle dep matching)', () => {
    it('matches Maven dep to Java import via artifactId', async () => {
      tmpDir = createTmpProject({
        'src/Main.java': `import com.google.gson.Gson;\n`,
      });

      const dep = makeDep('com.google.code.gson:gson', '2.12.0');
      dep.ecosystem = 'maven';
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([dep])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].dep.name, 'com.google.code.gson:gson');
      assert.deepEqual(result.affected[0].apis, ['Gson']);
    });

    it('matches Maven dep to Kotlin import when groupId matches import prefix', async () => {
      tmpDir = createTmpProject({
        'src/App.kt': `import com.squareup.moshi.Moshi\n`,
      });

      // groupId com.squareup.moshi matches the 3-segment import prefix
      const dep = makeDep('com.squareup.moshi:moshi', '1.16.0');
      dep.ecosystem = 'maven';
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([dep])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].dep.name, 'com.squareup.moshi:moshi');
      assert.deepEqual(result.affected[0].apis, ['Moshi']);
    });
  });

  // ── analyze: Ruby slash-to-hyphen normalization ─────────────────────────────

  describe('analyze (Ruby slash/hyphen normalization)', () => {
    it('matches Ruby require with slashes to gem with hyphens', async () => {
      tmpDir = createTmpProject({
        'app.rb': `require 'dry/types'\n`,
      });

      const dep = makeDep('dry-types', '1.8.0');
      dep.ecosystem = 'rubygems';
      const analyzer = new ProjectAnalyzer({
        gapDetector: new MockGapDetector(withGaps([dep])),
      });
      const result = await analyzer.analyze(tmpDir);

      assert.equal(result.affected.length, 1);
      assert.equal(result.affected[0].dep.name, 'dry-types');
    });
  });

  // ── normalizePkgName: slash normalization ───────────────────────────────────

  describe('normalizePkgName (slash normalization)', () => {
    it('normalizes slashes to hyphens for Ruby requires', () => {
      assert.equal(normalizePkgName('dry/types'), 'dry-types');
    });

    it('normalizes mixed separators', () => {
      assert.equal(normalizePkgName('foo_bar/baz'), 'foo-bar-baz');
    });
  });
});
