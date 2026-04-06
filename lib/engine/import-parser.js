/**
 * Import statement extractor — parses import/require statements from source code
 * via regex for 11 languages. Returns normalized top-level package names.
 */

import path from 'node:path';

/** @type {Record<string, RegExp[]>} */
const IMPORT_PATTERNS = {
  js: [
    // Multiline-safe: match `from 'pkg'` preceded by import (with optional `type` keyword)
    /import\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"./][^'"]*)['"]/g,
    /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,
  ],
  python: [
    /^import\s+([a-zA-Z_]\w*)/gm,
    /^from\s+([a-zA-Z_]\w*)/gm,
  ],
  go: [
    /import\s+(?:[\w.]+\s+)?"([^"]+)"/g,
    /\t"([^"]+)"/g,
  ],
  rust: [
    /^use\s+([a-zA-Z_]\w*)::/gm,
    /^extern\s+crate\s+([a-zA-Z_]\w*)/gm,
  ],
  java: [
    /^import\s+(?:static\s+)?([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/gm,
  ],
  ruby: [
    /require\s+['"]([^'"./][^'"]*)['"]/g,
  ],
  php: [
    // Capture first two namespace segments: `use Illuminate\Support\...` -> `Illuminate\Support`
    /^use\s+([A-Z]\w*\\[A-Z]\w*)/gm,
  ],
  csharp: [
    /^using\s+(?:static\s+)?([A-Z]\w*(?:\.\w+)*)/gm,
  ],
  swift: [
    // Skip kind keywords (struct, class, func, etc.) to capture the module name
    /^import\s+(?:struct\s+|class\s+|enum\s+|protocol\s+|func\s+|var\s+|let\s+|typealias\s+)?(\w+)/gm,
  ],
  dart: [
    /import\s+['"]package:([^/'"]+)/g,
  ],
};

// Kotlin shares Java's import syntax
IMPORT_PATTERNS.kotlin = IMPORT_PATTERNS.java;

export const EXTENSION_MAP = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'js', '.tsx': 'js', '.jsx': 'js',
  '.py': 'python', '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.dart': 'dart',
};

/**
 * Detect language from file extension.
 * @param {string} filePath
 * @returns {string|null} language key or null
 */
export function detectLanguage(filePath) {
  return EXTENSION_MAP[path.extname(filePath)] ?? null;
}

/**
 * Normalize a raw import string to its top-level package name.
 * @param {string} rawModule - the captured module string
 * @param {string} language - language key
 * @returns {string} normalized package name
 */
export function extractPackageName(rawModule, language) {
  if (language === 'js') return extractJsPackage(rawModule);
  if (language === 'go') return extractGoPackage(rawModule);
  if (language === 'java' || language === 'kotlin') return extractJavaPackage(rawModule);
  if (language === 'php') return extractPhpPackage(rawModule);
  return rawModule;
}

/** JS scoped packages: `@scope/pkg/foo` -> `@scope/pkg`, else first segment */
function extractJsPackage(raw) {
  if (raw.startsWith('@')) {
    const parts = raw.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : raw;
  }
  return raw.split('/')[0];
}

/** Go: `github.com/user/repo/pkg` -> first 3 segments */
function extractGoPackage(raw) {
  const parts = raw.split('/');
  return parts.slice(0, 3).join('/');
}

/** Java/Kotlin: `com.google.gson.Gson` -> first 3 segments */
function extractJavaPackage(raw) {
  const parts = raw.split('.');
  return parts.slice(0, Math.min(3, parts.length)).join('.');
}

/** PHP: `Illuminate\Support` -> `illuminate/support` (Composer package format) */
function extractPhpPackage(raw) {
  const parts = raw.split('\\');
  const first2 = parts.slice(0, 2).join('/');
  return first2.toLowerCase();
}

/**
 * Parse import/require statements from source code.
 * @param {string} code - source code content
 * @param {string} language - language key from detectLanguage
 * @returns {Array<{module: string, language: string}>}
 */
export function parseImports(code, language) {
  const patterns = IMPORT_PATTERNS[language];
  if (!patterns) return [];

  const seen = new Set();
  const results = [];

  for (const pattern of patterns) {
    // Reset regex state for reuse
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(code)) !== null) {
      const pkg = extractPackageName(match[1], language);
      if (!seen.has(pkg)) {
        seen.add(pkg);
        results.push({ module: pkg, language });
      }
    }
  }
  return results;
}
