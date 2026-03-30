import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ProjectInitializer } from '../../lib/project-initializer.js';

function makeInit(dir) {
  return new ProjectInitializer({ projectCwd: dir });
}

// ── Per-tool output ───────────────────────────────────────────────────────────

test('generateMcpConfigs writes .claude/settings.json for claude', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['claude'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .cursor/mcp.json for cursor', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['cursor'] });
  const mcp = JSON.parse(fs.readFileSync(path.join(dir, '.cursor', 'mcp.json'), 'utf8'));
  assert.deepStrictEqual(mcp.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .gemini/settings.json for gemini', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['gemini'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.gemini', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .codex/config.toml for codex', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['codex'] });
  const toml = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.includes('[mcp_servers.booklib]'), 'has section header');
  assert.ok(toml.includes('command = "booklib-mcp"'), 'has command');
  assert.ok(toml.includes('args = []'), 'has args');
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .zed/settings.json for zed', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['zed'] });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.zed', 'settings.json'), 'utf8'));
  assert.deepStrictEqual(
    settings['context_servers']['booklib-mcp'],
    { command: { path: 'booklib-mcp', args: [] } }
  );
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs writes .continue/mcpServers/booklib.yaml for continue', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  await makeInit(dir).generateMcpConfigs({ tools: ['continue'] });
  const yaml = fs.readFileSync(path.join(dir, '.continue', 'mcpServers', 'booklib.yaml'), 'utf8');
  assert.ok(yaml.includes('name: booklib'), 'has name');
  assert.ok(yaml.includes('command: booklib-mcp'), 'has command');
  assert.ok(yaml.includes('args: []'), 'has args');
  fs.rmSync(dir, { recursive: true });
});

// ── Merge behaviour ───────────────────────────────────────────────────────────

test('generateMcpConfigs merges into existing JSON without overwriting other servers', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const existing = { mcpServers: { 'other-server': { command: 'other', args: [] } } };
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(existing));

  await makeInit(dir).generateMcpConfigs({ tools: ['claude'] });

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.mcpServers['other-server'], { command: 'other', args: [] });
  assert.deepStrictEqual(settings.mcpServers.booklib, { command: 'booklib-mcp', args: [] });
  fs.rmSync(dir, { recursive: true });
});

test('generateMcpConfigs appends booklib section into existing TOML without altering other content', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bl-mcp-'));
  const codexDir = path.join(dir, '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'config.toml'), '[other_service]\nkey = "value"\n');

  await makeInit(dir).generateMcpConfigs({ tools: ['codex'] });

  const toml = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
  assert.ok(toml.includes('[other_service]'), 'preserves existing content');
  assert.ok(toml.includes('[mcp_servers.booklib]'), 'appends booklib section');
  fs.rmSync(dir, { recursive: true });
});
