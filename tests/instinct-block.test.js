import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInstinctBlock } from '../lib/instinct-block.js';

test('MCP-capable tool returns null (no text instructions needed)', () => {
  const block = renderInstinctBlock('claude');
  assert.equal(block, null, 'MCP tools should not get text instructions');
});

test('non-MCP tool gets CLI commands', () => {
  const block = renderInstinctBlock('junie');
  assert.ok(block !== null, 'non-MCP should return content');
  assert.ok(block.includes('booklib search'), 'should reference CLI search');
  assert.ok(block.includes('booklib capture'), 'should reference CLI capture');
});

test('all MCP tools return null', () => {
  for (const tool of ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf', 'roo-code', 'goose', 'zed', 'continue']) {
    assert.equal(renderInstinctBlock(tool), null, `${tool} should return null`);
  }
});
