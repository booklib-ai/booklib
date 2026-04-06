import fs from 'node:fs';
import path from 'node:path';

export const CUTOFF_DATE = new Date('2025-05-01');
const TIMEOUT_MS = 5000;
const CONCURRENCY = 10;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.booklib', 'dist', 'build', 'vendor',
  '.next', '__pycache__', '.venv', 'venv',
]);
const MAX_MANIFEST_FILES = 20;
const MAX_SCAN_DEPTH = 3;

// Filter non-resolvable version specifiers (workspace refs, git URLs, file paths, aliases)
function isResolvableVersion(version) {
  if (!version) return false;
  return !/^(workspace:|git\+|git:|file:|https?:|npm:|link:|\*)/.test(version);
}

// -- Dependency File Parsers --

export function parsePackageJson(filePath) {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps)
    .filter(([, version]) => isResolvableVersion(version))
    .map(([name, version]) => ({
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
  const seen = new Set();

  function extractFromArray(arrayContent) {
    const items = arrayContent.match(/"([^"]+)"/g) || [];
    for (const item of items) {
      const clean = item.replace(/"/g, '');
      const match = clean.match(/^([a-zA-Z0-9_-]+)\s*[><=~!]*\s*([\d.]*)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        deps.push({ name: match[1], version: match[2] || 'latest', ecosystem: 'pypi' });
      }
    }
  }

  // [project] dependencies = [...]
  const depMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depMatch) extractFromArray(depMatch[1]);

  // [project.optional-dependencies] — each key has an array of deps
  const optionalBlocks = content.matchAll(/\[project\.optional-dependencies\]\s*\n([\s\S]*?)(?=\n\[[a-zA-Z]|$)/g);
  for (const block of optionalBlocks) {
    const arrays = block[1].matchAll(/\w+\s*=\s*\[([\s\S]*?)\]/g);
    for (const arr of arrays) {
      extractFromArray(arr[1]);
    }
  }

  // [tool.poetry.dependencies] — key = "version" pairs
  const poetryMatch = content.match(/\[tool\.poetry\.dependencies\]\n([\s\S]*?)(?=\n\[[a-zA-Z]|$)/);
  if (poetryMatch) {
    const lines = poetryMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
      if (match && match[1] !== 'python' && !seen.has(match[1])) {
        seen.add(match[1]);
        deps.push({ name: match[1], version: match[2].replace(/^[\^~>=<]*/g, ''), ecosystem: 'pypi' });
      }
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

/**
 * Parses a Gradle Version Catalog (libs.versions.toml).
 * Reads [versions] into a map, then resolves [libraries] entries that use
 * `module` + `version.ref` or inline `version` into group:artifact deps.
 */
export function parseVersionCatalog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];

  // Split content into TOML sections: { sectionName: linesArray }
  const sections = {};
  let current = null;
  for (const line of content.split('\n')) {
    const header = line.match(/^\[(\w+)\]\s*$/);
    if (header) {
      current = header[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  // Build versions map from [versions] section
  const versions = {};
  for (const line of sections.versions ?? []) {
    const match = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (match) {
      versions[match[1]] = match[2];
    }
  }

  // Parse [libraries] section — each entry is an inline table or multi-line
  for (const line of sections.libraries ?? []) {
    const match = line.match(/^\s*[a-zA-Z0-9_-]+\s*=\s*\{(.+)\}\s*$/);
    if (!match) continue;

    const value = match[1];

    // Extract module = "group:artifact"
    const moduleMatch = value.match(/module\s*=\s*"([^"]+)"/);
    if (!moduleMatch) continue;

    // Resolve version: version.ref = "key" or version = "literal"
    let version = 'latest';
    const refMatch = value.match(/version\.ref\s*=\s*"([^"]+)"/);
    const literalMatch = value.match(/(?<!\.)version\s*=\s*"([^"]+)"/);

    if (refMatch && versions[refMatch[1]]) {
      version = versions[refMatch[1]];
    } else if (literalMatch) {
      version = literalMatch[1];
    }

    deps.push({ name: moduleMatch[1], version, ecosystem: 'maven' });
  }

  return deps;
}

export function parseCargoToml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  // Match [dependencies], [dev-dependencies], and [build-dependencies] sections
  const sections = content.matchAll(/\[(?:dev-|build-)?dependencies\]\n([\s\S]*?)(?=\n\[[a-zA-Z]|$)/g);
  for (const section of sections) {
    const lines = section[1].split('\n');
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

export function parsePubspecYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  // Match dependencies: and dev_dependencies: sections
  const sections = content.matchAll(/(?:dev_)?dependencies:\n([\s\S]*?)(?=\n\w|\n$|$)/g);
  for (const section of sections) {
    const lines = section[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^\s{2}(\w[\w-]*?):\s*[\^~]?([\d.]+)/);
      if (match) deps.push({ name: match[1], version: match[2], ecosystem: 'dart' });
    }
  }
  return deps;
}

export function parsePackageSwift(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  // Match .package(url: "https://github.com/user/repo", from: "1.2.3")
  // and .package(url: "https://github.com/user/repo.git", from: "1.2.3")
  const regex = /\.package\s*\(\s*url:\s*"([^"]+)"[\s\S]*?from:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const url = match[1];
    // Extract package name from URL: https://github.com/user/repo.git -> repo
    const urlPath = url.replace(/\.git$/, '');
    const segments = urlPath.split('/');
    const name = segments[segments.length - 1];
    deps.push({ name, version: match[2], ecosystem: 'swift' });
  }
  return deps;
}

export function parseDirectoryPackagesProps(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const deps = [];
  // <PackageVersion Include="Newtonsoft.Json" Version="13.0.3" />
  const regex = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    deps.push({ name: match[1], version: match[2], ecosystem: 'nuget' });
  }
  return deps;
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
  { file: 'pubspec.yaml', parser: parsePubspecYaml },
  { file: 'libs.versions.toml', parser: parseVersionCatalog },
  { file: 'Package.swift', parser: parsePackageSwift },
  { file: 'Directory.Packages.props', parser: parseDirectoryPackagesProps },
  { file: 'Directory.Build.props', parser: parseDirectoryPackagesProps },
];

