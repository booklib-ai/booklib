import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveBookLibPaths } from '../paths.js';
import { SKILL_LIMIT } from '../wizard/skill-recommender.js';
import { countInstalledSlots, listInstalledSkillNames } from '../skill-fetcher.js';

const MARKER_START = '<!-- booklib-standards-start -->';

/**
 * Runs all diagnostic checks and returns an array of findings.
 * @param {string} cwd - project root
 * @returns {Array<{ check: string, severity: 'error'|'warning'|'info', message: string, fixable: boolean, data?: object }>}
 */
export function runDiagnostics(cwd = process.cwd()) {
  const findings = [];

  checkSlotOverload(findings);
  checkOversizedConfigs(findings, cwd);
  checkMissingIndex(findings, cwd);
  checkMissingConfigFiles(findings, cwd);
  checkStaleSkills(findings);
  checkOrphanedSkills(findings);

  return findings;
}

/** Check 1: Slot overload */
function checkSlotOverload(findings) {
  const slotsUsed = countInstalledSlots();
  if (slotsUsed > SKILL_LIMIT) {
    findings.push({
      check: 'slot-overload',
      severity: 'warning',
      message: `${slotsUsed} skills installed (limit: ${SKILL_LIMIT}). Agent context is overloaded.`,
      fixable: true,
    });
  }
}

/** Check 2: Oversized config files */
function checkOversizedConfigs(findings, cwd) {
  const configFiles = [
    { file: 'CLAUDE.md', path: path.join(cwd, 'CLAUDE.md') },
    { file: '.github/copilot-instructions.md', path: path.join(cwd, '.github', 'copilot-instructions.md') },
    { file: '.gemini/context.md', path: path.join(cwd, '.gemini', 'context.md') },
  ];

  for (const cf of configFiles) {
    if (fs.existsSync(cf.path)) {
      const content = fs.readFileSync(cf.path, 'utf8');
      const lines = content.split('\n').length;
      if (lines > 500 && content.includes(MARKER_START)) {
        findings.push({
          check: 'oversized-config',
          severity: 'warning',
          message: `${cf.file} is ${lines} lines. Recommended: under 200.`,
          fixable: true,
          data: { file: cf.file, absPath: cf.path, lines },
        });
      }
    }
  }
}

/** Check 3: Missing index */
function checkMissingIndex(findings, cwd) {
  try {
    const { indexPath } = resolveBookLibPaths(cwd);
    if (!fs.existsSync(indexPath)) {
      findings.push({
        check: 'missing-index',
        severity: 'error',
        message: 'No search index found. Search and recommendations won\'t work.',
        fixable: true,
      });
    }
  } catch {
    findings.push({
      check: 'missing-index',
      severity: 'error',
      message: 'No search index found. Search and recommendations won\'t work.',
      fixable: true,
    });
  }
}

/** Check 4: Missing config files for configured tools */
function checkMissingConfigFiles(findings, cwd) {
  const configPath = path.join(cwd, 'booklib.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const toolFileMap = {
      claude: 'CLAUDE.md',
      copilot: '.github/copilot-instructions.md',
      gemini: '.gemini/context.md',
      codex: 'AGENTS.md',
      cursor: '.cursor/rules/booklib-standards.mdc',
    };

    for (const tool of (config.tools ?? [])) {
      const expectedFile = toolFileMap[tool];
      if (expectedFile && !fs.existsSync(path.join(cwd, expectedFile))) {
        findings.push({
          check: 'missing-config',
          severity: 'warning',
          message: `${tool} configured but ${expectedFile} not found.`,
          fixable: true,
          data: { tool, file: expectedFile },
        });
      }
    }
  } catch { /* malformed config, skip */ }
}

/** Check 5: Stale skills (installed but never used) */
function checkStaleSkills(findings) {
  const usagePath = path.join(os.homedir(), '.booklib', 'usage.json');
  if (!fs.existsSync(usagePath)) return;

  try {
    const usage = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
    const usedNames = new Set(
      usage.map(u => u.skill?.toLowerCase()).filter(Boolean),
    );
    const installed = listInstalledSkillNames();
    const stale = installed.filter(n => !usedNames.has(n.toLowerCase()));

    if (stale.length > 5) {
      findings.push({
        check: 'stale-skills',
        severity: 'info',
        message: `${stale.length} skills have no recorded usage.`,
        fixable: true,
        data: { staleNames: stale },
      });
    }
  } catch { /* no usage data, skip */ }
}

/** Check 6: Orphaned skills (have .booklib marker but not in any catalog/index) */
function checkOrphanedSkills(findings) {
  const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(claudeSkillsDir)) return;

  try {
    const installed = listInstalledSkillNames();
    // Read the bundled skills directory to find known skill names
    const packageRoot = path.resolve(
      new URL('.', import.meta.url).pathname, '..', '..',
    );
    const bundledSkillsDir = path.join(packageRoot, 'skills');
    const bundledNames = new Set();
    if (fs.existsSync(bundledSkillsDir)) {
      for (const entry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) bundledNames.add(entry.name);
      }
    }

    const orphaned = installed.filter(n => !bundledNames.has(n));
    for (const name of orphaned) {
      findings.push({
        check: 'orphaned-skill',
        severity: 'info',
        message: `${name} -- not found in any catalog. May be outdated.`,
        fixable: false,
      });
    }
  } catch { /* skip orphan check on error */ }
}

/**
 * Prints diagnostic results to stdout.
 * @param {Array<{ check: string, severity: string, message: string, fixable: boolean }>} findings
 */
export function printDiagnostics(findings) {
  if (findings.length === 0) {
    console.log('  No issues found. BookLib is healthy.\n');
    return;
  }

  for (const f of findings) {
    const icon = f.severity === 'error' ? '\u2717' : f.severity === 'warning' ? '\u26A0' : '\u2139';
    console.log(`  ${icon} ${f.message}`);
  }

  const fixable = findings.filter(f => f.fixable).length;
  if (fixable > 0) {
    console.log(`\n  ${fixable} issue(s) fixable. Run: booklib doctor --cure\n`);
  } else {
    console.log('');
  }
}
