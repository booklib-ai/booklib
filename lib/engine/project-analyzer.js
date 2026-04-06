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
    // Exclude the project itself so its own source files aren't flagged as "affected"
    const selfName = readProjectName(projectDir);
    for (const dep of gaps.postTraining) {
      const normalized = normalizePkgName(dep.name);
      if (selfName && normalized === selfName) continue;

      postTrainingDeps.set(normalized, dep);

      // Maven/Gradle deps use groupId:artifactId (e.g. com.google.code.gson:gson).
      // Java imports use dot-notation (e.g. com.google.gson.Gson -> pkg com.google.gson).
      // Add artifactId and groupId as extra keys so the lookup can match.
      if (dep.name.includes(':')) {
        const [groupId, artifactId] = dep.name.split(':');
        if (artifactId) postTrainingDeps.set(normalizePkgName(artifactId), dep);
        if (groupId) postTrainingDeps.set(normalizePkgName(groupId), dep);
      }
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
        const normalized = normalizePkgName(imp.module);
        let dep = postTrainingDeps.get(normalized);

        // For Java/Kotlin imports like com.google.gson, also try the last segment
        // (e.g. "gson") which may match a Maven artifactId key.
        if (!dep && (language === 'java' || language === 'kotlin') && imp.module.includes('.')) {
          const lastSegment = imp.module.split('.').pop();
          dep = postTrainingDeps.get(normalizePkgName(lastSegment));
        }

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
 * Read the project's own name from the root manifest file.
 * Returns normalized name or null if not found.
 * @param {string} projectDir
 * @returns {string|null}
 */
function readProjectName(projectDir) {
  // package.json (npm)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    if (pkg.name) return normalizePkgName(pkg.name);
  } catch { /* no package.json */ }

  // pyproject.toml (Python)
  try {
    const toml = fs.readFileSync(path.join(projectDir, 'pyproject.toml'), 'utf8');
    const nameMatch = toml.match(/\[project\][\s\S]*?name\s*=\s*"([^"]+)"/);
    if (nameMatch) return normalizePkgName(nameMatch[1]);
    const poetryMatch = toml.match(/\[tool\.poetry\][\s\S]*?name\s*=\s*"([^"]+)"/);
    if (poetryMatch) return normalizePkgName(poetryMatch[1]);
  } catch { /* no pyproject.toml */ }

  // Cargo.toml (Rust)
  try {
    const cargo = fs.readFileSync(path.join(projectDir, 'Cargo.toml'), 'utf8');
    const nameMatch = cargo.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/);
    if (nameMatch) return normalizePkgName(nameMatch[1]);
  } catch { /* no Cargo.toml */ }

  return null;
}

/**
 * Normalize package name for cross-ecosystem matching.
 * Python deps use hyphens (typing-inspection) but imports use underscores (typing_inspection).
 * Rust crates have the same mismatch (tokio-tungstenite vs tokio_tungstenite).
 * Ruby requires use slashes (dry/types) but gems use hyphens (dry-types).
 */
function normalizePkgName(name) {
  return name.toLowerCase().replace(/[-_/]+/g, '-');
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

  if (language === 'php') {
    // use Namespace\Class; — extract Class (last segment)
    // use Namespace\Class as Alias; — extract Alias
    const phpRe = /use\s+[\w\\]+\\(\w+)(?:\s+as\s+(\w+))?\s*;/g;
    let match;
    while ((match = phpRe.exec(code)) !== null) {
      apis.push(match[2] || match[1]);
    }
    // use Namespace\{Class1, Class2}; — extract all
    const phpGroupRe = /use\s+[\w\\]+\\{([^}]+)}/g;
    while ((match = phpGroupRe.exec(code)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
      apis.push(...names);
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

export { findSourceFiles, extractApiNames, normalizePkgName, readProjectName };