/**
 * Recursively find dependency manifest files in a project directory.
 * Returns file paths grouped breadth-first so root manifests appear first.
 * @param {string} rootDir
 * @returns {Array<{filePath: string, parser: Function}>}
 */
function findManifestFiles(rootDir) {
  const manifests = [];
  const fileNameSet = new Set(ECOSYSTEM_FILES.map(e => e.file));
  const parserMap = new Map(ECOSYSTEM_FILES.map(e => [e.file, e.parser]));

  const walk = (dir, depth) => {
    if (manifests.length >= MAX_MANIFEST_FILES) return;
    if (depth > MAX_SCAN_DEPTH) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const subdirs = [];

    for (const entry of entries) {
      if (manifests.length >= MAX_MANIFEST_FILES) return;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.isSymbolicLink()) {
          subdirs.push(path.join(dir, entry.name));
        }
      } else if (fileNameSet.has(entry.name)) {
        manifests.push({
          filePath: path.join(dir, entry.name),
          parser: parserMap.get(entry.name),
        });
      } else if (entry.name.endsWith('.csproj')) {
        manifests.push({
          filePath: path.join(dir, entry.name),
          parser: parseCsproj,
        });
      }
    }

    // Process subdirectories after current-level files (breadth-first ordering)
    for (const subdir of subdirs) {
      walk(subdir, depth + 1);
    }
  };

  walk(rootDir, 0);
  return manifests;
}

/**
 * Scan a project directory for dependency files and parse all dependencies.
 * Recursively searches subdirectories (up to MAX_SCAN_DEPTH levels, capped
 * at MAX_MANIFEST_FILES manifests). Deduplicates by name+ecosystem, keeping
 * the first occurrence (root-level wins).
 * @param {string} projectDir
 * @returns {Array<{name: string, version: string, ecosystem: string}>}
 */
export function scanDependencies(projectDir) {
  const manifests = findManifestFiles(projectDir);

  const seen = new Set();
  const allDeps = [];

  for (const { filePath, parser } of manifests) {
    try {
      const deps = parser(filePath);
      for (const dep of deps) {
        const key = `${dep.ecosystem}:${dep.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          allDeps.push(dep);
        }
      }
    } catch {
      // skip malformed files
    }
  }

  return allDeps;
}

// -- Registry Date Checkers --

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BookLib/1.0', ...headers },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkNpmDate(name, version) {
  // Try abbreviated metadata first as a fast negative check.
  // `modified` is the last-modified timestamp of ANY version, so if it's pre-cutoff
  // we can skip the expensive full doc fetch entirely.
  const abbrev = await fetchWithTimeout(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    TIMEOUT_MS,
    { Accept: 'application/vnd.npm.install-v1+json' },
  );
  if (abbrev?.modified && new Date(abbrev.modified) <= CUTOFF_DATE) {
    // Entire package last modified before cutoff — no version can be post-cutoff
    return new Date(abbrev.modified);
  }
  // Need per-version timestamp — fetch full doc
  const full = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (!full?.time?.[version]) return null;
  return new Date(full.time[version]);
}

export async function checkPypiDate(name, version) {
  const data = await fetchWithTimeout(`https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`);
  if (!data?.urls?.[0]?.upload_time_iso_8601) return null;
  return new Date(data.urls[0].upload_time_iso_8601);
}

export async function checkMavenDate(name, version) {
  const [group, artifact] = name.split(':');
  if (!group || !artifact) return null;
  const q = `g:${encodeURIComponent(group)}+AND+a:${encodeURIComponent(artifact)}+AND+v:${encodeURIComponent(version)}`;
  const data = await fetchWithTimeout(
    `https://search.maven.org/solrsearch/select?q=${q}&rows=1&wt=json`
  );
  if (!data?.response?.docs?.[0]?.timestamp) return null;
  return new Date(data.response.docs[0].timestamp);
}

export async function checkCratesDate(name, version) {
  const data = await fetchWithTimeout(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  if (!data?.version?.created_at) return null;
  return new Date(data.version.created_at);
}

export async function checkRubygemsDate(name, version) {
  const data = await fetchWithTimeout(`https://rubygems.org/api/v1/versions/${encodeURIComponent(name)}.json`);
  if (!Array.isArray(data)) return null;
  const v = data.find(d => d.number === version);
  return v?.created_at ? new Date(v.created_at) : null;
}

export async function checkGoDate(name, version) {
  // Go module paths use forward slashes as path separators — encode each segment
  const encodedName = name.split('/').map(encodeURIComponent).join('/');
  const data = await fetchWithTimeout(`https://proxy.golang.org/${encodedName}/@v/${encodeURIComponent(version)}.info`);
  if (!data?.Time) return null;
  return new Date(data.Time);
}

// NuGet flat container API doesn't expose per-version publish dates.
// Omitted from REGISTRY_CHECKERS — NuGet deps will be scanned but not date-checked.

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

export { CONCURRENCY };
