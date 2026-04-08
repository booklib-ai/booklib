// tests/wizard/prompt.test.js
import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sep, formatProgress, LEGENDS } from '../../lib/wizard/prompt.js';

test('sep returns correct length string', () => {
  assert.equal(sep('─', 10).length, 10);
  assert.equal(sep('─', 10), '──────────');
});

test('formatProgress renders bar', () => {
  const s = formatProgress(15, 30, 20);
  assert.ok(s.includes('15/30'));
  assert.ok(s.includes('█'));
  assert.ok(s.includes('░'));
});

describe('Navigation legend shows colored key hints for each prompt type', () => {
  it('select legend shows navigate and select keys', () => {
    const legend = LEGENDS.select();
    assert.ok(legend.includes('↑↓'), 'should show arrow keys');
    assert.ok(legend.includes('navigate'), 'should label navigation');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('select'), 'should label selection');
  });

  it('multiselect legend shows navigate, toggle, all, and submit keys', () => {
    const legend = LEGENDS.multiselect();
    assert.ok(legend.includes('↑↓'), 'should show arrow keys');
    assert.ok(legend.includes('space'), 'should show space key');
    assert.ok(legend.includes('toggle'), 'should label toggling');
    assert.ok(legend.includes('a'), 'should show "a" for all');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('submit'), 'should label submission');
  });

  it('confirm legend shows switch and confirm keys', () => {
    const legend = LEGENDS.confirm();
    assert.ok(legend.includes('←→'), 'should show left/right arrows');
    assert.ok(legend.includes('switch'), 'should label switching');
    assert.ok(legend.includes('enter'), 'should show enter key');
    assert.ok(legend.includes('confirm'), 'should label confirmation');
  });

  it('all legends are single-line for clean rendering', () => {
    for (const [name, fn] of Object.entries(LEGENDS)) {
      const legend = fn();
      const lines = legend.split('\n').filter(l => l.trim());
      assert.equal(lines.length, 1, `${name} legend should be a single line`);
    }
  });
});
