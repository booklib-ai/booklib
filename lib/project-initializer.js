import fs from 'fs';
import path from 'path';
import https from 'https';
import { parseSkillFile } from './engine/parser.js';
import { BookLibScanner } from './engine/scanner.js';
import { resolveBookLibPaths } from './paths.js';
import { loadConfig } from './config-loader.js';

/**
 * Generates tool-specific context files from BookLib skills.
 *
 * Supported targets:
 *   cursor   → .cursor/rules/booklib-standards.mdc
 *   claude   → CLAUDE.md  (appends a standards section)
 *   copilot  → .github/copilot-instructions.md
 *   gemini   → .gemini/context.md
 *   all      → all of the above
 */
export class ProjectInitializer {
  constructor(options = {}) {
    this.paths = resolveBookLibPaths(options.projectCwd);
    this.projectCwd = options.projectCwd ?? process.cwd();
    this.config = loadConfig(options.projectCwd);
    this.scanner = new BookLibScanner();
  }

  /**
   * Detects which skills are relevant to the project via scan, returns skill names.
   */
  detectRelevantSkills() {
    const files = this.scanner.getFiles(this.projectCwd);
    const seen = new Set();
    for (const file of files) {
      const skill = this.scanner.detectSkill(file);
      if (skill) seen.add(skill);
    }
    return [...seen];
  }

  /**
   * Main entry point. Detects or uses provided skills, then writes context files.
   *
   * @param {object} opts
   * @param {string[]} [opts.skills]  - explicit skill names; auto-detected if omitted
   * @param {string}   opts.target    - 'cursor' | 'claude' | 'copilot' | 'gemini' | 'all'
   * @param {boolean}  [opts.dryRun]  - print what would be written, don't write
   * @returns {string[]} list of files written
   */
  async init({ skills, target = 'all', dryRun = false } = {}) {
    const skillNames = skills?.length ? skills : this.detectRelevantSkills();
    if (skillNames.length === 0) {
      throw new Error('No relevant skills detected. Pass --skills explicitly or run booklib index first.');
    }

    const blocks = this._extractBlocks(skillNames);
    const ALL_TARGETS = ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf'];
    const targets = target === 'all'
      ? ALL_TARGETS
      : target.split(',').map(t => t.trim());

    const MARKER_START = '<!-- booklib-standards-start -->';
    const MARKER_RE = /<!-- booklib-standards-start -->[\s\S]*?<!-- booklib-standards-end -->/;

    const written = [];
    for (const t of targets) {
      const { filePath, content, fileHeader } = this._render(t, blocks, skillNames);
      const absPath = path.join(this.projectCwd, filePath);
      if (dryRun) {
        console.log(`\n[dry-run] Would write: ${filePath}\n${'─'.repeat(60)}\n${content.slice(0, 400)}…`);
      } else {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        if (fileHeader === null) {
          // booklib owns this file entirely (cursor) — always overwrite
          fs.writeFileSync(absPath, content);
        } else if (fs.existsSync(absPath)) {
          const existing = fs.readFileSync(absPath, 'utf8');
          if (existing.includes(MARKER_START)) {
            // Update only the booklib section, preserve everything else
            fs.writeFileSync(absPath, existing.replace(MARKER_RE, content));
          } else {
            // File exists with no booklib section — append it
            fs.appendFileSync(absPath, `\n\n${content}`);
          }
        } else {
          // New file — write header + booklib section
          fs.writeFileSync(absPath, `${fileHeader}${content}`);
        }
        written.push(filePath);
        console.log(`  ✅ ${filePath}`);
      }
    }
    return written;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Reads each skill's SKILL.md and extracts framework + pitfall blocks.
   */
  _extractBlocks(skillNames) {
    const blocks = [];
    for (const name of skillNames) {
      const skillPath = path.join(this.paths.skillsPath, name, 'SKILL.md');
      const cachePath = path.join(this.paths.cachePath, 'skills', name, 'SKILL.md');
      const mdPath = fs.existsSync(skillPath) ? skillPath : fs.existsSync(cachePath) ? cachePath : null;
      if (!mdPath) continue;

      const content = fs.readFileSync(mdPath, 'utf8');
      const chunks = parseSkillFile(content, mdPath);

      const framework = chunks.find(c =>
        c.metadata.type === 'framework' || c.metadata.type === 'core_principles'
      )?.text ?? null;

      const pitfalls = chunks.find(c =>
        c.metadata.type === 'pitfalls' || c.metadata.type === 'anti_patterns'
      )?.text ?? null;

      if (framework || pitfalls) {
        blocks.push({ skill: name, framework, pitfalls });
      }
    }
    return blocks;
  }

  /**
   * Renders extracted blocks into a tool-specific file.
   */
  _render(target, blocks, skillNames) {
    const principles = blocks
      .filter(b => b.framework)
      .map(b => `### From ${b.skill}\n\n${b.framework.trim()}`)
      .join('\n\n---\n\n');

    const antiPatterns = blocks
      .filter(b => b.pitfalls)
      .map(b => `### From ${b.skill}\n\n${b.pitfalls.trim()}`)
      .join('\n\n---\n\n');

    const sources = skillNames.join(', ');
    const generated = `Generated by BookLib from: ${sources}`;

    switch (target) {
      case 'cursor':
        // booklib owns .cursor/rules/booklib-standards.mdc — full overwrite, fileHeader: null signals that
        return {
          filePath: '.cursor/rules/booklib-standards.mdc',
          fileHeader: null,
          content: `---
description: Coding standards synthesized from ${sources}
alwaysApply: true
---

<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
`,
        };

      case 'claude':
        return {
          filePath: 'CLAUDE.md',
          fileHeader: '',
          content: `<!-- booklib-standards-start -->
## Coding Standards

> ${generated}

### Principles

${principles || '_No structured principles found._'}

### Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->`,
        };

      case 'copilot':
        return {
          filePath: '.github/copilot-instructions.md',
          fileHeader: '# Copilot Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## What to follow

${principles || '_No structured principles found._'}

## What to avoid

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
        };

      case 'gemini':
        return {
          filePath: '.gemini/context.md',
          fileHeader: '# Project Context\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found._'}

## Anti-Patterns

${antiPatterns || '_No anti-patterns found._'}
<!-- booklib-standards-end -->
`,
        };

      case 'codex':
        return {
          filePath: 'AGENTS.md',
          fileHeader: '# Agent Instructions\n\n',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Coding Standards

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
<!-- booklib-standards-end -->
`,
        };

      case 'windsurf':
        return {
          filePath: '.windsurfrules',
          fileHeader: '',
          content: `<!-- booklib-standards-start -->
<!-- ${generated} -->

## Core Principles

${principles || '_No structured principles found in selected skills._'}

## Anti-Patterns to Avoid

${antiPatterns || '_No anti-patterns found in selected skills._'}
<!-- booklib-standards-end -->
`,
        };

      default:
        throw new Error(`Unknown target: ${target}. Use claude, cursor, copilot, gemini, codex, windsurf, or all.`);
    }
  }

