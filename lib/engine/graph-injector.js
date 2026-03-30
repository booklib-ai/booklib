// lib/engine/graph-injector.js
import { minimatch } from 'minimatch';
import {
  listNodes, loadNode, loadEdges, traverseEdges,
  parseNodeFrontmatter, resolveKnowledgePaths,
} from './graph.js';

// ── Component matching ────────────────────────────────────────────────────────

/**
 * Returns component nodes whose path globs match filePath.
 * @param {string} filePath
 * @param {Array<{id: string, paths: string[], title: string}>} components
 */
export function findOwningComponents(filePath, components) {
  return components.filter(comp =>
    (comp.paths ?? []).some(glob => minimatch(filePath, glob, { matchBase: true }))
  );
}

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Deduplicates nodes by id (keeping highest score) and sorts descending by score.
 * @param {Array<{id: string, score: number, text: string, hop: number}>} nodes
 */
export function scoreAndRankNodes(nodes) {
  const best = new Map();
  for (const node of nodes) {
    const existing = best.get(node.id);
    if (!existing || node.score > existing.score) {
      best.set(node.id, node);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// ── Main injection pipeline ───────────────────────────────────────────────────

/**
 * Builds a ranked list of relevant knowledge nodes for the given context.
 *
 * Pipeline:
 * 1. Find component nodes that own the current file (path matching)
 * 2. Semantic search for nodes matching the task context
 * 3. BFS graph traversal from all start nodes (components + semantic hits)
 * 4. Deduplicate and rank by score
 * 5. Return top N with full content loaded
 *
 * @param {object} opts
 * @param {string|null} opts.filePath - File being edited (used for component matching)
 * @param {string} opts.taskContext - Task description for semantic search
 * @param {object} opts.searcher - BookLibSearcher instance
 * @param {number} [opts.limit=8] - Max nodes to return
 * @param {number} [opts.minScore=0.35] - Minimum semantic similarity score
 * @returns {Promise<Array<{id: string, title: string, type: string, body: string, score: number}>>}
 */
export async function buildGraphContext({ filePath, taskContext, searcher, limit = 8, minScore = 0.35 }) {
  const { nodesDir } = resolveKnowledgePaths();
  const allNodeIds = listNodes({ nodesDir });
  if (allNodeIds.length === 0) return [];

  const edges = loadEdges();

  // Load all component nodes for path matching
  const componentNodes = allNodeIds
    .map(id => {
      const raw = loadNode(id, { nodesDir });
      return raw ? parseNodeFrontmatter(raw) : null;
    })
    .filter(n => n?.type === 'component');

  // 1. Component nodes that own the current file
  const owningComponents = filePath
    ? findOwningComponents(filePath, componentNodes)
    : [];

  // 2. Semantic search — only knowledge nodes (nodeKind: 'knowledge')
  let semanticResults = [];
  if (taskContext) {
    try {
      const raw = await searcher.search(taskContext, 20, minScore);
      semanticResults = raw
        .filter(r => r.metadata?.nodeKind === 'knowledge' && r.metadata?.id)
        .map(r => ({
          id: r.metadata.id,
          title: r.metadata.title,
          type: r.metadata.type,
          text: r.text,
          score: r.score,
          hop: 0,
        }));
    } catch {
      // Index may not exist yet — skip semantic step gracefully
    }
  }

  // 3. BFS traversal from all start nodes
  const startIds = new Set([
    ...owningComponents.map(c => c.id),
    ...semanticResults.map(r => r.id),
  ]);

  const traversalHits = [];
  for (const startId of startIds) {
    const hops = traverseEdges(startId, edges, 2);
    for (const { id, hop } of hops) {
      const raw = loadNode(id, { nodesDir });
      if (!raw) continue;
      const parsed = parseNodeFrontmatter(raw);
      traversalHits.push({
        id,
        title: parsed.title,
        type: parsed.type,
        text: parsed.body ?? '',
        score: 0.5 / hop, // distance penalty: hop 1 → 0.5, hop 2 → 0.25
        hop,
      });
    }
  }

  // 4. Merge, deduplicate, rank
  const ranked = scoreAndRankNodes([...semanticResults, ...traversalHits]);

  // 5. Load full content for top results
  return ranked.slice(0, limit).map(node => {
    const raw = loadNode(node.id, { nodesDir });
    const parsed = raw ? parseNodeFrontmatter(raw) : {};
    return {
      id: node.id,
      title: parsed.title ?? node.title,
      type: parsed.type ?? node.type,
      body: parsed.body ?? node.text,
      score: node.score,
    };
  });
}
