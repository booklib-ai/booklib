import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInstinctBlock } from '../lib/instinct-block.js';

test('MCP-capable tool gets MCP tool names', () => {
  const block = renderInstinctBlock('claude');
  assert.ok(block.includes('lookup'), 'should reference MCP tool name');
  assert.ok(block.includes('remember'), 'should reference remember');
  assert.ok(block.includes('verify'), 'should reference verify tool');
  assert.ok(block.includes('guard'), 'should reference guard tool');
  assert.ok(block.includes('booklib search "booklib mcp tools"'), 'should point to skill for full reference');
});

test('non-MCP tool gets CLI commands', () => {
  const block = renderInstinctBlock('junie');
  assert.ok(block.includes('booklib search'), 'should reference CLI command');
  assert.ok(!block.includes('lookup'), 'should not reference MCP tool name');
});

test('all MCP tools get MCP version', () => {
  for (const tool of ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf', 'roo-code', 'goose']) {
    const block = renderInstinctBlock(tool);
    assert.ok(block.includes('lookup'), `${tool} should get MCP version`);
  }
});
