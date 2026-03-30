import fs from 'fs';
import path from 'path';
import { resolveBookLibPaths } from '../paths.js';

/**
 * Handles project-wide compliance scanning against the entire BookLib library.
 * Uses audit.json rule sets for fast, accurate static analysis.
 * Falls back to skipping files whose skill has no audit.json.
 */
export class BookLibScanner {
  constructor() {}

  /**
   * Scans a directory and generates a 'Wisdom Compliance' heatmap.
   *
   * @param {string} dirPath - The project directory to scan.
   * @param {object} opts
   * @param {string} opts.mode - 'code' (default) or 'docs' (scans .md/.txt files)
   * @returns {string} - A comprehensive project health report.
   */
  scan(dirPath, { mode = 'code' } = {}) {
    const files = this.getFiles(dirPath);
    const reports = [];
    const stats = {
      filesScanned: files.length,
      filesMatched: 0,
      filesAudited: 0,
      violations: 0,
      healthyFiles: 0,
      debtBySkill: {},
      noRulesSkills: new Set(),
    };

    console.log(`Starting deep scan of ${files.length} files...`);

    for (const file of files) {
      const skillName = this.detectSkill(file, mode);
      if (!skillName) continue;

      stats.filesMatched++;
      const auditJsonPath = this._findAuditJson(skillName);
      if (!auditJsonPath) {
        stats.noRulesSkills.add(skillName);
        continue; // skill has no static rules — skip
      }

      let rules;
      try {
        ({ rules } = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8')));
      } catch { continue; }

      const lines = fs.readFileSync(file, 'utf8').split('\n');
      let violationCount = 0;
      for (const rule of rules) {
        const regex = new RegExp(rule.pattern, 'g');
        for (const line of lines) {
          if (regex.test(line)) violationCount++;
        }
      }

      stats.filesAudited++;
      stats.violations += violationCount;
      if (violationCount === 0) stats.healthyFiles++;
      stats.debtBySkill[skillName] = (stats.debtBySkill[skillName] || 0) + violationCount;
      if (violationCount > 0) {
        reports.push({ file, skill: skillName, violationCount });
      }
    }

    return this.formatDashboard(stats, reports);
  }

  /**
   * Detects which BookLib skill is most relevant to a file extension.
   */
  detectSkill(filePath, mode = 'code') {
    const ext = path.extname(filePath);
    if (mode === 'docs') {
      if (ext === '.md' || ext === '.mdx' || ext === '.mdc') return 'writing-plans';
      if (ext === '.txt') return 'writing-plans';
      return null;
    }
    if (ext === '.kt' || ext === '.kts') return 'effective-kotlin';
    if (ext === '.ts' || ext === '.tsx') return 'effective-typescript';
    if (ext === '.java') return 'effective-java';
    if (ext === '.py') return 'effective-python';
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'clean-code-reviewer';
    return null;
  }

  /**
   * Finds audit.json for a skill — checks bundled skills first, then community cache.
   */
  _findAuditJson(skillName) {
    const { skillsPath, cachePath } = resolveBookLibPaths();
    const bundled = path.join(skillsPath, skillName, 'audit.json');
    if (fs.existsSync(bundled)) return bundled;
    const community = path.join(cachePath, 'skills', skillName, 'audit.json');
    if (fs.existsSync(community)) return community;
    return null;
  }

  /**
   * Helper to recursively list files, excluding common noise directories.
   */
  getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    const ignore = ['.git', 'node_modules', '.booklib', '.claude', '.idea', 'dist', 'build', 'coverage', '.cache'];

    list.forEach(file => {
      if (ignore.includes(file)) return;

      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    });
    return results;
  }

  formatDashboard(stats, reports) {
    const sortedReports = reports.sort((a, b) => b.violationCount - a.violationCount);
    const topDebt = sortedReports.slice(0, 5);

    return `
# 📊 BookLib Wisdom Heatmap
**Project Health Dashboard**

## 📈 Executive Summary
- **Files Scanned**: ${stats.filesScanned} (${stats.filesMatched} matched a skill lens, ${stats.filesAudited} audited)
- **Healthy Files**: ${stats.healthyFiles} / ${stats.filesAudited} audited
- **Total Violations**: ${stats.violations}
- **Compliance**: ${((stats.healthyFiles / (stats.filesAudited || 1)) * 100).toFixed(1)}% of audited files violation-free

## 🛠 Architectural Debt by Skill
${Object.entries(stats.debtBySkill).map(([skill, count]) => `- **${skill}**: ${count} violations`).join('\n')}

## 🚨 Top 5 Refactoring Priorities (High Debt)
${topDebt.map(r => `- \`${path.relative(process.cwd(), r.file)}\` (${r.violationCount} violations | Lens: ${r.skill})`).join('\n')}

---
> **Note**: This heatmap is based on 'Light Audits' (Static Pattern Detection).
> Use \`booklib audit <skill> <file>\` for a deep-reasoning review of high-priority files.
${stats.noRulesSkills.size > 0 ? `> **No static rules loaded for:** ${[...stats.noRulesSkills].join(', ')} — add an \`audit.json\` to enable pattern checks.` : ''}
`;
  }
}
