import path from 'node:path';
import fs from 'node:fs';
import { LocalIndex } from 'vectra';
import { pipeline } from '@huggingface/transformers';
import { resolveBookLibPaths } from '../paths.js';
import { BM25Index } from './bm25-index.js';
import { reciprocalRankFusion } from './rrf.js';
import { expandQuery } from './query-expander.js';
import { Reranker } from './reranker.js';
import { loadEdges, traverseEdges } from './graph.js';

const RRF_ORIGINAL_WEIGHT = 2;
const RRF_EXPANDED_WEIGHT = 1;
const RERANK_CANDIDATES = 20;

export class BookLibSearcher {
  constructor(indexPath) {
    this.indexPath = indexPath ?? resolveBookLibPaths().indexPath;
    this.index = new LocalIndex(this.indexPath);
    this.extractor = null;
    this.reranker = new Reranker();
  }

  async loadModel() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  async getEmbedding(text) {
    await this.loadModel();
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  get bm25Path() {
    return path.join(path.dirname(this.indexPath), 'bm25.json');
  }

  get graphFile() {
    return path.join(path.dirname(this.indexPath), 'knowledge', 'graph.jsonl');
  }

  async _vectorSearch(query, topK) {
    const vector = await this.getEmbedding(query);
    const results = await this.index.queryItems(vector, '', topK);
    return results.map(r => ({
      score: r.score,
      text: r.item.metadata.text,
      metadata: { ...r.item.metadata, text: undefined },
    }));
  }

  async search(query, limit = 5, minScore = 0.5, options = {}) {
    const { useGraph = false } = options;
    if (!(await this.index.isIndexCreated())) {
      throw new Error('Index not found. Please run "booklib index" first.');
    }

    // Fallback: no BM25 index present or corrupt — use pure vector search
    let bm25 = null;
    if (fs.existsSync(this.bm25Path)) {
      try {
        bm25 = BM25Index.load(this.bm25Path);
      } catch {
        // Corrupt BM25 — fall through to vector-only search
      }
    }

    if (!bm25) {
      const vector = await this.getEmbedding(query);
      const results = await this.index.queryItems(vector, '', limit);
      const filtered = results
        .filter(r => r.score >= minScore)
        .map(r => ({
          score: r.score,
          text: r.item.metadata.text,
          metadata: { ...r.item.metadata, text: undefined },
        }));
      return addDisplayScores(useGraph ? this._appendGraphResults(filtered) : filtered);
    }
    const { expanded } = expandQuery(query);
    const allQueries = [query, ...expanded];

    const resultLists = [];
    const weights = [];

    for (let i = 0; i < allQueries.length; i++) {
      const q = allQueries[i];
      const w = i === 0 ? RRF_ORIGINAL_WEIGHT : RRF_EXPANDED_WEIGHT;

      const [vecResults, bm25Results] = await Promise.all([
        this._vectorSearch(q, RERANK_CANDIDATES),
        Promise.resolve(bm25.search(q, RERANK_CANDIDATES)),
      ]);

      resultLists.push(vecResults, bm25Results);
      weights.push(w, w);
    }

    const merged = reciprocalRankFusion(resultLists, { weights });
    // RRF-only: consistently best for codegen (+6 on full index).
    // Parent-level reranker available but bypassed (+3 vs +6).
    // Sibling-joining available but bypassed (0 vs +6).
    const filtered = merged.slice(0, limit);
    const results = expandSiblings(filtered, merged);
    return addDisplayScores(useGraph ? this._appendGraphResults(results) : results);
  }

  // NOTE: Graph-boosted skill injection was tested (April 2026) and reverted.
  // The approach: follow see-also edges from knowledge nodes to skills, then
  // inject BM25-matched chunks from those skills into results.
  //
  // Test results showed it HURT performance:
  //   With boost:    A=15, B=15 (tied)
  //   Without boost: A=12, B=16 (BookLib +4)
  //
  // Root cause: the generic skill chunks from graph edges diluted the clean
  // search results. The synthesizer works better with focused knowledge-node
  // chunks than with a mix of knowledge + generic skill content.
  //
  // The graph edges (autoLinkSkills) still exist for future use. If graph
  // traversal is revisited, it should filter skill chunks by query relevance
  // more aggressively, or only boost when search returns <3 skill chunks.
  //
  // See: webshop-test/codegen-ab.js for the A/B test infrastructure.

  // REMOVED: _boostGraphLinkedSkills method
  // Code preserved in git history (commit before this revert).

  _appendGraphResults(results) {
    const GRAPH_EDGE_TYPES = new Set(['see-also', 'applies-to', 'extends']);
    let edges;
    try {
      edges = loadEdges({ graphFile: this.graphFile });
    } catch {
      return results;
    }
    if (edges.length === 0) return results;

    const seenIds = new Set(
      results.map(r => r.metadata?.name ?? r.metadata?.id).filter(Boolean)
    );
    const graphLinked = [];

    for (const result of results) {
      const nodeId = result.metadata?.name ?? result.metadata?.id;
      if (!nodeId) continue;

      for (const { id: neighborId, edge } of traverseEdges(nodeId, edges, 1)) {
        if (!GRAPH_EDGE_TYPES.has(edge.type)) continue;
        if (seenIds.has(neighborId)) continue;
        seenIds.add(neighborId);
        graphLinked.push({
          score: 0,
          text: '',
          metadata: { name: neighborId, source: 'graph', edgeType: edge.type },
        });
      }
    }

    return [...results, ...graphLinked];
  }
}

/**
 * Expands search results by pulling in missing siblings when >=50% of a parent's
 * chunks already appear in results.
 *
 * @param {Array} results - ranked search results with parentId metadata
 * @param {Array} allChunks - all candidate chunks (for looking up missing siblings)
 * @returns {Array} expanded results
 */
export function expandSiblings(results, allChunks) {
  const EXPANSION_THRESHOLD = 0.5;

  // Group matched results by parentId
  const parentGroups = new Map();
  for (const r of results) {
    const parentId = r.metadata?.parentId;
    if (!parentId) continue;
    if (!parentGroups.has(parentId)) parentGroups.set(parentId, []);
    parentGroups.get(parentId).push(r);
  }

  // Determine which parents qualify for expansion
  const expandedParentIds = new Set();
  for (const [parentId, matched] of parentGroups) {
    const siblingCount = matched[0].metadata?.siblingCount;
    if (siblingCount && matched.length / siblingCount >= EXPANSION_THRESHOLD) {
      expandedParentIds.add(parentId);
    }
  }

  if (expandedParentIds.size === 0) return results;

  // Collect all sibling chunks from allChunks for expanded parents
  const existingKeys = new Set(
    results.map(r => `${r.metadata?.parentId ?? ''}:${r.metadata?.siblingIndex ?? ''}`)
  );
  const expansionsByParent = new Map();
  for (const chunk of allChunks) {
    const parentId = chunk.metadata?.parentId;
    if (!parentId || !expandedParentIds.has(parentId)) continue;
    const key = `${parentId}:${chunk.metadata?.siblingIndex ?? ''}`;
    if (existingKeys.has(key)) continue;
    if (!expansionsByParent.has(parentId)) expansionsByParent.set(parentId, []);
    expansionsByParent.get(parentId).push({ ...chunk, score: 0 });
    existingKeys.add(key);
  }

  // Build final result: keep all original results, insert expanded siblings after their group
  const output = [];
  const handledParents = new Set();

  for (const r of results) {
    output.push(r);
    const parentId = r.metadata?.parentId;
    if (parentId && expandedParentIds.has(parentId) && !handledParents.has(parentId)) {
      handledParents.add(parentId);
      const extras = expansionsByParent.get(parentId) ?? [];
      extras.sort((a, b) => (a.metadata?.siblingIndex ?? 0) - (b.metadata?.siblingIndex ?? 0));
      output.push(...extras);
    }
  }

  return output;
}

function addDisplayScores(results) {
  return results.map((r, i) => ({ ...r, displayScore: r.displayScore ?? Math.round(100 / (i + 1)) }));
}
