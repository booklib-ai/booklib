import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDictatePrompt, buildSummarizePrompt } from '../../lib/engine/capture.js';

test('buildDictatePrompt contains raw text and required fields', () => {
  const prompt = buildDictatePrompt('rough ideas about auth');
  assert.ok(prompt.includes('rough ideas about auth'));
  assert.ok(prompt.includes('title'));
  assert.ok(prompt.includes('tags'));
});

test('buildSummarizePrompt contains conversation and required sections', () => {
  const prompt = buildSummarizePrompt('User: question\nAssistant: answer', 'My title');
  assert.ok(prompt.includes('User: question'));
  assert.ok(prompt.includes('Key Decisions'));
  assert.ok(prompt.includes('My title'));
});
