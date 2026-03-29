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
   * @returns {string} - A comprehensive project health report.
   */
  scan(dirPath) {
    const files = this.getFiles(dirPath);
    const reports = [];
    const stats = {
      filesScanned: files.length,
      filesAudited: 0,
      violations: 0,
      healthyFiles: 0,
      debtBySkill: {}
    };

    console.log(`Starting deep scan of ${files.length} files...`);

    for (const file of files) {
      const skillName = this.detectSkill(file);
      if (!skillName) continue;

      const skillPath = path.join(resolveBookLibPaths().skillsPath, skillName);
      const auditJsonPath = path.join(skillPath, 'audit.json');
      if (!fs.existsSync(auditJsonPath)) continue; // skill has no static rules — skip

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
  detectSkill(filePath) {
    const ext = path.extname(filePath);
    if (ext === '.kt' || ext === '.kts') return 'effective-kotlin';
    if (ext === '.ts' || ext === '.tsx') return 'effective-typescript';
    if (ext === '.java') return 'effective-java';
    if (ext === '.py') return 'effective-python';
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'clean-code-reviewer';
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
- **Files Scanned**: ${stats.filesScanned} (${stats.filesAudited} matched a skill lens)
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
`;
  }
}
