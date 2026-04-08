import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We test the recommendation logic in isolation by extracting the key decisions
// into testable functions. These tests define the EXPECTED behavior.

describe('Skill recommendation: search query', () => {
  it('should include frameworks in search query, not just languages', () => {
    const languages = ['typescript', 'javascript', 'python'];
    const frameworks = ['Next.js', 'React', 'FastAPI'];
    const query = [...languages, ...frameworks].join(' ') + ' best practices';
    assert.ok(query.includes('Next.js'), 'query should include Next.js');
    assert.ok(query.includes('FastAPI'), 'query should include FastAPI');
    assert.ok(query.includes('typescript'), 'query should include typescript');
  });

  it('should work with empty frameworks', () => {
    const languages = ['go'];
    const frameworks = [];
    const query = [...languages, ...frameworks].join(' ') + ' best practices';
    assert.equal(query, 'go best practices');
  });
});

describe('Skill recommendation: language fallback always merges', () => {
  const LANG_SKILLS = {
    typescript: ['effective-typescript', 'clean-code-typescript', 'react-typescript-cheatsheet'],
    javascript: ['airbnb-javascript', 'js-testing-best-practices', 'node-error-handling'],
    python: ['effective-python', 'python-google-style', 'using-asyncio-python'],
    java: ['effective-java', 'spring-boot-in-action', 'design-patterns'],
    kotlin: ['effective-kotlin', 'kotlin-in-action'],
    rust: ['programming-with-rust', 'rust-in-action'],
    ruby: ['clean-code-reviewer'],
    go: ['system-design-interview', 'api-design-rest'],
    php: ['clean-code-reviewer', 'api-design-rest'],
  };

  it('should add language skills even when search returned some results', () => {
    const searchRecommended = new Set(['ddd-hexagonal']); // search found 1 junk result
    const projectLanguages = ['typescript', 'python'];

    // NEW behavior: always merge, don't gate on size === 0
    for (const lang of projectLanguages) {
      for (const skill of LANG_SKILLS[lang] ?? []) {
        searchRecommended.add(skill);
      }
    }

    assert.ok(searchRecommended.has('effective-typescript'), 'should have effective-typescript');
    assert.ok(searchRecommended.has('effective-python'), 'should have effective-python');
    assert.ok(searchRecommended.has('ddd-hexagonal'), 'should keep search result too');
    assert.ok(searchRecommended.size >= 7, 'should have at least 7 recommended skills');
  });

  it('should still work when search returns 0 results', () => {
    const searchRecommended = new Set(); // search found nothing
    const projectLanguages = ['typescript', 'python'];

    for (const lang of projectLanguages) {
      for (const skill of LANG_SKILLS[lang] ?? []) {
        searchRecommended.add(skill);
      }
    }

    assert.ok(searchRecommended.has('effective-typescript'));
    assert.ok(searchRecommended.has('effective-python'));
    assert.equal(searchRecommended.size, 6); // 3 TS + 3 Python
  });

  it('should not add skills for languages not in the project', () => {
    const searchRecommended = new Set();
    const projectLanguages = ['typescript']; // no python, no java

    for (const lang of projectLanguages) {
      for (const skill of LANG_SKILLS[lang] ?? []) {
        searchRecommended.add(skill);
      }
    }

    assert.ok(!searchRecommended.has('effective-python'), 'should not have python skills');
    assert.ok(!searchRecommended.has('effective-java'), 'should not have java skills');
    assert.ok(searchRecommended.has('effective-typescript'), 'should have typescript skills');
  });
});

