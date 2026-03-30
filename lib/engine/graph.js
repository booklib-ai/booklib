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

export function generateNodeId(prefix = 'node') {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

export function serializeNode({
  id, type, title, content = '',
  sources = [], tags = [], area = null,
  confidence = 'high', paths: nodePaths = [],
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
  const { nodesDir: defaultDir } = resolveKnowledgePaths();
  const dir = nodesDir ?? defaultDir;
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.md`);
  fs.writeFileSync(filePath, nodeContent, 'utf8');
  return filePath;
}

export function loadNode(id, { nodesDir } = {}) {
  const { nodesDir: defaultDir } = resolveKnowledgePaths();
  const dir = nodesDir ?? defaultDir;
  const filePath = path.join(dir, `${id}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

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
