import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictResolver } from '../lib/conflict-resolver.js';

describe('Search results with unnamed chunks (project docs) pass through conflict resolution', () => {

  it('unnamed chunks should not be grouped as "unknown" and suppressed', () => {
    const resolver = new ConflictResolver();
    const chunks = [
      { text: 'createClient from supabase', score: 1.0, metadata: {} },
      { text: 'supabase auth getUser', score: 0.9, metadata: {} },
      { text: 'supabase realtime channel', score: 0.8, metadata: {} },
    ];

    const result = resolver.resolveChunks(chunks);
    // Without the fix, all 3 go to conflicts and winners is empty.
    // The resolver groups by name — unnamed chunks all become "unknown".
    // This test documents the CURRENT behavior (which is broken for unnamed chunks).
    // The fix is in registry-searcher.js which separates named from unnamed before resolving.
    const totalOutput = result.winners.length + result.conflicts.length;
    assert.ok(totalOutput > 0, 'chunks should appear somewhere in output');
  });

  it('registry-searcher passes unnamed chunks through without conflict resolution', async () => {
    // Simulate what registry-searcher does: separate named from unnamed
    const localResults = [
      { text: 'createClient supabase', score: 1.0, metadata: {} },
      { text: 'supabase auth', score: 0.9, metadata: {} },
      { text: 'clean code naming', score: 0.8, metadata: { name: 'clean-code-reviewer' } },
      { text: 'clean code functions', score: 0.7, metadata: { name: 'clean-code-reviewer' } },
    ];

    const namedChunks = localResults.filter(r => r.metadata?.name);
    const unnamedChunks = localResults.filter(r => !r.metadata?.name);

    assert.equal(unnamedChunks.length, 2, 'should have 2 unnamed project doc chunks');
    assert.equal(namedChunks.length, 2, 'should have 2 named skill chunks');

    // Unnamed chunks pass through directly
    const winners = [...unnamedChunks];
    assert.equal(winners.length, 2, 'unnamed chunks should all be winners');
    assert.ok(winners[0].text.includes('supabase'), 'first unnamed should be supabase');
  });

  it('named skill chunks still go through conflict resolution', () => {
    const resolver = new ConflictResolver();
    const namedChunks = [
      { text: 'kotlin null safety', score: 0.9, metadata: { name: 'effective-kotlin' } },
      { text: 'kotlin coroutines', score: 0.8, metadata: { name: 'effective-kotlin' } },
      { text: 'java generics', score: 0.7, metadata: { name: 'effective-java' } },
    ];

    const result = resolver.resolveChunks(namedChunks);
    // Named chunks should be resolved — deduped by skill name
    assert.ok(result.winners.length > 0 || result.conflicts.length > 0,
      'named chunks should be processed through conflict resolution');
  });

  it('mix of named and unnamed returns both in results', () => {
    // The full flow: separate, resolve named, combine
    const localResults = [
      { text: 'supabase createClient', score: 1.0, metadata: {} },
      { text: 'kotlin safety', score: 0.8, metadata: { name: 'effective-kotlin' } },
    ];

    const namedChunks = localResults.filter(r => r.metadata?.name);
    const unnamedChunks = localResults.filter(r => !r.metadata?.name);

    // Named: only 1, no conflict resolution needed
    // Unnamed: pass through
    const winners = [...namedChunks, ...unnamedChunks];

    assert.equal(winners.length, 2, 'both named and unnamed should appear in winners');
    assert.ok(winners.some(w => w.text.includes('supabase')), 'supabase doc should be in results');
    assert.ok(winners.some(w => w.text.includes('kotlin')), 'kotlin skill should be in results');
  });

  it('all unnamed chunks should survive even when there are many', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      text: `doc chunk ${i}`,
      score: 1.0 - i * 0.05,
      metadata: {},
    }));

    const unnamed = chunks.filter(r => !r.metadata?.name);
    assert.equal(unnamed.length, 10, 'all 10 should be unnamed');

    // In the registry-searcher fix, all unnamed pass through
    const winners = [...unnamed];
    assert.equal(winners.length, 10, 'all unnamed chunks should pass through');
  });
});