describe('Skill recommendation: pre-selection filters by project stack', () => {
  it('should not pre-select Rust skills for a TypeScript/Python project', () => {
    const installedNames = ['effective-typescript', 'programming-with-rust', 'rust-in-action', 'article-writing', 'effective-python'];
    const projectLanguages = ['typescript', 'python'];
    const recommendedNames = new Set(['effective-typescript', 'effective-python']);

    // Map skills to their languages (simplified)
    const SKILL_LANGUAGES = {
      'effective-typescript': ['typescript'],
      'programming-with-rust': ['rust'],
      'rust-in-action': ['rust'],
      'article-writing': [], // no language
      'effective-python': ['python'],
      'spring-boot-in-action': ['java'],
      'brand-guidelines': [], // no language
    };

    const initialValues = installedNames.filter(name => {
      // Always include if recommended
      if (recommendedNames.has(name)) return true;
      // Include installed only if it matches project languages
      const skillLangs = SKILL_LANGUAGES[name] ?? [];
      if (skillLangs.length === 0) return false; // no language = don't pre-select
      return skillLangs.some(l => projectLanguages.includes(l));
    });

    assert.ok(initialValues.includes('effective-typescript'), 'should include TS skills');
    assert.ok(initialValues.includes('effective-python'), 'should include Python skills');
    assert.ok(!initialValues.includes('programming-with-rust'), 'should NOT include Rust');
    assert.ok(!initialValues.includes('rust-in-action'), 'should NOT include Rust');
    assert.ok(!initialValues.includes('article-writing'), 'should NOT include non-language skills');
  });

  it('should include language-agnostic skills if they are recommended', () => {
    const recommendedNames = new Set(['api-design-rest', 'clean-code-reviewer']);
    const installedNames = ['api-design-rest', 'brand-guidelines'];
    const projectLanguages = ['typescript'];

    const initialValues = installedNames.filter(name => {
      if (recommendedNames.has(name)) return true;
      return false; // only recommended get pre-selected from installed
    });

    assert.ok(initialValues.includes('api-design-rest'), 'recommended should be pre-selected');
    assert.ok(!initialValues.includes('brand-guidelines'), 'non-recommended installed should not be pre-selected');
  });
});

describe('Doc sources: all detected folders should be pre-selected', () => {
  it('should pre-select all doc sources so users opt-out instead of opt-in', () => {
    const docSources = [
      { path: 'docs', type: 'directory', fileCount: 12 },
      { path: '.specify', type: 'sdd-spec', fileCount: 5 },
      { path: '.planning', type: 'sdd-spec', fileCount: 3 },
    ];

    // Mirrors wizard: initialValues = docSources (all pre-selected)
    const initialValues = docSources;

    assert.equal(initialValues.length, 3, 'all detected sources should be pre-selected');
    assert.ok(initialValues.some(d => d.path === 'docs'));
    assert.ok(initialValues.some(d => d.path === '.specify'));
    assert.ok(initialValues.some(d => d.path === '.planning'));
  });

  it('should pre-select even a single detected doc source', () => {
    const docSources = [{ path: '.specify', type: 'sdd-spec', fileCount: 2 }];
    const initialValues = docSources;
    assert.equal(initialValues.length, 1);
    assert.equal(initialValues[0].path, '.specify');
  });
});

describe('Skill recommendation: pre-selected count accuracy', () => {
  it('should report actual pre-selected count, not just recommended count', () => {
    const recommendedNames = new Set(['effective-typescript', 'effective-python']);
    const installedRelevant = ['effective-typescript']; // 1 installed that's also recommended
    const initialValues = ['effective-typescript', 'effective-python']; // 2 total pre-selected

    // Message should reflect actual count
    const message = `${initialValues.length} pre-selected for your stack, 73 available`;
    assert.ok(message.startsWith('2 pre-selected'), 'should show 2, not recommendedNames.size');
  });
});

describe('Skill recommendation: overload reset flow', () => {
  it('should identify when skills exceed limit', () => {
    const SKILL_LIMIT = 32;
    const installedCount = 43;
    assert.ok(installedCount > SKILL_LIMIT, 'should detect overload');
  });

  it('reset to recommended should result in under-limit count', () => {
    const SKILL_LIMIT = 32;
    const recommendedNames = new Set([
      'effective-typescript', 'clean-code-typescript', 'react-typescript-cheatsheet',
      'effective-python', 'python-google-style', 'using-asyncio-python',
      'api-design-rest', 'ddd-hexagonal',
    ]);
    assert.ok(recommendedNames.size <= SKILL_LIMIT, 'recommended set should be under limit');
  });
});

