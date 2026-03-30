// lib/rules/rules-manager.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const RULES_DIR = path.join(PACKAGE_ROOT, 'rules');

function markerStart(lang) { return `<!-- booklib-rules-${lang}-start -->`; }
function markerEnd(lang)   { return `<!-- booklib-rules-${lang}-end -->`; }
function escapeRegex(s)    { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function _ensureAlwaysApply(content) {
  if (!content.trimStart().startsWith('---')) {
    // No frontmatter — add complete block
    return `---\nalwaysApply: false\n---\n\n${content}`;
  }
  // Has frontmatter — check if alwaysApply is already set
  if (content.includes('alwaysApply:')) return content;
  // Inject alwaysApply before the closing ---
  // Frontmatter ends at the first \n---\n (or \n--- at EOF) after the opening ---
  const fmEnd = content.indexOf('\n---', 3); // skip the opening ---
  if (fmEnd === -1) return content; // malformed, leave as-is
  return content.slice(0, fmEnd) + '\nalwaysApply: false' + content.slice(fmEnd);
}

/**
 * Lists all bundled language rule sets with project/global install status.
 */
export function listAvailable(cwd = process.cwd(), home = os.homedir()) {
  if (!fs.existsSync(RULES_DIR)) return [];

  const claudeMdPath = path.join(home, '.claude', 'CLAUDE.md');
  const claudeMdContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';

  const langDirs = fs.readdirSync(RULES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  return langDirs.map(lang => {
    const files = fs.readdirSync(path.join(RULES_DIR, lang))
      .filter(f => f.endsWith('.md'));

    const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
    const installedProject = fs.existsSync(cursorRulesDir) &&
      fs.readdirSync(cursorRulesDir).some(f => f.startsWith(`${lang}-`) && f.endsWith('.mdc'));

    const installedGlobal = claudeMdContent.includes(markerStart(lang));

    return { lang, files, installedProject, installedGlobal };
  });
}

/**
 * Installs a language rule set to the project (.cursor/rules/) or globally (~/.claude/CLAUDE.md).
 *
 * @param {string} lang
 * @param {{ cwd?, home?, global?, dryRun? }} opts
 * @returns {string[]} written file paths
 */
export function installRule(lang, {
  cwd = process.cwd(),
  home = os.homedir(),
  global: isGlobal = false,
  dryRun = false,
} = {}) {
  const langDir = path.join(RULES_DIR, lang);
  if (!fs.existsSync(langDir)) {
    const available = fs.readdirSync(RULES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    throw new Error(`Unknown language: '${lang}'. Available: ${available.join(', ')}`);
  }

  const mdFiles = fs.readdirSync(langDir).filter(f => f.endsWith('.md'));
  if (mdFiles.length === 0) return [];

  return isGlobal
    ? _installGlobal(lang, langDir, mdFiles, home, dryRun)
    : _installProject(lang, langDir, mdFiles, cwd, dryRun);
}

function _installProject(lang, langDir, mdFiles, cwd, dryRun) {
  const destDir = path.join(cwd, '.cursor', 'rules');
  const written = [];

  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const file of mdFiles) {
    const content = _ensureAlwaysApply(fs.readFileSync(path.join(langDir, file), 'utf8'));
    const destPath = path.join(destDir, `${lang}-${file.replace(/\.md$/, '.mdc')}`);
    if (!dryRun) {
      fs.writeFileSync(destPath, content);
    }
    written.push(destPath);
  }
  return written;
}

function _installGlobal(lang, langDir, mdFiles, home, dryRun) {
  const claudeDir    = path.join(home, '.claude');
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  const body = mdFiles
    .map(f => fs.readFileSync(path.join(langDir, f), 'utf8'))
    .join('\n\n');

  const section = [
    markerStart(lang),
    `## ${lang.charAt(0).toUpperCase() + lang.slice(1)} Standards (BookLib)`,
    '',
    body,
    markerEnd(lang),
  ].join('\n');

  if (!dryRun) {
    fs.mkdirSync(claudeDir, { recursive: true });
    let existing = '';
    try { existing = fs.readFileSync(claudeMdPath, 'utf8'); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    const re = new RegExp(
      `${escapeRegex(markerStart(lang))}[\\s\\S]*?${escapeRegex(markerEnd(lang))}`,
    );
    const updated = existing.includes(markerStart(lang))
      ? existing.replace(re, section)
      : (existing ? `${existing}\n\n${section}\n` : `${section}\n`);

    fs.writeFileSync(claudeMdPath, updated);
  }
  return [claudeMdPath];
}

/**
 * Returns sizes of all installed rules in the current project and globally.
 */
export function status(cwd = process.cwd(), home = os.homedir()) {
  const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
  const claudeMdPath   = path.join(home, '.claude', 'CLAUDE.md');

  const cursor = [];
  if (fs.existsSync(cursorRulesDir)) {
    for (const file of fs.readdirSync(cursorRulesDir)) {
      if (!file.endsWith('.mdc')) continue;
      const p = path.join(cursorRulesDir, file);
      cursor.push({ path: p, sizeBytes: fs.statSync(p).size });
    }
  }

  const globalEntries = [];
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const re = /<!-- booklib-rules-(\w+)-start -->([\s\S]*?)<!-- booklib-rules-\1-end -->/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      globalEntries.push({ lang: match[1], sizeBytes: Buffer.byteLength(match[0], 'utf8') });
    }
  }

  const totalBytes = cursor.reduce((s, c) => s + c.sizeBytes, 0) +
    globalEntries.reduce((s, g) => s + g.sizeBytes, 0);

  return { cursor, global: globalEntries, totalBytes };
}
