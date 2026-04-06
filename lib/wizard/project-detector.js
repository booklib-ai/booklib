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
  { file: 'composer.json',    lang: 'php' },
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
  '.php': 'php',
};

const FRAMEWORK_SIGNALS = {
  python: { fastapi: 'FastAPI', django: 'Django', flask: 'Flask', pytest: 'testing' },
  javascript: { express: 'Express', next: 'Next.js', react: 'React', vue: 'Vue', '@nestjs': 'NestJS', '@sveltejs/kit': 'SvelteKit', svelte: 'Svelte' },
  typescript: { express: 'Express', next: 'Next.js', react: 'React', vue: 'Vue', '@nestjs': 'NestJS', '@sveltejs/kit': 'SvelteKit', svelte: 'Svelte' },
  java: { 'springframework': 'Spring Boot', micronaut: 'Micronaut' },
  kotlin: { 'springframework': 'Spring Boot', ktor: 'Ktor' },
  php: { 'laravel/framework': 'Laravel', 'symfony/': 'Symfony', 'cakephp/cakephp': 'CakePHP' },
};

/**
 * Scans cwd for language and framework signals.
 * @returns {{ languages: string[], frameworks: string[], signals: string[] }}
 */
export function detect(cwd = process.cwd()) {
  const languages = new Set();
  const frameworks = new Set();
  const signals = [];

  // Check root-level file signals
  for (const { file, lang } of FILE_SIGNALS) {
    if (fs.existsSync(path.join(cwd, file))) {
      languages.add(lang);
      signals.push(file);
    }
  }

  // Check one level deep for file signals (monorepo subdirectories)
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      for (const { file, lang } of FILE_SIGNALS) {
        const subPath = path.join(cwd, entry.name, file);
        if (fs.existsSync(subPath)) {
          languages.add(lang);
          signals.push(`${entry.name}/${file}`);
        }
      }
    }
  } catch { /* skip */ }

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

  // Collect package.json paths (root + one level deep for monorepos)
  const pkgPaths = [];
  const rootPkg = path.join(cwd, 'package.json');
  if (fs.existsSync(rootPkg)) pkgPaths.push(rootPkg);
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const subPkg = path.join(cwd, entry.name, 'package.json');
      if (fs.existsSync(subPkg)) pkgPaths.push(subPkg);
    }
  } catch { /* skip */ }

  // Detect frameworks from all package.json files
  for (const pkgPath of pkgPaths) {
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

  // Collect text-based manifest paths (root + one level deep for monorepos)
  const MANIFEST_FILES = ['requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json'];
  const manifestPaths = [];
  for (const f of MANIFEST_FILES) {
    const rootFile = path.join(cwd, f);
    if (fs.existsSync(rootFile)) manifestPaths.push({ filePath: rootFile, lang: null });
  }
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      for (const f of MANIFEST_FILES) {
        const subFile = path.join(cwd, entry.name, f);
        if (fs.existsSync(subFile)) manifestPaths.push({ filePath: subFile, lang: null });
      }
    }
  } catch { /* skip */ }

  // Detect Python / JVM frameworks from all manifest files
  for (const lang of ['python', 'java', 'kotlin', 'php']) {
    if (!languages.has(lang)) continue;
    for (const { filePath } of manifestPaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
        for (const [dep, label] of Object.entries(FRAMEWORK_SIGNALS[lang] ?? {})) {
          if (content.includes(dep.toLowerCase())) frameworks.add(label);
        }
      } catch { /* skip */ }
    }
  }

  return { languages: [...languages], frameworks: [...frameworks], signals };
}
