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

    const results = reranked.filter(r => r.score >= minScore).slice(0, limit);
    return addDisplayScores(useGraph ? this._appendGraphResults(results) : results);
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
