import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── get_context ───────────────────────────────────────────────────────────────

test('ContextBuilder.build returns a non-empty string for a valid task', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.build('implement null safety in Kotlin');
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});

test('ContextBuilder.buildWithGraph returns skill context even with no file', async (t) => {
  const { ContextBuilder } = await import('../../lib/context-builder.js');
  const builder = new ContextBuilder();
  const result = await builder.buildWithGraph('implement null safety in Kotlin', null);
  assert.ok(typeof result === 'string', 'result is a string');
  assert.ok(result.length > 50, 'result has meaningful content');
});