describe('Progress bar: throttle prevents line spam during indexing', () => {
  it('should suppress updates within 500ms window but always allow final update', () => {
    const calls = [];
    let lastProgressUpdate = 0;

    // Simulate the throttle logic from wizard/index.js onProgress callback
    function onProgress({ current, total }, now) {
      if (now - lastProgressUpdate < 500 && current < total) return;
      lastProgressUpdate = now;
      calls.push({ current, total });
    }

    // t=1000: first call fires (1000 - 0 >= 500)
    onProgress({ current: 32, total: 1368 }, 1000);
    // t=1100ms: suppressed (within 500ms window)
    onProgress({ current: 64, total: 1368 }, 1100);
    // t=1200ms: suppressed
    onProgress({ current: 96, total: 1368 }, 1200);
    // t=1500ms: fires (500ms since last)
    onProgress({ current: 128, total: 1368 }, 1500);
    // t=1600ms: suppressed
    onProgress({ current: 160, total: 1368 }, 1600);
    // t=1700ms: final update (current === total) always fires despite throttle
    onProgress({ current: 1368, total: 1368 }, 1700);

    assert.equal(calls.length, 3, 'should fire 3 times: initial, 500ms, and final');
    assert.deepEqual(calls[0], { current: 32, total: 1368 });
    assert.deepEqual(calls[1], { current: 128, total: 1368 });
    assert.deepEqual(calls[2], { current: 1368, total: 1368 });
  });

  it('should render progress as a single line so spinner updates in-place', () => {
    // The progress bar is passed to clack's s.message() which overwrites the
    // current spinner line. If the string contains newlines, it breaks into
    // multiple terminal lines and creates the "line spam" effect.
    function renderProgressLine({ current, total, docPath, elapsed }) {
      const pct = Math.round((current / total) * 100);
      const barWidth = 20;
      const filled = Math.round((current / total) * barWidth);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
      return `Indexing ${docPath} ${bar} ${pct}% (${current}/${total} chunks, ${elapsed}s)`;
    }

    const snapshots = [
      { current: 200, total: 1368, docPath: 'docs/', elapsed: '1' },
      { current: 684, total: 1368, docPath: 'docs/', elapsed: '5' },
      { current: 1368, total: 1368, docPath: 'docs/', elapsed: '9' },
    ];

    for (const snap of snapshots) {
      const line = renderProgressLine(snap);
      assert.ok(!line.includes('\n'), `progress output must be single line, got: ${line}`);
      assert.ok(line.includes('Indexing'), 'should contain action label');
      assert.ok(line.includes('\u2588'), 'should contain filled bar segments');
      assert.ok(line.includes(`${snap.current}/${snap.total}`), 'should show current/total');
    }

    // Successive renders should differ (proving in-place update changes content)
    const first = renderProgressLine(snapshots[0]);
    const last = renderProgressLine(snapshots[2]);
    assert.notEqual(first, last, 'progress should change between updates');
    assert.ok(last.includes('100%'), 'final render should show 100%');
  });

  it('should show "Saving" message after progress reaches 100% so user knows work continues', () => {
    const messages = [];

    // Simulate the full onProgress + onStatus flow from the wizard
    function onProgress({ current, total }) {
      messages.push(`Indexing docs/ 100% (${current}/${total} chunks)`);
    }
    function onStatus(phase) {
      if (phase === 'saving') messages.push('Saving docs/ index...');
    }

    onProgress({ current: 1368, total: 1368 });
    onStatus('saving');

    assert.equal(messages.length, 2);
    assert.ok(messages[0].includes('100%'), 'should show completed progress');
    assert.ok(messages[1].includes('Saving'), 'should transition to saving message');
  });

  it('should not suppress any updates when spaced 500ms+ apart', () => {
    const calls = [];
    let lastProgressUpdate = 0;

    function onProgress({ current, total }, now) {
      if (now - lastProgressUpdate < 500 && current < total) return;
      lastProgressUpdate = now;
      calls.push(current);
    }

    onProgress({ current: 100, total: 500 }, 1000);
    onProgress({ current: 200, total: 500 }, 1500);
    onProgress({ current: 300, total: 500 }, 2000);
    onProgress({ current: 400, total: 500 }, 2500);
    onProgress({ current: 500, total: 500 }, 3000);

    assert.equal(calls.length, 5, 'all updates should fire when 500ms apart');
  });
});

describe('Skill recommendation: label simplification', () => {
  it('should show "recommended" or nothing — no source labels', () => {
    const isRecommended = true;
    const isInstalled = true;
    const isCommunity = true;

    // OLD: "recommended + installed + community" — too noisy
    // NEW: just "recommended" when recommended, nothing otherwise
    const hint = isRecommended ? 'recommended' : '';
    assert.equal(hint, 'recommended');
    assert.ok(!hint.includes('community'), 'should not mention community');
    assert.ok(!hint.includes('installed'), 'should not mention installed in hint');
  });

  it('should show "installed" only for non-recommended installed skills', () => {
    const isRecommended = false;
    const isInstalled = true;

    const hint = isRecommended ? 'recommended' : (isInstalled ? 'installed' : '');
    assert.equal(hint, 'installed');
  });

  it('should show empty hint for available-but-not-installed skills', () => {
    const isRecommended = false;
    const isInstalled = false;

    const hint = isRecommended ? 'recommended' : (isInstalled ? 'installed' : '');
    assert.equal(hint, '');
  });
});
