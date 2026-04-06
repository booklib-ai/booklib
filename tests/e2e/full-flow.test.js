import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let projectDir;

before(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-e2e-'));

  // package.json with a post-training dep and a pre-training dep
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    dependencies: {
      'my-post-training-lib': '^2.0.0',
      'express': '^4.18.0',
    },
  }));

  // Source file importing the post-training dep
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'src', 'app.ts'), [
    "import { newFeature, anotherApi } from 'my-post-training-lib';",
    "import express from 'express';",
    "import path from 'path';",
    '',
    'const app = express();',
    'newFeature({ option: true });',
  ].join('\n'));

  // Second source file importing from a subpath of the post-training dep
  fs.writeFileSync(path.join(projectDir, 'src', 'utils.ts'), [
    "import { helperFn } from 'my-post-training-lib/utils';",
    "export const result = helperFn();",
  ].join('\n'));

  // Team decision doc with ADR-style headings
  fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'docs', 'decisions.md'), [
    '# ADR-001: Use PaymentIntents',
    '',
    '## Decision',
    'Do not use Charges API. Use PaymentIntents instead.',
    '',
    '## Context',
    'Charges API is deprecated by Stripe.',
  ].join('\n'));

  // Pre-populate the gap detection cache to avoid real network calls.
  // Mark 'my-post-training-lib' as post-training (published after cutoff).
  const cacheDir = path.join(projectDir, '.booklib');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'version-cache.json'), JSON.stringify({
    'npm:my-post-training-lib@2.0.0': {
      publishDate: '2025-09-15T00:00:00.000Z',
      checkedAt: Date.now(),
    },
    'npm:express@4.18.0': {
      publishDate: '2023-01-01T00:00:00.000Z',
      checkedAt: Date.now(),
    },
  }));
});

after(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('BookLib E2E: Full Flow', () => {

  it('Step 1: Gap detection finds post-training deps', async () => {
    const { GapDetector } = await import('../../lib/engine/gap-detector.js');
    const detector = new GapDetector({
      cachePath: path.join(projectDir, '.booklib', 'version-cache.json'),
      cacheTtlMs: 999_999_999,
    });
    const gaps = await detector.detect(projectDir);

    assert.equal(gaps.postTraining.length, 1);
    assert.equal(gaps.postTraining[0].name, 'my-post-training-lib');
    assert.equal(gaps.totalDeps, 2);
    assert.ok(gaps.uncapturedDocs.length >= 1, 'should find docs/ directory');
  });

  it('Step 2: Import detection finds affected files', async () => {
    const { ImportChecker } = await import('../../lib/engine/import-checker.js');
    // No searcher — all imports go to skipped (classification not possible)
    const checker = new ImportChecker();
    const result = await checker.checkFile(
      path.join(projectDir, 'src', 'app.ts'),
      projectDir,
    );

    // Without a searcher, declared deps cannot be classified — they go to skipped
    assert.equal(result.unknown.length, 0, 'no searcher means no unknown classification');
    assert.equal(result.known.length, 0, 'no searcher means no known classification');
    assert.ok(
      result.skipped.some(i => i.module === 'my-post-training-lib'),
      'my-post-training-lib should be skipped without searcher',
    );
    assert.ok(
      result.skipped.some(i => i.module === 'express'),
      'express should be skipped without searcher',
    );
    assert.ok(
      result.skipped.some(i => i.module === 'path'),
      'path should be skipped as undeclared stdlib',
    );
  });

  it('Step 3: Project analyzer cross-references gaps with imports', async () => {
    const { ProjectAnalyzer } = await import('../../lib/engine/project-analyzer.js');
    const { GapDetector } = await import('../../lib/engine/gap-detector.js');

    const gapDetector = new GapDetector({
      cachePath: path.join(projectDir, '.booklib', 'version-cache.json'),
      cacheTtlMs: 999_999_999,
    });

    const analyzer = new ProjectAnalyzer({ gapDetector });
    const result = await analyzer.analyze(projectDir);

    // Both src/app.ts and src/utils.ts import from my-post-training-lib
    assert.ok(result.affected.length >= 1, 'should find affected files');
    assert.ok(result.totalApis >= 2, 'should extract at least 2 API names');

    // Verify specific APIs were extracted from app.ts
    const appEntry = result.affected.find(a => a.file.includes('app.ts'));
    assert.ok(appEntry, 'app.ts should be in affected list');
    assert.ok(appEntry.apis.includes('newFeature'), 'should extract newFeature');
    assert.ok(appEntry.apis.includes('anotherApi'), 'should extract anotherApi');

    // express is pre-training -- should NOT appear in affected
    assert.ok(
      !result.affected.some(a => a.dep.name === 'express'),
      'express should not be flagged as post-training',
    );
  });

  it('Step 4: Source detection identifies doc types', async () => {
    const { detectSourceType } = await import('../../lib/engine/source-detector.js');
    const result = detectSourceType(path.join(projectDir, 'docs'));

    // docs/decisions.md has ADR-format headings (## Decision, ## Context)
    // which match the team-decision heuristic
    assert.equal(result.type, 'team-decision');
  });

  it('Step 5: Decision checker finds contradictions', async () => {
    const { DecisionChecker } = await import('../../lib/engine/decision-checker.js');

    // Create a file that deliberately uses the prohibited Charges API
    fs.writeFileSync(path.join(projectDir, 'src', 'payments.ts'), [
      "import Stripe from 'stripe';",
      "const charge = Stripe.charges.create({ amount: 1000 });",
    ].join('\n'));

    // Fake searcher returns the decision text for charge-related queries.
    // DecisionChecker calls searcher.search(query, limit, minScore) -- we
    // only need the first arg to decide what to return.
    const fakeSearcher = {
      async search(query) {
        if (query.toLowerCase().includes('charge') || query.toLowerCase().includes('stripe')) {
          return [{
            text: 'Do not use Charges API. Use PaymentIntents instead.',
            metadata: { sourceName: 'docs/decisions.md' },
          }];
        }
        return [];
      },
    };

    const checker = new DecisionChecker({ searcher: fakeSearcher });
    const result = await checker.checkFile(
      path.join(projectDir, 'src', 'payments.ts'),
    );

    assert.ok(result.contradictions.length >= 1, 'should find at least one contradiction');
    assert.ok(
      result.contradictions.some(c =>
        c.identifier.toLowerCase().includes('charge'),
      ),
      'contradiction should reference charges',
    );
  });

  it('Step 6: Gap resolver produces manual suggestions for unknown deps', async () => {
    const { GapResolver } = await import('../../lib/engine/gap-resolver.js');

    // Subclass that stubs network-dependent sources to avoid real API calls
    class TestResolver extends GapResolver {
      async _tryContext7() { return { resolved: false, source: 'context7' }; }
      async _tryGitHub() { return { resolved: false, source: 'github' }; }
    }

    const resolver = new TestResolver({
      outputBase: path.join(projectDir, '.booklib', 'sources'),
    });

    const results = await resolver.resolveAll([
      { name: 'my-post-training-lib', version: '2.0.0', ecosystem: 'npm' },
    ]);

    assert.equal(results.length, 1);
    assert.equal(results[0].result.resolved, false);
    assert.ok(
      results[0].result.suggestion.includes('booklib connect'),
      'suggestion should include booklib connect command',
    );
  });
});
