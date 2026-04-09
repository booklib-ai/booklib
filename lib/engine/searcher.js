import path from 'node:path';
import fs from 'node:fs';
import { LocalIndex } from 'vectra';
import { createEmbeddingPipeline } from './embedding-provider.js';
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
    const paths = resolveBookLibPaths();
    this.indexPath = indexPath ?? paths.readIndexPath;
    this.index = new LocalIndex(this.indexPath);
    this.extractor = null;
    this.reranker = new Reranker();
  }

  async loadModel() {
    if (!this.extractor) {
      const { extractor } = await createEmbeddingPipeline({ quiet: true });
      this.extractor = extractor;
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

    // Fallback: no BM25 index present — use pure vector search (backwards compatible)
    if (!fs.existsSync(this.bm25Path)) {
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

    const bm25 = BM25Index.load(this.bm25Path);
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
    const candidates = merged.slice(0, RERANK_CANDIDATES);
    const reranked = await this.reranker.rerank(query, candidates);

    const filtered = reranked.filter(r => r.score >= minScore);

    // Sibling expansion: when ≥50% of a section's chunks match, pull in the rest.
    // This prevents fragmented results — if the search finds "import createClient",
    // expansion pulls in the full config block and services list from the same section.
    let withSiblings;
    try {
      withSiblings = this._expandSiblings(filtered, bm25);
    } catch {
      withSiblings = filtered;
    }
    const results = withSiblings.slice(0, limit);

    return addDisplayScores(useGraph ? this._appendGraphResults(results) : results);
  }

  /**
   * Expands search results by pulling in missing sibling chunks when ≥50%
   * of a parent section's chunks already appear in results.
   * @param {Array} results - search results with metadata.parentId, siblingIndex, siblingCount
   * @param {BM25Index} bm25 - BM25 index to find sibling chunks
   * @returns {Array} expanded results with siblings inserted after the first match
   */
  _expandSiblings(results, bm25) {
    // Group results by parentId
    const byParent = new Map();
    for (const r of results) {
      const pid = r.metadata?.parentId;
      if (!pid) continue;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(r);
    }

    // Find parents where ≥50% of siblings are in results
    const expandIds = new Set();
    for (const [pid, hits] of byParent) {
      const total = hits[0].metadata?.siblingCount ?? 1;
      if (total <= 1) continue;
      if (hits.length / total >= 0.5) expandIds.add(pid);
    }

    if (expandIds.size === 0) return results;

    // Find missing siblings from BM25 index's internal document store
    const allDocs = bm25._docs ?? [];
    const siblingPool = new Map(); // parentId -> [docs sorted by siblingIndex]
    for (const doc of allDocs) {
      const pid = doc.metadata?.parentId;
      if (!pid || !expandIds.has(pid)) continue;
      if (!siblingPool.has(pid)) siblingPool.set(pid, []);
      siblingPool.get(pid).push(doc);
    }

    // Sort siblings by siblingIndex
    for (const [, siblings] of siblingPool) {
      siblings.sort((a, b) => (a.metadata?.siblingIndex ?? 0) - (b.metadata?.siblingIndex ?? 0));
    }

    // Build expanded results: insert missing siblings after the first match
    const seenTexts = new Set(results.map(r => r.text));
    const expanded = [];
    const insertedParents = new Set();

    for (const r of results) {
      expanded.push(r);
      const pid = r.metadata?.parentId;
      if (pid && expandIds.has(pid) && !insertedParents.has(pid)) {
        insertedParents.add(pid);
        const siblings = siblingPool.get(pid) ?? [];
        for (const sib of siblings) {
          if (!seenTexts.has(sib.text)) {
            expanded.push({
              text: sib.text,
              score: r.score * 0.95, // slightly lower than the matched sibling
              metadata: sib.metadata,
              _expanded: true,
            });
            seenTexts.add(sib.text);
          }
        }
      }
    }

    return expanded;
  }

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

function addDisplayScores(results) {
  return results.map((r, i) => ({ ...r, displayScore: r.displayScore ?? Math.round(100 / (i + 1)) }));
}
