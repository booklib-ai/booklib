import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentDetector } from '../lib/agent-detector.js';

function tmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'booklib-detect-test-'));
}

test('always detects claude', () => {
  const cwd = tmpDir();
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(detected.includes('claude'), 'claude should always be detected');
  rmSync(cwd, { recursive: true });
});

test('detects cursor when .cursor/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.cursor'));
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(detected.includes('cursor'), 'cursor not detected from .cursor/');
  rmSync(cwd, { recursive: true });
});

test('detects roo-code when .roo/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.roo'));
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(detected.includes('roo-code'), 'roo-code not detected from .roo/');
  rmSync(cwd, { recursive: true });
});

test('detects junie when .junie/ directory exists', () => {
  const cwd = tmpDir();
  mkdirSync(path.join(cwd, '.junie'));
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(detected.includes('junie'));
  rmSync(cwd, { recursive: true });
});

test('does not detect goose when no signals present', () => {
  const cwd = tmpDir();
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(!detected.includes('goose'), 'goose falsely detected');
  rmSync(cwd, { recursive: true });
});

test('detects opencode when opencode.toml exists', () => {
  const cwd = tmpDir();
  writeFileSync(path.join(cwd, 'opencode.toml'), '');
  const detector = new AgentDetector({ cwd, checkPath: false });
  const detected = detector.detect();
  assert.ok(detected.includes('opencode'));
  rmSync(cwd, { recursive: true });
});

test('detects copilot when VS Code extension directory exists', () => {
  const cwd = tmpDir();
  const home = tmpDir();
  mkdirSync(path.join(home, '.vscode', 'extensions', 'github.copilot-1.234.0'), { recursive: true });
  const detector = new AgentDetector({ cwd, checkPath: false, home });
  const detected = detector.detect();
  assert.ok(detected.includes('copilot'), 'copilot not detected from VS Code extension');
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});

test('does not detect copilot when no VS Code extensions exist', () => {
  const cwd = tmpDir();
  const home = tmpDir();
  const detector = new AgentDetector({ cwd, checkPath: false, home });
  const detected = detector.detect();
  assert.ok(!detected.includes('copilot'), 'copilot falsely detected');
  rmSync(cwd, { recursive: true });
  rmSync(home, { recursive: true });
});
