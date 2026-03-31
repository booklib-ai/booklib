import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolveBookLibPaths } from './paths.js';
import { BookLibIndexer } from './engine/indexer.js';

/**
 * Thrown when a skill source is not trusted and no `onPrompt` handler is provided
 * (or the user declined the prompt).
 */
export class RequiresConfirmationError extends Error {
  constructor(skill) {
    super(`Skill "${skill.name}" requires user confirmation before indexing (untrusted source).`);
    this.skill = skill;
  }
}

/**
 * Fetches a skill from its source (npm or GitHub raw URL) and indexes it locally.
 *
 * Usage:
 *   const fetcher = new SkillFetcher();
 *   await fetcher.fetch(skillDescriptor, {
 *     onPrompt: async (skill) => confirm(`Index "${skill.name}" from ${skill.source.type}?`),
 *   });
 */
export class SkillFetcher {
  constructor(options = {}) {
    this.paths = resolveBookLibPaths(options.projectCwd);
    this.indexer = new BookLibIndexer(this.paths.indexPath);
  }

  /**
   * Fetches and indexes a single skill.
   *
   * @param {object} skill - Skill descriptor (from SKILL_REGISTRY or DiscoveryEngine)
   * @param {object} opts
   * @param {Function} [opts.onPrompt] - async (skill) => boolean; called for untrusted sources.
   *   If omitted and source is untrusted, throws RequiresConfirmationError.
   */
  async fetch(skill, { onPrompt } = {}) {
    if (!skill.trusted) {
      if (typeof onPrompt !== 'function') {
        throw new RequiresConfirmationError(skill);
      }
      const confirmed = await onPrompt(skill);
      if (!confirmed) {
        throw new RequiresConfirmationError(skill);
      }
    }

    const content = await this._fetchContent(skill);
    const skillDir = this._skillDir(skill);

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);

    // Sync to ~/.claude/skills/ so Claude Code's native Skill tool can use it
    this._syncToClaudeSkills(skill, skillDir);

