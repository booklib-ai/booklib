import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  ContextMapBuilder,
  ContextMapMatcher,
} from '../../lib/engine/context-map.js';
import { formatInjection } from '../../hooks/pretooluse-inject.mjs';
import { formatContradiction } from '../../hooks/posttooluse-contradict.mjs';

let projectDir;
let contextMapPath;

// Pre-built context map with one post-training gap and one team decision
const prebuiltMap = {
  version: 1,
  builtAt: '2026-04-05T00:00:00.000Z',
  items: [
    {
      id: 'gap:my-lib',
      source: 'gap-detector',
      type: 'post-training',
      codeTerms: [],
      filePatterns: ['**'],
      importTriggers: ['my-lib'],
      functionPatterns: [],
      injection: {
        correction: 'my-lib@3.0.0 (published 2026-03-01). Post-training.',
        constraint: null,
        example: null,
      },
    },
    {
      id: 'team-no-legacy',
      source: 'team-decisions',
      type: 'decision',
      codeTerms: ['payment', 'billing'],
      filePatterns: ['**/api/**'],
      importTriggers: [],
      functionPatterns: ['legacyMethod'],
      injection: {
        correction: null,
        constraint: 'Do not use legacyMethod for payments. Use newPaymentFlow instead.',
        example: 'newPaymentFlow({ amount, currency })',
      },
    },
  ],
};

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-e2e-inject-'));

  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ name: 'inject-test', dependencies: { 'my-lib': '^3.0.0' } }),
  );

  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'src', 'app.ts'),
    [
      "import { createClient } from 'my-lib';",
      "import express from 'express';",
      '',
      'const client = createClient();',
      'client.doStuff();',
    ].join('\n'),
  );

  fs.mkdirSync(path.join(projectDir, 'src', 'components'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'src', 'components', 'Header.tsx'),
    [
      "import React from 'react';",
      'export function Header() { return <h1>Title</h1>; }',
    ].join('\n'),
  );

  const booklibDir = path.join(projectDir, '.booklib');
  fs.mkdirSync(booklibDir, { recursive: true });
  contextMapPath = path.join(booklibDir, 'context-map.json');
  fs.writeFileSync(contextMapPath, JSON.stringify(prebuiltMap, null, 2));
});

after(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('Runtime Injection E2E', () => {

  it('ContextMapMatcher finds post-training item by import trigger', () => {
    const map = ContextMapBuilder.load(contextMapPath);
    assert.ok(map, 'context map should load from disk');

    const matcher = new ContextMapMatcher(map.items);
    const results = matcher.match('src/app.ts', '', ['my-lib']);

    assert.ok(results.length >= 1, 'should find at least one match');

    const gapItem = results.find(r => r.id === 'gap:my-lib');
    assert.ok(gapItem, 'gap:my-lib should be in results');
    assert.equal(gapItem.type, 'post-training');
    assert.ok(gapItem._strength >= 4, 'import trigger should give strength >= 4');
  });

  it('formatInjection produces readable output with header and correction', () => {
    const map = ContextMapBuilder.load(contextMapPath);
    const matcher = new ContextMapMatcher(map.items);
    const results = matcher.match('src/app.ts', '', ['my-lib']);

    const output = formatInjection(results);

    assert.ok(output.startsWith('[BookLib]'), 'should start with [BookLib] header');
    assert.ok(
      output.includes('my-lib@3.0.0'),
      'should include correction text with package version',
    );
    assert.ok(
      output.includes('Post-training'),
      'should flag the item as post-training',
    );
  });

  it('contradiction detection catches prohibited method', () => {
    const map = ContextMapBuilder.load(contextMapPath);
    const matcher = new ContextMapMatcher(map.items);

    // Code that uses the prohibited legacyMethod in an api path
    const badCode = 'const result = legacyMethod({ amount: 500 });';
    const filePath = 'src/api/billing.js';

    const matched = matcher.match(filePath, badCode, []);
    assert.ok(matched.length >= 1, 'should match the team decision item');

    const teamItem = matched.find(r => r.id === 'team-no-legacy');
    assert.ok(teamItem, 'team-no-legacy should be matched');

    const contradictions = matcher.checkContradictions(badCode, matched);
    assert.ok(contradictions.length >= 1, 'should detect at least one contradiction');
    assert.ok(
      contradictions[0].constraint.toLowerCase().includes('legacymethod'),
      'contradiction should reference legacyMethod',
    );
  });

  it('full pipeline: build -> match -> inject -> contradict', async () => {
    // Step 1: Build from knowledge and gaps
    const builder = new ContextMapBuilder({ processingMode: 'fast' });

    const knowledgeMap = await builder.buildFromKnowledge([
      {
        id: 'rule-auth',
        text: 'Do not use basicAuth for auth endpoints. Use oauth2Client instead.',
        source: 'team-decisions',
        type: 'decision',
      },
    ]);
    assert.equal(knowledgeMap.items.length, 1);

    const gapMap = await builder.buildFromGaps([
      { name: 'super-orm', version: '4.0.0', ecosystem: 'npm', publishDate: '2026-02-20' },
    ]);
    assert.equal(gapMap.items.length, 1);

    // Step 2: Merge and save
    const combined = {
      version: 1,
      builtAt: new Date().toISOString(),
      items: [...knowledgeMap.items, ...gapMap.items],
    };
    const savePath = path.join(projectDir, '.booklib', 'context-map-full.json');
    builder.save(savePath, combined);

    // Step 3: Load and match
    const loaded = ContextMapBuilder.load(savePath);
    assert.ok(loaded, 'saved map should load back');
    assert.equal(loaded.items.length, 2);

    const matcher = new ContextMapMatcher(loaded.items);

    // Match against a file importing super-orm
    const ormResults = matcher.match(
      'src/db/client.ts',
      "import { connect } from 'super-orm';",
      ['super-orm'],
    );
    assert.ok(ormResults.length >= 1, 'should match super-orm gap');
    assert.equal(ormResults[0].id, 'gap:super-orm');

    // Step 4: Format injection
    const injectionOutput = formatInjection(ormResults);
    assert.ok(injectionOutput.includes('[BookLib]'));
    assert.ok(injectionOutput.includes('super-orm@4.0.0'));

    // Step 5: Write code with prohibited method and detect contradiction
    const authCode = 'const session = basicAuth({ user, pass });';
    const authResults = matcher.match('src/auth/login.ts', authCode, []);
    assert.ok(authResults.length >= 1, 'should match auth rule via codeTerms');

    const contradictions = matcher.checkContradictions(authCode, authResults);
    assert.ok(contradictions.length >= 1, 'should detect basicAuth contradiction');

    // Step 6: Format contradiction
    const contradictionOutput = formatContradiction(contradictions);
    assert.ok(
      contradictionOutput.includes('[BookLib] Contradiction detected:'),
      'should include contradiction header',
    );
    assert.ok(
      contradictionOutput.toLowerCase().includes('basicauth'),
      'should reference prohibited method',
    );
  });

  it('no injection for unrelated file', () => {
    const map = ContextMapBuilder.load(contextMapPath);
    const matcher = new ContextMapMatcher(map.items);

    // Header.tsx imports react, not my-lib; no matching code terms or file patterns
    const headerCode = fs.readFileSync(
      path.join(projectDir, 'src', 'components', 'Header.tsx'),
      'utf8',
    );
    const results = matcher.match(
      'src/components/Header.tsx',
      headerCode,
      ['react'],
    );

    assert.equal(results.length, 0, 'unrelated file should produce 0 matches');
  });
});
