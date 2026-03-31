import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInstinctBlock } from '../lib/instinct-block.js';

test('MCP-capable tool gets MCP tool names', () => {
  const block = renderInstinctBlock('claude');
  assert.ok(block.includes('search_skills'), 'should reference MCP tool name');
  assert.ok(block.includes('create_note'), 'should reference create_note');
  assert.ok(!block.includes('booklib search'), 'should not reference CLI command');
});

test('non-MCP tool gets CLI commands', () => {
  const block = renderInstinctBlock('junie');
  assert.ok(block.includes('booklib search'), 'should reference CLI command');
  assert.ok(!block.includes('search_skills'), 'should not reference MCP tool name');
});

test('all MCP tools get MCP version', () => {
  for (const tool of ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf', 'roo-code', 'goose']) {
    const block = renderInstinctBlock(tool);
    assert.ok(block.includes('search_skills'), `${tool} should get MCP version`);
  }
});
