import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Detects which AI coding agents are present in the project or on $PATH.
 * Always returns at least ['claude'].
 */
export class AgentDetector {
  /**
   * @param {object} opts
   * @param {string}  [opts.cwd]       - project root to check for config dirs/files
   * @param {boolean} [opts.checkPath] - whether to check $PATH (default true)
   */
  constructor({ cwd = process.cwd(), checkPath = true } = {}) {
    this.cwd = cwd;
    this.checkPath = checkPath;
  }

  detect() {
    const found = new Set(['claude']); // always present

    const DIR_SIGNALS = {
      cursor:    ['.cursor'],
      'roo-code':  ['.roo'],
      openhands: ['.openhands'],
      junie:     ['.junie'],
      goose:     ['.goose'],
      letta:     ['.letta'],
      windsurf:  ['.windsurf'],
      gemini:    ['.gemini'],
    };

    const FILE_SIGNALS = {
      opencode: ['opencode.toml'],
      copilot:  ['.github/copilot-instructions.md'],
    };

    const PATH_SIGNALS = {
      cursor:   'cursor',
      codex:    'codex',
      windsurf: 'windsurf',
      gemini:   'gemini',
      goose:    'goose',
      opencode: 'opencode',
    };

    for (const [agent, dirs] of Object.entries(DIR_SIGNALS)) {
      if (dirs.some(dir => fs.existsSync(path.join(this.cwd, dir)))) {
        found.add(agent);
      }
    }

    for (const [agent, files] of Object.entries(FILE_SIGNALS)) {
      if (files.some(file => fs.existsSync(path.join(this.cwd, file)))) {
        found.add(agent);
      }
    }

    if (this.checkPath) {
      for (const [agent, bin] of Object.entries(PATH_SIGNALS)) {
        if (this._inPath(bin)) found.add(agent);
      }
    }

    return [...found];
  }

  _inPath(bin) {
    try {
      const cmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