  // ── ECC Artifact fetching ──────────────────────────────────────────────────

  /**
   * Pulls rules/, agents/, and commands/ from all configured github-skills-dir sources.
   *
   * Sources opt in by including an "artifacts" array in booklib.config.json:
   *   { "type": "github-skills-dir", "repo": "...", "artifacts": ["rules", "agents", "commands"] }
   *
   * When multiple sources export the same artifact type, files are prefixed with the repo
   * slug (last path segment of owner/repo) to avoid collisions.
   *
   * @param {object}   opts
   * @param {string[]|null} [opts.languages]       - language folders for rules/ (null = all)
   * @param {boolean}  [opts.includeAgents]        - pull agents/ → .claude/agents/
   * @param {boolean}  [opts.includeCommands]      - pull commands/ → .claude/commands/
   * @param {boolean}  [opts.dryRun]               - print what would be written without writing
   * @returns {string[]} list of files written
   */
  async fetchEccArtifacts({ languages = null, includeAgents = true, includeCommands = true, dryRun = false } = {}) {
    const artifactSources = this.config.sources.filter(
      s => s.type === 'github-skills-dir' && Array.isArray(s.artifacts) && s.artifacts.length > 0
    );

    if (artifactSources.length === 0) {
      throw new Error(
        'No artifact-capable sources found. Add "artifacts": ["rules","agents","commands"] to a ' +
        'github-skills-dir entry in booklib.config.json.'
      );
    }

    // Determine which artifact types appear in more than one source — those need a prefix.
    const typeCounts = { rules: 0, agents: 0, commands: 0 };
    for (const src of artifactSources) {
      if (src.artifacts.includes('rules'))    typeCounts.rules++;
      if (src.artifacts.includes('agents'))   typeCounts.agents++;
      if (src.artifacts.includes('commands')) typeCounts.commands++;
    }

    const written = [];

    for (const source of artifactSources) {
      const { repo, branch = 'main', artifacts: artifactList } = source;
      // Derive a short slug from the repo name (owner/repo → repo segment)
      const slug = repo.split('/').pop().replace(/[^a-z0-9]/gi, '-').toLowerCase();

      if (languages !== false && artifactList.includes('rules')) {
        const prefix = typeCounts.rules > 1 ? `${slug}-` : '';
        written.push(...await this._pullRules(repo, branch, languages, dryRun, prefix));
      }
      if (includeAgents && artifactList.includes('agents')) {
        const prefix = typeCounts.agents > 1 ? `${slug}-` : '';
        written.push(...await this._pullDir(repo, branch, 'agents', '.claude/agents', dryRun, prefix));
      }
      if (includeCommands && artifactList.includes('commands')) {
        const prefix = typeCounts.commands > 1 ? `${slug}-` : '';
        written.push(...await this._pullDir(repo, branch, 'commands', '.claude/commands', dryRun, prefix));
      }
    }

    return written;
  }

