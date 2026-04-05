import fs from 'node:fs';
import path from 'node:path';

const CUTOFF_DATE = new Date('2025-05-01');
const TIMEOUT_MS = 5000;

// -- Dependency File Parsers --

export function parsePackageJson(filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).map(([name, version]) => ({
    name,
    version: version.replace(/^[\^~>=<]*/g, ''),
    ecosystem: 'npm',
  }));
}

export function parseRequirementsTxt(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  return lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('-'))
    .map(l => {
      const match = l.match(/^([a-zA-Z0-9_-]+)\s*[=~><!]*=?\s*([\d.]*)/);
      if (!match) return null;
      return { name: match[1], version: match[2] || 'latest', ecosystem: 'pypi' };
    })
    .filter(Boolean);
}

export function parsePyprojectToml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const depMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depMatch) {
    const items = depMatch[1].match(/"([^"]+)"/g) || [];
    for (const item of items) {
      const clean = item.replace(/"/g, '');
      const match = clean.match(/^([a-zA-Z0-9_-]+)\s*[><=~!]*\s*([\d.]*)/);
      if (match) deps.push({ name: match[1], version: match[2] || 'latest', ecosystem: 'pypi' });
    }
  }
  return deps;
}

export function parsePomXml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const regex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push({ name: `${match[1]}:${match[2]}`, version: match[3] || 'latest', ecosystem: 'maven' });
  }
  return deps;
}

export function parseBuildGradle(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const regex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^:]+):([^:]+):([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push({ name: `${match[1]}:${match[2]}`, version: match[3], ecosystem: 'maven' });
  }
  return deps;
}

export function parseCargoToml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  // Match [dependencies] section up to the next [section-header] or end of file.
  // Uses a lookahead for a line starting with '[' to avoid matching inline arrays.
  const inDeps = content.match(/\[dependencies\]\n([\s\S]*?)(?=\n\[[a-zA-Z]|$)/);
  if (inDeps) {
    const lines = inDeps[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
      if (match) {
        deps.push({ name: match[1], version: match[2].replace(/^[\^~]/, ''), ecosystem: 'crates' });
        continue;
      }
      const tableMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);
      if (tableMatch) {
        deps.push({ name: tableMatch[1], version: tableMatch[2].replace(/^[\^~]/, ''), ecosystem: 'crates' });
      }
    }
  }
  return deps;
}

export function parseGemfile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const regex = /gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push({
      name: match[1],
      version: (match[2] || 'latest').replace(/[~>=<\s]/g, ''),
      ecosystem: 'rubygems',
    });
  }
  return deps;
}

export function parseGoMod(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const seen = new Set();

  // Block requires: require ( ... )
  const blockRegex = /require\s+\(([\s\S]*?)\)/g;
  let match;
  while ((match = blockRegex.exec(content)) !== null) {
    const lines = match[1].split('\n');
    for (const line of lines) {
      const depMatch = line.trim().match(/^(\S+)\s+(v[\d.]+)/);
      if (depMatch && !seen.has(depMatch[1])) {
        seen.add(depMatch[1]);
        deps.push({ name: depMatch[1], version: depMatch[2], ecosystem: 'go' });
      }
    }
  }

  // Single-line requires: require foo v1.2.3
  const singleRegex = /^require\s+(\S+)\s+(v[\d.]+)/gm;
  while ((match = singleRegex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      deps.push({ name: match[1], version: match[2], ecosystem: 'go' });
    }
  }
  return deps;
}

export function parseCsproj(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  const regex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push({ name: match[1], version: match[2], ecosystem: 'nuget' });
  }
  return deps;
}

export function parseComposerJson(filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const deps = { ...pkg.require, ...(pkg['require-dev'] || {}) };
  return Object.entries(deps)
    .filter(([name]) => name !== 'php' && !name.startsWith('ext-'))
    .map(([name, version]) => ({
      name,
      version: version.replace(/^[\^~>=<]*/g, ''),
      ecosystem: 'packagist',
    }));
}

// -- Ecosystem Detection --

