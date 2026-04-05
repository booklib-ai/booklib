import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectSourceType } from '../../lib/engine/source-detector.js';

describe('detectSourceType', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-detector-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects framework-docs from code blocks + imports + install commands', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.md'),
      [
        '# Getting Started',
        '```js',
        "import React from 'react'",
        "import { useState } from 'react'",
        '```',
        'Run `npm install react`',
        '## Configuration',
        '```json',
        '{ "compilerOptions": {} }',
        '```',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'framework-docs');
  });

  it('detects api-reference from HTTP methods + endpoints + status codes', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'api.md'),
      [
        '## GET /api/users',
        'Returns 200 with user list.',
        '',
        '### POST /api/users',
        'Request body: {name, email}',
        'Response: 201 Created',
        '',
        '### DELETE /api/users/:id',
        'Returns 200 on success, 404 if not found.',
        'Include Authorization header.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'api-reference');
  });

  it('detects release-notes from version headers + breaking/added/fixed', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'changelog.md'),
      [
        '## v2.0.0',
        '### Breaking Changes',
        '- Removed deprecated API',
        '### Added',
        '- New caching layer',
        '### Fixed',
        '- Login bug',
        '',
        '## v1.5.0',
        '### Added',
        '- Dashboard widget',
        '### Fixed',
        '- Memory leak in parser',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'release-notes');
  });

  it('detects spec from requirements + acceptance criteria + shall/must', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'spec.md'),
      [
        '## Requirements',
        '- System shall authenticate users via OAuth 2.0',
        '- System must enforce rate limits on all endpoints',
        '',
        '## Acceptance Criteria',
        '- Given a valid token, when accessing /api, then return 200',
        '- Given an expired token, when accessing /api, then return 401',
        '',
        '## User Story',
        'As a developer I want to authenticate so that I can access the API.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'spec');
  });

  it('detects team-decision from ADR headers (Context/Decision/Consequences)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'adr-001.md'),
      [
        '# ADR-001: Use JWT for Authentication',
        '',
        '**Status:** Accepted',
        '',
        '## Context',
        'We need a stateless authentication mechanism.',
        '',
        '## Decision',
        'Use JWT with short-lived access tokens.',
        '',
        '## Consequences',
        'Need to implement refresh token rotation.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'team-decision');
  });

  it('detects tutorial from step numbers + sequential words', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'tutorial.md'),
      [
        '# Getting Started',
        '',
        '## Step 1: Install',
        'First, install the package with npm.',
        '',
        '## Step 2: Configure',
        'Next, add the config file to your project.',
        '',
        '## Step 3: Run',
        'Then, start the development server.',
        '',
        '## Step 4: Deploy',
        "Finally, let's deploy the application.",
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'tutorial');
  });

  it('returns wiki as default when no strong signals', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'general.md'),
      [
        '# Company Wiki',
        '',
        'Welcome to our internal knowledge base.',
        '',
        'This page has general information about the team.',
        'We meet on Tuesdays for standup.',
        'The office is on the third floor.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'wiki');
  });

  it('returns wiki when directory has no markdown files', () => {
    // tmpDir is empty — no files at all
    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'wiki');
    assert.equal(result.confidence, 'none');
  });

  it('confidence is high when winner is 2x runner-up', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'adr.md'),
      [
        '# ADR-005',
        '**Status:** Accepted',
        '## Context',
        'Need to choose a database.',
        '## Decision',
        'Use PostgreSQL.',
        '## Consequences',
        'Need connection pooling.',
        '',
        '# ADR-006',
        '**Status:** Proposed',
        '## Context',
        'Need caching.',
        '## Decision',
        'Use Redis.',
        '## Consequences',
        'Additional infrastructure.',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    assert.equal(result.type, 'team-decision');
    assert.equal(result.confidence, 'high');
  });

  it('confidence is medium when scores are close', () => {
    // Mix framework-docs signals with tutorial signals so scores are close
    fs.writeFileSync(
      path.join(tmpDir, 'mixed.md'),
      [
        '## Step 1: Install',
        'First, run `npm install express`.',
        '```js',
        "import express from 'express'",
        '```',
        '## Step 2: Setup',
        'Next, configure the server.',
        '```js',
        "import cors from 'cors'",
        '```',
      ].join('\n')
    );

    const result = detectSourceType(tmpDir);
    // Both types score, so confidence should be medium (not high)
    assert.ok(
      ['framework-docs', 'tutorial'].includes(result.type),
      `expected framework-docs or tutorial, got ${result.type}`
    );
    assert.equal(result.confidence, 'medium');
  });

  it('maxFiles option limits files sampled', () => {
    // Create 5 files, limit to 2
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `doc-${i}.md`),
        `## v${i}.0.0\n### Breaking Changes\n- Removed old API\n### Added\n- New feature ${i}\n`
      );
    }

    // With maxFiles=2, should still detect (scores may be lower but type is the same)
    const limited = detectSourceType(tmpDir, { maxFiles: 2 });
    const full = detectSourceType(tmpDir, { maxFiles: 10 });

    assert.equal(limited.type, full.type);
    // Full scan should have equal or higher score for the winning type
    assert.ok(full.scores[full.type] >= limited.scores[limited.type]);
  });

  it('returns scores for all types', () => {
    fs.writeFileSync(path.join(tmpDir, 'any.md'), '# Some content\nHello world.');

    const result = detectSourceType(tmpDir);
    const expectedTypes = [
      'framework-docs',
      'api-reference',
      'release-notes',
      'spec',
      'team-decision',
      'tutorial',
    ];

    for (const t of expectedTypes) {
      assert.ok(t in result.scores, `scores should include ${t}`);
      assert.equal(typeof result.scores[t], 'number');
    }
  });
});
