import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeMCPConfig, MCP_CAPABLE } from '../lib/mcp-config-writer.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-mcp-test-'));
}

test('claude MCP uses claude CLI (returns claude-mcp or null)', () => {
  // writeMCPConfig('claude') now calls `claude mcp add` instead of writing JSON.
  // In test environments without the claude CLI, it returns null gracefully.
  const result = writeMCPConfig('claude', tmpDir());
  // Result is 'claude-mcp' if claude CLI is available, null otherwise
  assert.ok(result === 'claude-mcp' || result === null);
});

test('writes copilot MCP config with servers key', () => {
  const cwd = tmpDir();
  writeMCPConfig('copilot', cwd);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, '.vscode', 'mcp.json'), 'utf8'));
  assert.ok(config.servers.booklib, 'copilot should use "servers" root key');
  assert.ok(!config.mcpServers, 'copilot should NOT have mcpServers');
  fs.rmSync(cwd, { recursive: true });
});

test('writes roo-code MCP config', () => {
  const cwd = tmpDir();
  writeMCPConfig('roo-code', cwd);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, '.roo', 'mcp.json'), 'utf8'));
  assert.ok(config.mcpServers.booklib);
  fs.rmSync(cwd, { recursive: true });
});

test('merges with existing JSON config', () => {
  const cwd = tmpDir();
  const configDir = path.join(cwd, '.cursor');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } } }));
  writeMCPConfig('cursor', cwd);
  const config = JSON.parse(fs.readFileSync(path.join(configDir, 'mcp.json'), 'utf8'));
  assert.ok(config.mcpServers.booklib, 'booklib should be added');
  assert.ok(config.mcpServers.other, 'existing server should be preserved');
  fs.rmSync(cwd, { recursive: true });
});

test('returns null for non-MCP tool', () => {
  const result = writeMCPConfig('junie', '/tmp');
  assert.strictEqual(result, null);
});

test('MCP_CAPABLE includes 10 tools', () => {
  assert.strictEqual(MCP_CAPABLE.size, 10);
  assert.ok(MCP_CAPABLE.has('copilot'));
  assert.ok(MCP_CAPABLE.has('roo-code'));
  assert.ok(!MCP_CAPABLE.has('junie'));
});

test('MCP server version reads from package.json, not hardcoded', () => {
  const pkgDir = path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const mcpSource = fs.readFileSync(path.join(pkgDir, 'bin', 'booklib-mcp.js'), 'utf8');

  // Should NOT contain a hardcoded version string
  assert.ok(!mcpSource.includes('version: "3.'), 'MCP server should not hardcode version');
  // Should reference package.json dynamically
  assert.ok(mcpSource.includes('__pkg.version'), 'MCP server should read version from package.json');
});