export const ECOSYSTEM_FILES = [
  { file: 'package.json', parser: parsePackageJson },
  { file: 'requirements.txt', parser: parseRequirementsTxt },
  { file: 'pyproject.toml', parser: parsePyprojectToml },
  { file: 'pom.xml', parser: parsePomXml },
  { file: 'build.gradle', parser: parseBuildGradle },
  { file: 'build.gradle.kts', parser: parseBuildGradle },
  { file: 'Cargo.toml', parser: parseCargoToml },
  { file: 'Gemfile', parser: parseGemfile },
  { file: 'go.mod', parser: parseGoMod },
  { file: 'composer.json', parser: parseComposerJson },
];

/**
 * Scan a project directory for dependency files and parse all dependencies.
 * @param {string} projectDir
 * @returns {Array<{name: string, version: string, ecosystem: string}>}
 */
export function scanDependencies(projectDir) {
  const allDeps = [];
  for (const { file, parser } of ECOSYSTEM_FILES) {
    const filePath = path.join(projectDir, file);
    if (fs.existsSync(filePath)) {
      try {
        allDeps.push(...parser(filePath));
      } catch { /* skip malformed files */ }
    }
  }
  // Check for .csproj files separately (variable names)
  try {
    const files = fs.readdirSync(projectDir);
    for (const f of files) {
      if (f.endsWith('.csproj')) {
        try { allDeps.push(...parseCsproj(path.join(projectDir, f))); } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return allDeps;
}

// -- Registry Date Checkers --

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'BookLib/1.0' } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkNpmDate(name, version) {
  const data = await fetchWithTimeout(`https://registry.npmjs.org/${name}`);
  if (!data?.time?.[version]) return null;
  return new Date(data.time[version]);
}

export async function checkPypiDate(name, version) {
  const data = await fetchWithTimeout(`https://pypi.org/pypi/${name}/${version}/json`);
  if (!data?.urls?.[0]?.upload_time_iso_8601) return null;
  return new Date(data.urls[0].upload_time_iso_8601);
}

export async function checkMavenDate(name, version) {
  const [group, artifact] = name.split(':');
  if (!group || !artifact) return null;
  const data = await fetchWithTimeout(
    `https://search.maven.org/solrsearch/select?q=g:${group}+AND+a:${artifact}+AND+v:${version}&rows=1&wt=json`
  );
  if (!data?.response?.docs?.[0]?.timestamp) return null;
  return new Date(data.response.docs[0].timestamp);
}

export async function checkCratesDate(name, version) {
  const data = await fetchWithTimeout(`https://crates.io/api/v1/crates/${name}/${version}`);
  if (!data?.version?.created_at) return null;
  return new Date(data.version.created_at);
}

export async function checkRubygemsDate(name, version) {
  const data = await fetchWithTimeout(`https://rubygems.org/api/v1/versions/${name}.json`);
  if (!Array.isArray(data)) return null;
  const v = data.find(d => d.number === version);
  return v?.created_at ? new Date(v.created_at) : null;
}

export async function checkGoDate(name, version) {
  const data = await fetchWithTimeout(`https://proxy.golang.org/${name}/@v/${version}.info`);
  if (!data?.Time) return null;
  return new Date(data.Time);
}

export async function checkNugetDate(name, version) {
  const data = await fetchWithTimeout(
    `https://api.nuget.org/v3-flatcontainer/${name.toLowerCase()}/index.json`
  );
  // NuGet flat container doesn't expose per-version dates easily
  if (!data) return null;
  return null;
}

export async function checkPackagistDate(name, version) {
  const data = await fetchWithTimeout(`https://packagist.org/packages/${name}.json`);
  const versions = data?.package?.versions;
  if (!versions) return null;
  const v = versions[version] || versions[`v${version}`];
  return v?.time ? new Date(v.time) : null;
}

const REGISTRY_CHECKERS = {
  npm: checkNpmDate,
  pypi: checkPypiDate,
  maven: checkMavenDate,
  crates: checkCratesDate,
  rubygems: checkRubygemsDate,
  go: checkGoDate,
  nuget: checkNugetDate,
  packagist: checkPackagistDate,
};

/**
 * Check publish date for a dependency.
 * @param {{name: string, version: string, ecosystem: string}} dep
 * @returns {Promise<Date|null>}
 */
export async function checkPublishDate(dep) {
  const checker = REGISTRY_CHECKERS[dep.ecosystem];
  if (!checker) return null;
  return checker(dep.name, dep.version);
}

export { CUTOFF_DATE };
