import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const BOOKLIB_MCP_ENTRY = { command: 'booklib-mcp', args: [] };

export function writeMCPConfig(tool, cwd = process.cwd()) {
  switch (tool) {
    case 'claude':
      return writeClaudeMCP();
    case 'cursor':
      return writeJSON(path.join(cwd, '.cursor', 'mcp.json'), 'mcpServers');
    case 'copilot':
      return writeJSON(path.join(cwd, '.vscode', 'mcp.json'), 'servers');
    case 'gemini':
      return writeJSON(path.join(cwd, '.gemini', 'settings.json'), 'mcpServers');
    case 'codex':
      return writeTOML(path.join(cwd, '.codex', 'config.toml'));
    case 'roo-code':
      return writeJSON(path.join(cwd, '.roo', 'mcp.json'), 'mcpServers');
    case 'windsurf':
      return writeJSON(path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'), 'mcpServers');
    case 'goose':
      return writeGooseYAML(path.join(cwd, '.goose', 'config.yaml'));
    case 'zed':
      return writeJSON(path.join(cwd, '.zed', 'settings.json'), 'context_servers');
    case 'continue':
      return writeContinueYAML(path.join(cwd, '.continue', 'mcpServers', 'booklib.yaml'));
    default:
      return null; // not MCP-capable
  }
}

function writeClaudeMCP() {
  try {
    // Check if already registered
    const list = execFileSync('claude', ['mcp', 'list'], { encoding: 'utf8', timeout: 5000 });
    if (list.includes('booklib')) return 'claude-mcp'; // already registered
  } catch {
    // claude CLI not available — fall back to project-level settings.json
    // This won't work for MCP, but at least won't crash
    return null;
  }
  try {
    execFileSync('claude', ['mcp', 'add', 'booklib', 'booklib-mcp'], { encoding: 'utf8', timeout: 10000 });
    return 'claude-mcp';
  } catch {
    return null;
  }
}

function writeJSON(filePath, rootKey) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let config = {};
  if (fs.existsSync(filePath)) {
    try { config = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { config = {}; }
  }
  if (!config[rootKey]) config[rootKey] = {};
  config[rootKey].booklib = BOOKLIB_MCP_ENTRY;
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  return filePath;
}

function writeTOML(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const section = '\n[mcp_servers.booklib]\ncommand = "booklib-mcp"\nargs = []\n';
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('[mcp_servers.booklib]')) return filePath; // already exists
    fs.appendFileSync(filePath, section);
  } else {
    fs.writeFileSync(filePath, section.trim() + '\n');
  }
  return filePath;
}

function writeGooseYAML(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const entry = '\nmcp_servers:\n  booklib:\n    command: booklib-mcp\n    args: []\n';
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('booklib:')) return filePath; // already exists
    if (content.includes('mcp_servers:')) {
      // Append under existing mcp_servers section
      const updated = content.replace('mcp_servers:', 'mcp_servers:\n  booklib:\n    command: booklib-mcp\n    args: []');
      fs.writeFileSync(filePath, updated);
    } else {
      fs.appendFileSync(filePath, entry);
    }
  } else {
    fs.writeFileSync(filePath, entry.trim() + '\n');
  }
  return filePath;
}

function writeContinueYAML(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = 'name: booklib\ncommand: booklib-mcp\nargs: []\n';
  fs.writeFileSync(filePath, content);
  return filePath;
}

export const MCP_CAPABLE = new Set([
  'claude', 'cursor', 'copilot', 'gemini', 'codex',
  'windsurf', 'roo-code', 'goose', 'zed', 'continue',
]);
