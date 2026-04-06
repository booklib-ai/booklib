import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import matter from 'gray-matter';
import { resolveBookLibPaths } from '../paths.js';

export function resolveKnowledgePaths() {
  const { indexPath } = resolveBookLibPaths();
  const bookLibDir = path.dirname(indexPath);
  return {
    nodesDir: path.join(bookLibDir, 'knowledge', 'nodes'),
    graphFile: path.join(bookLibDir, 'knowledge', 'graph.jsonl'),
  };
}

export const EDGE_TYPES = Object.freeze([
  'implements', 'contradicts', 'extends', 'applies-to',
  'see-also', 'inspired-by', 'supersedes', 'depends-on',
]);

export function generateNodeId(prefix = 'node') {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

/** Serializes a knowledge node to a gray-matter markdown string. */
export function serializeNode({
  id, type, title, content = '',
  sources = [], tags = [], area = null,
  confidence = 'high', nodePaths = [],
  raw = null,
}) {
  const data = { id, type, title, created: new Date().toISOString().split('T')[0] };
  if (sources.length) data.sources = sources;
  if (tags.length) data.tags = tags;
  if (area) data.area = area;
  if (confidence !== 'high') data.confidence = confidence;
  if (nodePaths.length) data.paths = nodePaths;
  if (raw) data.raw = raw;
  return matter.stringify(content.trim(), data);
}

export function saveNode(nodeContent, id, { nodesDir } = {}) {
  const dir = nodesDir ?? resolveKnowledgePaths().nodesDir;
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.md`);
  fs.writeFileSync(filePath, nodeContent, 'utf8');
  return filePath;
}

export function loadNode(id, { nodesDir } = {}) {
  const dir = nodesDir ?? resolveKnowledgePaths().nodesDir;
  const filePath = path.join(dir, `${id}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

/** Parses a node markdown file, returning frontmatter fields plus a `body` property. */
export function parseNodeFrontmatter(content) {
  const { data, content: body } = matter(content);
  return { ...data, body: body.trim() };
}

export function listNodes({ nodesDir } = {}) {
  const { nodesDir: defaultDir } = resolveKnowledgePaths();
  const dir = nodesDir ?? defaultDir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

// ── Edge primitives ──────────────────────────────────────────────────────────

export function appendEdge(edge, { graphFile } = {}) {
  const file = graphFile ?? resolveKnowledgePaths().graphFile;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(edge) + '\n', 'utf8');
}

export function loadEdges({ graphFile } = {}) {
  const file = graphFile ?? resolveKnowledgePaths().graphFile;
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const edges = [];
  for (const line of lines) {
    try {
      edges.push(JSON.parse(line));
    } catch {
      // Skip corrupt/truncated lines — one bad byte should not break all graph callers
      if (process.env.BOOKLIB_DEBUG) {
        console.warn(`[graph] Skipped corrupt edge line: ${line.slice(0, 80)}...`);
      }
    }
  }
  return edges;
}

/**
 * Resolves a node reference (exact ID or partial case-insensitive title) to a node ID.
 * Returns the matched node ID, or throws an Error with a helpful message.
 * @param {string} ref - Exact node ID or partial title string.
 * @param {{ nodesDir?: string }} [opts]
 */
export function resolveNodeRef(ref, { nodesDir } = {}) {
  const dir = nodesDir ?? resolveKnowledgePaths().nodesDir;
  const allIds = listNodes({ nodesDir: dir });

  // Exact ID match
  if (allIds.includes(ref)) return ref;

  // Title match (case-insensitive, partial)
  const matches = allIds
    .map(id => {
      const raw = loadNode(id, { nodesDir: dir });
      if (!raw) return null;
      const parsed = parseNodeFrontmatter(raw);
      return { id, title: parsed.title ?? '', type: parsed.type ?? '' };
    })
    .filter(n => n && n.title.toLowerCase().includes(ref.toLowerCase()));

  if (matches.length === 1) return matches[0].id;

  if (matches.length === 0) {
    throw new Error(`No node found matching "${ref}". Run: booklib nodes list`);
  }

  const list = matches.map(m => `  ${m.id}  [${m.type}]  ${m.title}`).join('\n');
  throw new Error(`Multiple nodes match "${ref}" — use the exact ID:\n${list}`);
}

// ── Graph traversal (BFS, max 2 hops by default) ────────────────────────────

export function traverseEdges(startId, edges, maxHops = 2) {
  const results = [];
  const visited = new Set([startId]);
  const queue = [{ id: startId, hop: 0 }];

  while (queue.length > 0) {
    const { id, hop } = queue.shift();
    if (hop >= maxHops) continue;

    const connected = edges.filter(e => e.from === id || e.to === id);
    for (const edge of connected) {
      const neighborId = edge.from === id ? edge.to : edge.from;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        results.push({ id: neighborId, edge, hop: hop + 1 });
        queue.push({ id: neighborId, hop: hop + 1 });
      }
    }
  }
  return results;
}

/**
 * Parses a links argument string like "effective-kotlin:applies-to,design-patterns:see-also"
 * into an array of { to, type } pairs. Skips entries without a colon separator.
 * @param {string} linksArg
 * @returns {{ to: string, type: string }[]}
 */
export function parseCaptureLinkArgs(linksArg) {
  if (!linksArg) return [];
  return linksArg.split(',')
    .map(pair => {
      const colonIdx = pair.lastIndexOf(':');
      if (colonIdx === -1) return null;
      return { to: pair.slice(0, colonIdx).trim(), type: pair.slice(colonIdx + 1).trim() };
    })
    .filter(Boolean);
}
