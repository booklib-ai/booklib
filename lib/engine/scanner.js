import fs from 'fs';
import path from 'path';
import { BookLibAuditor } from './auditor.js';

/**
 * Handles project-wide compliance scanning against the entire BookLib library.
 */
export class BookLibScanner {
  constructor() {
    this.auditor = new BookLibAuditor();
  }

  /**
   * Scans a directory and generates a 'Wisdom Compliance' heatmap.
   * 
   * @param {string} dirPath - The project directory to scan.
   * @returns {string} - A comprehensive project health report.
   */
  async scan(dirPath) {
    const files = this.getFiles(dirPath);
    const reports = [];
    const stats = {
      filesScanned: files.length,
      violations: 0,
      healthyFiles: 0,
      debtBySkill: {}
    };

    console.log(`Starting deep scan of ${files.length} files...`);

    for (const file of files) {
      const skillName = this.detectSkill(file);
      if (skillName) {
        const skillPath = path.join(process.cwd(), 'skills', skillName);
        if (fs.existsSync(skillPath)) {
          // Perform a 'Light Audit' (Static Checks only for speed)
          const report = await this.auditor.audit(skillPath, file);
          const violationCount = (report.match(/🔴|🟡/g) || []).length;
          
          stats.violations += violationCount;
          if (violationCount === 0) stats.healthyFiles++;
          
          stats.debtBySkill[skillName] = (stats.debtBySkill[skillName] || 0) + violationCount;
          
          if (violationCount > 0) {
            reports.push({ file, skill: skillName, violationCount });
          }
        }
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
    if (ext === '.md') return 'lean-startup'; // General fallback for docs
    return null;
  }

  /**
   * Helper to recursively list files, excluding common noise directories.
   */
  getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    const ignore = ['.git', 'node_modules', '.booklib-index', '.idea', 'dist', 'build'];

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
- **Files Scanned**: ${stats.filesScanned}
- **Healthy Files**: ${stats.healthyFiles} (No expert violations detected)
- **Total Violations**: ${stats.violations}
- **Overall Compliance**: ${((stats.healthyFiles / (stats.filesScanned || 1)) * 100).toFixed(1)}%

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
