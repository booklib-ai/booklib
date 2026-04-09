import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Sibling expansion pulls in missing chunks from the same section', () => {

  // Simulate the _expandSiblings logic
  function expandSiblings(results, allDocs) {
    const byParent = new Map();
    for (const r of results) {
      const pid = r.metadata?.parentId;
      if (!pid) continue;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(r);
    }

    const expandIds = new Set();
    for (const [pid, hits] of byParent) {
      const total = hits[0].metadata?.siblingCount ?? 1;
      if (total <= 1) continue;
      if (hits.length / total >= 0.5) expandIds.add(pid);
    }

    if (expandIds.size === 0) return results;

    const siblingPool = new Map();
    for (const doc of allDocs) {
      const pid = doc.metadata?.parentId;
      if (!pid || !expandIds.has(pid)) continue;
      if (!siblingPool.has(pid)) siblingPool.set(pid, []);
      siblingPool.get(pid).push(doc);
    }
    for (const [, siblings] of siblingPool) {
      siblings.sort((a, b) => (a.metadata?.siblingIndex ?? 0) - (b.metadata?.siblingIndex ?? 0));
    }

    const seenTexts = new Set(results.map(r => r.text));
    const expanded = [];
    const insertedParents = new Set();

    for (const r of results) {
      expanded.push(r);
      const pid = r.metadata?.parentId;
      if (pid && expandIds.has(pid) && !insertedParents.has(pid)) {
        insertedParents.add(pid);
        const siblings = siblingPool.get(pid) ?? [];
        for (const sib of siblings) {
          if (!seenTexts.has(sib.text)) {
            expanded.push({ text: sib.text, score: r.score * 0.95, metadata: sib.metadata, _expanded: true });
            seenTexts.add(sib.text);
          }
        }
      }
    }
    return expanded;
  }

  it('expands when ≥50% of siblings are in results', () => {
    const results = [
      { text: 'import createClient', score: 1.0, metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 3 } },
      { text: 'basic config', score: 0.9, metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 3 } },
    ];
    const allDocs = [
      { text: 'import createClient', metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 3 } },
      { text: 'basic config', metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 3 } },
      { text: 'advanced auth realtime config', metadata: { parentId: 'p1', siblingIndex: 2, siblingCount: 3 } },
    ];

    const expanded = expandSiblings(results, allDocs);
    assert.equal(expanded.length, 3, '2 matched + 1 expanded sibling');
    assert.ok(expanded.some(r => r.text === 'advanced auth realtime config'), 'missing sibling should be pulled in');
    assert.ok(expanded.find(r => r._expanded)?.score < 1.0, 'expanded sibling should have lower score');
  });

  it('does NOT expand when <50% of siblings match', () => {
    const results = [
      { text: 'chunk 1', score: 0.9, metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 5 } },
    ];
    const allDocs = [
      { text: 'chunk 1', metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 5 } },
      { text: 'chunk 2', metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 5 } },
      { text: 'chunk 3', metadata: { parentId: 'p1', siblingIndex: 2, siblingCount: 5 } },
      { text: 'chunk 4', metadata: { parentId: 'p1', siblingIndex: 3, siblingCount: 5 } },
      { text: 'chunk 5', metadata: { parentId: 'p1', siblingIndex: 4, siblingCount: 5 } },
    ];

    const expanded = expandSiblings(results, allDocs);
    assert.equal(expanded.length, 1, 'should not expand — only 1/5 = 20% < 50%');
  });

  it('preserves results from other sections', () => {
    const results = [
      { text: 'supabase import', score: 1.0, metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 2 } },
      { text: 'supabase config', score: 0.9, metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 2 } },
      { text: 'unrelated clean code', score: 0.7, metadata: { parentId: 'p2', siblingIndex: 0, siblingCount: 1 } },
    ];
    const allDocs = [
      { text: 'supabase import', metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 2 } },
      { text: 'supabase config', metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 2 } },
    ];

    const expanded = expandSiblings(results, allDocs);
    assert.ok(expanded.some(r => r.text === 'unrelated clean code'), 'other sections should be preserved');
  });

  it('does not duplicate chunks already in results', () => {
    const results = [
      { text: 'chunk A', score: 1.0, metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 2 } },
      { text: 'chunk B', score: 0.9, metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 2 } },
    ];
    const allDocs = [
      { text: 'chunk A', metadata: { parentId: 'p1', siblingIndex: 0, siblingCount: 2 } },
      { text: 'chunk B', metadata: { parentId: 'p1', siblingIndex: 1, siblingCount: 2 } },
    ];

    const expanded = expandSiblings(results, allDocs);
    assert.equal(expanded.length, 2, 'no duplicates — all siblings already in results');
  });

  it('handles results without parentId gracefully', () => {
    const results = [
      { text: 'no parent', score: 0.9, metadata: {} },
      { text: 'also no parent', score: 0.8, metadata: { name: 'some-skill' } },
    ];

    const expanded = expandSiblings(results, []);
    assert.equal(expanded.length, 2, 'should pass through unchanged');
  });
});
