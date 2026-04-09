import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the arg parser logic used by save-state CLI command
function parseSaveStateArgs(stateArgs) {
  const parsed = {};
  for (let i = 0; i < stateArgs.length; i++) {
    const a = stateArgs[i];
    if (!a.startsWith('--')) continue;
    const stripped = a.replace(/^--/, '');
    if (stripped.includes('=')) {
      const [k, ...v] = stripped.split('=');
      parsed[k] = v.join('=');
    } else if (i + 1 < stateArgs.length && !stateArgs[i + 1].startsWith('--')) {
      parsed[stripped] = stateArgs[++i];
    }
  }
  return parsed;
}

describe('save-state arg parser handles both --key=value and --key value', () => {
  it('parses --key=value syntax', () => {
    const result = parseSaveStateArgs(['--goal=Build payment API', '--next=Add tests']);
    assert.equal(result.goal, 'Build payment API');
    assert.equal(result.next, 'Add tests');
  });

  it('parses --key value syntax (space-separated)', () => {
    const result = parseSaveStateArgs(['--goal', 'Build payment API', '--next', 'Add tests']);
    assert.equal(result.goal, 'Build payment API');
    assert.equal(result.next, 'Add tests');
  });

  it('handles mixed syntax', () => {
    const result = parseSaveStateArgs(['--goal=Build API', '--next', 'Add tests', '--progress=Phase 2']);
    assert.equal(result.goal, 'Build API');
    assert.equal(result.next, 'Add tests');
    assert.equal(result.progress, 'Phase 2');
  });

  it('handles values containing = sign', () => {
    const result = parseSaveStateArgs(['--goal=key=value pairs work']);
    assert.equal(result.goal, 'key=value pairs work');
  });

  it('ignores flags with no value', () => {
    const result = parseSaveStateArgs(['--goal', '--next', 'Add tests']);
    assert.equal(result.goal, undefined, 'flag followed by flag should not capture');
    assert.equal(result.next, 'Add tests');
  });
});
