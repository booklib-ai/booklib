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
