import fs from 'node:fs';
import path from 'node:path';
import { parseImports, detectLanguage } from './import-parser.js';
import { GapDetector } from './gap-detector.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.booklib', 'dist', 'build', 'vendor',
  '.next', '__pycache__', '.venv', 'venv',
  'out', '.claude', '.idea', '.vscode', '.agents',
  '.junie', '.specify', '.gemini', '.github',
]);
const CODE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|kts|rb|php|cs|swift|dart)$/i;
const MAX_FILES = 500;
const MAX_FILE_SIZE = 500_000;

/**
 * Cross-references gap detection with import detection to identify
 * exactly which files and APIs in the project are affected by
 * post-training knowledge gaps.
 */
export class ProjectAnalyzer {
  constructor(opts = {}) {
    this.gapDetector = opts.gapDetector ?? new GapDetector(opts);
  }

  /**
   * Full project analysis: find post-training deps, then find which
   * source files import APIs from those deps.
   * @param {string} projectDir
   * @returns {Promise<{affected: Array, totalFiles: number, totalApis: number, gaps: object}>}
   */
  async analyze(projectDir) {
    const gaps = await this.gapDetector.detect(projectDir);
    if (gaps.postTraining.length === 0) {
      return { affected: [], totalFiles: 0, totalApis: 0, gaps };
    }

    const postTrainingDeps = new Map();
    for (const dep of gaps.postTraining) {
      postTrainingDeps.set(normalizePkgName(dep.name), dep);
    }

    const sourceFiles = findSourceFiles(projectDir);
    const affected = [];

    for (const filePath of sourceFiles) {
      const language = detectLanguage(filePath);
      if (!language) continue;

      let code;
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE) continue;
        code = fs.readFileSync(filePath, 'utf8');
      } catch { continue; }

      const imports = parseImports(code, language);

      for (const imp of imports) {
        const dep = postTrainingDeps.get(normalizePkgName(imp.module));
        if (!dep) continue;

        const apis = extractApiNames(code, imp.module, language);
        const relPath = path.relative(projectDir, filePath);

        const existing = affected.find(a => a.file === relPath && a.dep.name === dep.name);
        if (existing) {
          for (const api of apis) {
            if (!existing.apis.includes(api)) existing.apis.push(api);
          }
        } else {
          affected.push({
            file: relPath,
            dep: {
              name: dep.name,
              version: dep.version,
              ecosystem: dep.ecosystem,
              publishDate: dep.publishDate,
            },
            apis,
          });
        }
      }
    }

    const totalApis = affected.reduce((sum, a) => sum + a.apis.length, 0);
    return { affected, totalFiles: affected.length, totalApis, gaps };
  }
}

/**
 * Normalize package name for cross-ecosystem matching.
 * Python deps use hyphens (typing-inspection) but imports use underscores (typing_inspection).
 * Rust crates have the same mismatch (tokio-tungstenite vs tokio_tungstenite).
 */
function normalizePkgName(name) {
  return name.toLowerCase().replace(/[-_]+/g, '-');
}

/** Escape special regex characters in a string. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract specific API/function names imported from a module.
 * Looks for destructured imports like: import { cacheLife, after } from 'next/cache'
 * @param {string} code - full source code
 * @param {string} moduleName - the top-level package name
 * @param {string} language - language key
 * @returns {string[]} specific API names, or [moduleName] if none found
 */
function extractApiNames(code, moduleName, language) {
  const apis = [];

  if (language === 'js') {
    // Destructured: import { X, Y } from 'module' or 'module/subpath'
    const destructuredRe = new RegExp(
      `import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${escapeRegex(moduleName)}(?:/[^'"]*)?['"]`,
      'gs',
    );
    let match;
    while ((match = destructuredRe.exec(code)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      apis.push(...names);
    }

    // Default: import React from 'react'
    const defaultRe = new RegExp(
      `import\\s+(\\w+)\\s+from\\s*['"]${escapeRegex(moduleName)}['"]`,
      'g',
    );
    while ((match = defaultRe.exec(code)) !== null) {
      apis.push(match[1]);
    }

    // Require destructured: const { X, Y } = require('module')
    const requireRe = new RegExp(
      `\\{([^}]+)\\}\\s*=\\s*require\\s*\\(\\s*['"]${escapeRegex(moduleName)}['"]`,
      'g',
    );
    while ((match = requireRe.exec(code)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      apis.push(...names);
    }
  }

  if (language === 'python') {
    // from module import X, Y, Z
    const fromRe = new RegExp(
      `from\\s+${escapeRegex(moduleName)}(?:\\.\\S+)?\\s+import\\s+([^\\n]+)`,
      'g',
    );
    let match;
    while ((match = fromRe.exec(code)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      apis.push(...names);
    }
  }

  if (language === 'go') {
    // Match pkg.FuncName( usage — extract FuncName
    const lastPart = moduleName.split('/').pop();
    const goRe = new RegExp(`${escapeRegex(lastPart)}\\.(\\w+)`, 'g');
    let match;
    while ((match = goRe.exec(code)) !== null) {
      apis.push(match[1]);
    }
  }

  if (language === 'rust') {
    // use crate::module::{Type1, Type2}
    const rustRe = new RegExp(
      `use\\s+${escapeRegex(moduleName)}(?:::\\w+)*::\\{([^}]+)\\}`,
      'gs',
    );
    let match;
    while ((match = rustRe.exec(code)) !== null) {
      const names = match[1].split(',').map(n => n.trim()).filter(Boolean);
      apis.push(...names);
    }
    // use module::SpecificType;
    const rustSingleRe = new RegExp(
      `use\\s+${escapeRegex(moduleName)}(?:::\\w+)*::(\\w+)\\s*;`,
      'g',
    );
    while ((match = rustSingleRe.exec(code)) !== null) {
      apis.push(match[1]);
    }
  }

  if (language === 'java' || language === 'kotlin') {
    // import com.google.gson.Gson — extract Gson (last segment)
    const javaRe = new RegExp(
      `import\\s+(?:static\\s+)?${escapeRegex(moduleName)}\\.([\\w.]+)`,
      'gm',
    );
    let match;
    while ((match = javaRe.exec(code)) !== null) {
      // Take the last segment: com.google.gson.Gson -> Gson
      const segments = match[1].split('.');
      apis.push(segments[segments.length - 1]);
    }
  }

  const unique = [...new Set(apis)];
  return unique.length > 0 ? unique : [moduleName];
}

/**
 * Recursively find source code files in a project directory.
 * Skips node_modules, .git, .booklib, dist, build, vendor, etc.
 * Caps at MAX_FILES for performance.
 * @param {string} dirPath
 * @returns {string[]}
 */
function findSourceFiles(dirPath) {
  const results = [];

  const walk = (dir) => {
    if (results.length >= MAX_FILES) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (CODE_EXTENSIONS.test(entry.name)) {
        results.push(path.join(dir, entry.name));
      }
    }
  };
  walk(dirPath);
  return results;
}

export { findSourceFiles, extractApiNames, normalizePkgName };