  /** Pulls rules/<language>/*.md → .cursor/rules/[prefix]<language>-<file>.mdc */
  async _pullRules(repo, branch, languages, dryRun, prefix = '') {
    const written = [];
    let langDirs;
    try {
      const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/rules`);
      if (!Array.isArray(entries)) return [];
      langDirs = entries.filter(e => e.type === 'dir').map(e => e.name);
    } catch {
      return [];
    }

    if (languages && languages.length > 0) {
      langDirs = langDirs.filter(d => languages.includes(d));
    }

    for (const lang of langDirs) {
      let files;
      try {
        const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/rules/${lang}`);
        files = Array.isArray(entries) ? entries.filter(e => e.type === 'file' && e.name.endsWith('.md')) : [];
      } catch {
        continue;
      }

      for (const file of files) {
        const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/rules/${lang}/${file.name}`;
        const destName = `${prefix}${lang}-${file.name.replace(/\.md$/, '.mdc')}`;
        const destPath = `.cursor/rules/${destName}`;
        const absPath = path.join(this.projectCwd, destPath);

        if (dryRun) {
          console.log(`[dry-run] Would write: ${destPath} (from ${rawUrl})`);
          written.push(destPath);
          continue;
        }

        let content;
        try { content = await this._fetchText(rawUrl); } catch { continue; }

        if (!content.trimStart().startsWith('---')) {
          content = `---\ndescription: ${lang} ${file.name.replace('.md', '')} rules\nalwaysApply: false\n---\n\n${content}`;
        }

        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content);
        console.log(`  ✅ ${destPath}`);
        written.push(destPath);
      }
    }

    return written;
  }

  /** Pulls <srcDir>/*.md → <destDir>/[prefix]<file>.md */
  async _pullDir(repo, branch, srcDir, destDir, dryRun, prefix = '') {
    const written = [];
    let files;
    try {
      const entries = await this._fetchJson(`https://api.github.com/repos/${repo}/contents/${srcDir}`);
      files = Array.isArray(entries) ? entries.filter(e => e.type === 'file' && e.name.endsWith('.md')) : [];
    } catch {
      return [];
    }

    for (const file of files) {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${srcDir}/${file.name}`;
      const destPath = `${destDir}/${prefix}${file.name}`;
      const absPath = path.join(this.projectCwd, destPath);

      if (dryRun) {
        console.log(`[dry-run] Would write: ${destPath} (from ${rawUrl})`);
        written.push(destPath);
        continue;
      }

      let content;
      try { content = await this._fetchText(rawUrl); } catch { continue; }

      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content);
      console.log(`  ✅ ${destPath}`);
      written.push(destPath);
    }

    return written;
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'booklib-init/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchJson(res.headers.location));
        }
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
      }).on('error', reject);
    });
  }

  _fetchText(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'booklib-init/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this._fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}
