import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { prioritizeLookupResults } from '../../lib/engine/lookup-priority.js';

describe('prioritizeLookupResults', () => {
  it('post-training results come first', () => {
    const gap = [{ id: 'gap:stripe', type: 'post-training' }];
    const team = [{ id: 'team:auth-strategy', type: 'decision' }];
    const niche = [{ id: 'skill:clean-code', type: 'skill' }];

    const result = prioritizeLookupResults({
      gapResults: gap,
      teamResults: team,
      nicheResults: niche,
    });

    assert.equal(result[0].id, 'gap:stripe', 'gap result should be first');
    assert.equal(result[1].id, 'team:auth-strategy', 'team result should be second');
  });

  it('excludes niche skills when gaps + team >= 2', () => {
    const gap = [{ id: 'gap:next', type: 'post-training' }];
    const team = [{ id: 'team:api-style', type: 'decision' }];
    const niche = [{ id: 'skill:effective-ts', type: 'skill' }];

    const result = prioritizeLookupResults({
      gapResults: gap,
      teamResults: team,
      nicheResults: niche,
    });

    assert.equal(result.length, 2, 'should only have gap + team');
    assert.ok(
      !result.some(r => r.id === 'skill:effective-ts'),
      'niche skill should be excluded',
    );
  });

  it('includes niche skills when gaps + team < 2', () => {
    const gap = [{ id: 'gap:prisma', type: 'post-training' }];
    const niche = [
      { id: 'skill:clean-code', type: 'skill' },
      { id: 'skill:effective-ts', type: 'skill' },
    ];

    const result = prioritizeLookupResults({
      gapResults: gap,
      teamResults: [],
      nicheResults: niche,
    });

    assert.equal(result.length, 3, 'should include gap + both niche');
    assert.equal(result[0].id, 'gap:prisma', 'gap should still be first');
    assert.equal(result[1].id, 'skill:clean-code');
    assert.equal(result[2].id, 'skill:effective-ts');
  });
});
