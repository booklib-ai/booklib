import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSynthesisPrompt, detectResultSourceType, SYNTHESIS_TEMPLATES } from '../../lib/engine/synthesis-templates.js';

describe('getSynthesisPrompt', () => {
  it('returns framework-docs template with query filled', () => {
    const prompt = getSynthesisPrompt('framework-docs', { query: 'React hooks', results: '' });
    assert.ok(prompt.includes('React hooks'));
    assert.ok(prompt.includes('framework documentation'));
    assert.ok(prompt.includes('## API Reference'));
  });

  it('returns api-reference template', () => {
    const prompt = getSynthesisPrompt('api-reference', { query: 'user endpoints', results: '' });
    assert.ok(prompt.includes('API documentation'));
    assert.ok(prompt.includes('## Endpoints'));
    assert.ok(prompt.includes('## Request Format'));
  });

  it('returns release-notes template', () => {
    const prompt = getSynthesisPrompt('release-notes', { query: 'v3 migration', results: '' });
    assert.ok(prompt.includes('release notes'));
    assert.ok(prompt.includes('## What Changed'));
    assert.ok(prompt.includes('## Breaking Changes'));
  });

  it('falls back to wiki for unknown type', () => {
    const prompt = getSynthesisPrompt('totally-unknown', { query: 'anything', results: '' });
    assert.ok(prompt.includes('general documentation'));
    assert.ok(prompt.includes('## Summary'));
  });

  it('replaces {query}, {fileContext}, {results} placeholders', () => {
    const prompt = getSynthesisPrompt('wiki', {
      query: 'test query',
      file: 'src/main.js',
      results: 'some results text',
    });
    assert.ok(prompt.includes('test query'), 'should contain query');
    assert.ok(prompt.includes('File: src/main.js'), 'should contain file context');
    assert.ok(prompt.includes('some results text'), 'should contain results');
    assert.ok(!prompt.includes('{query}'), 'should not contain raw {query} placeholder');
    assert.ok(!prompt.includes('{fileContext}'), 'should not contain raw {fileContext} placeholder');
    assert.ok(!prompt.includes('{results}'), 'should not contain raw {results} placeholder');
  });
});

describe('SYNTHESIS_TEMPLATES', () => {
  it('has all 13 template types', () => {
    const expected = [
      'framework-docs', 'api-reference', 'release-notes', 'spec',
      'team-decision', 'tutorial', 'wiki',
      'sdd-spec', 'api-spec', 'bdd-spec', 'architecture', 'pkm',
      'project-docs',
    ];
    for (const key of expected) {
      assert.ok(key in SYNTHESIS_TEMPLATES, `missing template: ${key}`);
    }
    assert.equal(Object.keys(SYNTHESIS_TEMPLATES).length, 13);
  });

  it('all templates contain "Only include what\'s IN the search results"', () => {
    for (const [key, template] of Object.entries(SYNTHESIS_TEMPLATES)) {
      assert.ok(
        template.includes("Only include what's IN the search results"),
        `template "${key}" missing grounding instruction`
      );
    }
  });

  it('all templates contain "NO_RELEVANT_KNOWLEDGE"', () => {
    for (const [key, template] of Object.entries(SYNTHESIS_TEMPLATES)) {
      assert.ok(
        template.includes('NO_RELEVANT_KNOWLEDGE'),
        `template "${key}" missing NO_RELEVANT_KNOWLEDGE fallback`
      );
    }
  });
});

describe('detectResultSourceType', () => {
  it('returns majority type from results', () => {
    const results = [
      { metadata: { sourceType: 'api-reference' } },
      { metadata: { sourceType: 'api-reference' } },
      { metadata: { sourceType: 'tutorial' } },
    ];
    assert.equal(detectResultSourceType(results), 'api-reference');
  });

  it('returns null for empty results', () => {
    assert.equal(detectResultSourceType([]), null);
  });

  it('returns null when no sourceType in metadata', () => {
    const results = [
      { metadata: { name: 'some-skill' } },
      { metadata: { name: 'other-skill' } },
    ];
    assert.equal(detectResultSourceType(results), null);
  });
});