    console.log(`Indexing ${skill.name}...`);
    await this.indexer.indexDirectory(skillDir);
    console.log(`${skill.name} is ready.`);
  }

  /**
   * Returns true if the skill is already fetched locally.
   */
  isCached(skill) {
    return fs.existsSync(path.join(this._skillDir(skill), 'SKILL.md'));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _skillDir(skill) {
    const folderName = skill.name.replace(/[@/]/g, '_');
    return path.join(this.paths.cachePath, 'skills', folderName);
  }

  /**
   * Writes a clean SKILL.md to ~/.claude/skills/<name>/ so Claude Code's
   * native Skill tool (and obra/superpowers, ruflo) can load it directly.
   *
   * Strips BookLib's <framework> indexing wrapper — orchestrators expect
   * plain frontmatter + content, not BookLib's internal format.
   * Safe to call multiple times — overwrites only BookLib-managed files.
   */
  _syncToClaudeSkills(skill, skillDir) {
    try {
      const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
      const slugName = skill.name.replace(/["']/g, '').replace(/\s+/g, '-').toLowerCase();
      const destDir  = path.join(claudeSkillsDir, slugName);
      const destFile = path.join(destDir, 'SKILL.md');
      const srcFile  = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(srcFile)) return;

      // Don't overwrite user-managed directories (not created by us)
      const markerFile = path.join(destDir, '.booklib');
      if (fs.existsSync(destDir) && !fs.existsSync(markerFile)) return;

      fs.mkdirSync(destDir, { recursive: true });

      // Strip BookLib's <framework> wrapper for a clean Skill-tool-compatible file
      const raw = fs.readFileSync(srcFile, 'utf8');
      const clean = this._stripFrameworkWrapper(raw, skill);
      fs.writeFileSync(destFile, clean);
      fs.writeFileSync(markerFile, ''); // marker so we know we own this dir
    } catch {
      // Non-fatal — BookLib still works without the sync
    }
  }

  /**
   * Removes the ~/.claude/skills/<name> directory written by _syncToClaudeSkills.
   * Only removes BookLib-managed directories (those containing a .booklib marker).
   */
  desyncFromClaudeSkills(skill) {
    try {
      const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
      const slugName = skill.name.replace(/["']/g, '').replace(/\s+/g, '-').toLowerCase();
      const destDir  = path.join(claudeSkillsDir, slugName);
      if (!fs.existsSync(path.join(destDir, '.booklib'))) return; // not ours
      fs.rmSync(destDir, { recursive: true, force: true });
    } catch { /* non-fatal */ }
  }

  /**
   * Extracts clean content from BookLib's internal <framework>-wrapped format.
   * Produces a minimal frontmatter + raw content file suitable for the Skill tool.
   */
  _stripFrameworkWrapper(content, skill) {
    const desc = skill.description ? `description: ${skill.description.replace(/\n/g, ' ').slice(0, 200)}\n` : '';
    const frontmatter = `---\nname: ${skill.name}\n${desc}---\n\n`;

    // Extract content between <framework>...</framework> if present
    const match = content.match(/<framework>([\s\S]*?)<\/framework>/);
    if (match) return frontmatter + match[1].trim() + '\n';

    // Already clean (native SKILL.md from github-skills-dir sources) — strip our frontmatter and re-emit
    const withoutHeader = content.replace(/^---[\s\S]*?---\s*\n(#[^\n]+\n(>[^\n]*\n)?)?/, '').trim();
    return frontmatter + withoutHeader + '\n';
  }

  async _fetchContent(skill) {
    const { source } = skill;

    let raw;
    if (source.type === 'github') {
      raw = await this._fetchUrl(source.url);
    } else if (source.type === 'npm') {
      raw = await this._fetchFromNpm(source.package, source.path ?? 'SKILL.md');
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }

    // If content already has BookLib XML structure, return as-is.
    // Otherwise apply Universal Adapter: wrap in <framework> so the parser
    // produces structured chunks instead of one giant blob.
    if (raw.includes('<framework>') || raw.includes('<core_principles>')) {
      return raw;
    }

    const descFm = skill.description ? `description: ${skill.description.replace(/\n/g, ' ').slice(0, 200)}\n` : '';
    const descBody = skill.description ? `\n> ${skill.description}\n` : '';
    return `---
name: ${skill.name}
${descFm}source: ${source.url ?? source.package}
stars: ${skill.stars ?? 0}
---

# ${skill.name}
${descBody}
<framework>
${raw}
</framework>
`;
  }

  /**
   * Extracts a file from an npm package tarball without installing node_modules.
   * Uses `npm pack --dry-run` to get the tarball, then `tar` to extract one file.
   */
  _fetchFromNpm(packageName, filePath) {
    return new Promise((resolve, reject) => {
      try {
        const tmpDir = fs.mkdtempSync(path.join(this.paths.cachePath, 'npm-tmp-'));
        const tarball = execSync(`npm pack ${packageName} --quiet`, { cwd: tmpDir }).toString().trim();
        const tarballPath = path.join(tmpDir, tarball);
        const extracted = execSync(
          `tar -xOf "${tarballPath}" "package/${filePath}" 2>/dev/null || tar -xOf "${tarballPath}" "${filePath}"`,
          { cwd: tmpDir }
        ).toString();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve(extracted);
      } catch (err) {
        reject(new Error(`Failed to extract ${filePath} from npm package ${packageName}: ${err.message}`));
      }
    });
  }

  _fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const options = { headers: { 'User-Agent': 'booklib-fetcher/1.0' } };
      https.get(url, options, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchUrl(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}

// ── Three-tier skill install ─────────────────────────────────────────────────

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/**
 * Installs a skill using three-tier lookup:
 *   1. Already installed in ~/.claude/skills/<name>/ with .booklib marker → 'already-installed'
 *   2. Bundled in <packageRoot>/skills/<name>/SKILL.md → install via installBundledSkill → 'installed'
 *   3. Cached in ~/.booklib/skills/<name>/SKILL.md → copy to ~/.claude/skills/ → 'installed'
 *   4. None found → 'not-found'
 *
 * @param {string} skillName - skill directory name
 * @returns {'already-installed' | 'installed' | 'not-found'}
 */
export function installSkill(skillName) {
  const claudeDir = path.join(os.homedir(), '.claude', 'skills', skillName);

  // Already installed with BookLib marker
  if (fs.existsSync(path.join(claudeDir, '.booklib'))) return 'already-installed';

  // Try bundled
  const bundledPath = path.join(PACKAGE_ROOT, 'skills', skillName, 'SKILL.md');
  if (fs.existsSync(bundledPath)) {
    installBundledSkill(skillName);
    return 'installed';
  }

  // Try cache
  const { cachePath } = resolveBookLibPaths();
  const cachedPath = path.join(cachePath, 'skills', skillName, 'SKILL.md');
  if (fs.existsSync(cachedPath)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.copyFileSync(cachedPath, path.join(claudeDir, 'SKILL.md'));
    fs.writeFileSync(path.join(claudeDir, '.booklib'), '');
    return 'installed';
  }

  return 'not-found';
}

// ── Slot management ───────────────────────────────────────────────────────────

/**
 * Counts ALL skill directories in claudeSkillsDir (BookLib-managed or not).
 * Used for health-check warnings because Claude loads every skill at startup.
 *
 * @param {string} [claudeSkillsDir] - override for testing
 */
export function countAllSlots(claudeSkillsDir) {
  const dir = claudeSkillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .length;
  } catch { return 0; }
}

/**
 * Counts BookLib-managed skill slots in claudeSkillsDir.
 * Only counts dirs containing a `.booklib` marker (written by _syncToClaudeSkills).
 *
 * @param {string} [claudeSkillsDir] - override for testing
 */
export function countInstalledSlots(claudeSkillsDir) {
  const dir = claudeSkillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, '.booklib')))
      .length;
  } catch { return 0; }
}

/**
 * Returns names of all BookLib-managed installed skills.
 *
 * @param {string} [claudeSkillsDir] - override for testing
 */
export function listInstalledSkillNames(claudeSkillsDir) {
  const dir = claudeSkillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, '.booklib')))
      .map(d => d.name);
  } catch { return []; }
}

/**
 * Installs a bundled skill (from the package's skills/ dir) to ~/.claude/skills/.
 * No-ops if the destination exists and is not BookLib-managed.
 *
 * @param {string} skillName - directory name under skills/
 * @param {string} [claudeSkillsDir] - override for testing
 */
export function installBundledSkill(skillName, claudeSkillsDir) {
  const packageRoot   = path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const srcFile       = path.join(packageRoot, 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(srcFile)) throw new Error(`Bundled skill not found: ${skillName}`);

  const destBase = claudeSkillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  const destDir  = path.join(destBase, skillName);
  const marker   = path.join(destDir, '.booklib');

  if (fs.existsSync(destDir) && !fs.existsSync(marker)) return; // user-managed, skip

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcFile, path.join(destDir, 'SKILL.md'));
  fs.writeFileSync(marker, '');
}
