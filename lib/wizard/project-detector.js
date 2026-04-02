// lib/wizard/project-detector.js
import fs from 'fs';
import path from 'path';

const FILE_SIGNALS = [
  { file: 'go.mod',           lang: 'go' },
  { file: 'Cargo.toml',       lang: 'rust' },
  { file: 'pom.xml',          lang: 'java' },
  { file: 'build.gradle',     lang: 'java' },
  { file: 'build.gradle.kts', lang: 'kotlin' },
  { file: 'pyproject.toml',   lang: 'python' },
  { file: 'requirements.txt', lang: 'python' },
];

const EXT_SIGNALS = {
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.java': 'java',
  '.py': 'python',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.dart': 'dart',
  '.cs': 'csharp',
};

const FRAMEWORK_SIGNALS = {
  python: { fastapi: 'FastAPI', django: 'Django', flask: 'Flask', pytest: 'testing' },
  javascript: { express: 'Express', next: 'Next.js', react: 'React', vue: 'Vue', '@nestjs': 'NestJS' },
  typescript: { express: 'Express', next: 'Next.js', react: 'React', vue: 'Vue', '@nestjs': 'NestJS' },
  java: { 'springframework': 'Spring Boot', micronaut: 'Micronaut' },
  kotlin: { 'springframework': 'Spring Boot', ktor: 'Ktor' },
};

/**
 * Scans cwd for language and framework signals.
 * @returns {{ languages: string[], frameworks: string[], signals: string[] }}
 */
export function detect(cwd = process.cwd()) {
  const languages = new Set();
  const frameworks = new Set();
  const signals = [];

  for (const { file, lang } of FILE_SIGNALS) {
    if (fs.existsSync(path.join(cwd, file))) {
      languages.add(lang);
      signals.push(file);
    }
  }

  // Scan cwd + one level deep for extension signals
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (EXT_SIGNALS[ext]) languages.add(EXT_SIGNALS[ext]);
      if (entry.isDirectory()) {
        try {
          for (const sub of fs.readdirSync(path.join(cwd, entry.name))) {
            const subExt = path.extname(sub).toLowerCase();
            if (EXT_SIGNALS[subExt]) languages.add(EXT_SIGNALS[subExt]);
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }

  // Detect frameworks from package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const lang of ['javascript', 'typescript']) {
        if (!languages.has(lang)) continue;
        for (const [dep, label] of Object.entries(FRAMEWORK_SIGNALS[lang] ?? {})) {
          if (Object.keys(deps).some(d => d === dep || d.startsWith(dep + '/'))) frameworks.add(label);
        }
      }
      if (Object.keys(deps).includes('typescript')) languages.add('typescript');
    } catch { /* skip */ }
  }

  // Detect Python / JVM frameworks from text files
  for (const lang of ['python', 'java', 'kotlin']) {
    if (!languages.has(lang)) continue;
    for (const f of ['requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts']) {
      try {
        const content = fs.readFileSync(path.join(cwd, f), 'utf8').toLowerCase();
        for (const [dep, label] of Object.entries(FRAMEWORK_SIGNALS[lang] ?? {})) {
          if (content.includes(dep.toLowerCase())) frameworks.add(label);
        }
      } catch { /* skip */ }
    }
  }

  return { languages: [...languages], frameworks: [...frameworks], signals };
}
