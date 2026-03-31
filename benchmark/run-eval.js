// benchmark/run-eval.js
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BookLibSearcher } from '../lib/engine/searcher.js';
import { resolveBookLibPaths } from '../lib/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mean Reciprocal Rank at k.
 * @param {string[][]} resultLists - per-query ordered retrieved skill names
 * @param {string[][]} relevantSets - per-query relevant skill names
 * @param {number} k
 */
export function computeMRR(resultLists, relevantSets, k) {
  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const results = resultLists[i].slice(0, k);
    const relevant = new Set(relevantSets[i]);
    const rank = results.findIndex(r => relevant.has(r));
    if (rank >= 0) total += 1 / (rank + 1);
  }
  return total / resultLists.length;
}

/**
 * Recall at k.
 */
export function computeRecall(resultLists, relevantSets, k) {
  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const results = new Set(resultLists[i].slice(0, k));
    const relevant = relevantSets[i];
    const hits = relevant.filter(r => results.has(r)).length;
    total += hits / relevant.length;
  }
  return total / resultLists.length;
}

/**
 * Normalized Discounted Cumulative Gain at k.
 */
export function computeNDCG(resultLists, relevantSets, k) {
  function dcg(results, relevant) {
    let score = 0;
    for (let i = 0; i < Math.min(results.length, k); i++) {
      if (relevant.has(results[i])) score += 1 / Math.log2(i + 2);
    }
    return score;
  }

  let total = 0;
  for (let i = 0; i < resultLists.length; i++) {
    const relevant = new Set(relevantSets[i]);
    const ideal = [...relevant].slice(0, k);
    const idcg = dcg(ideal, relevant);
    if (idcg === 0) continue;
    total += dcg(resultLists[i], relevant) / idcg;
  }
  return total / resultLists.length;
}

export async function run() {
  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'ground-truth.json'), 'utf8')
  );

  const { indexPath } = resolveBookLibPaths();
  const searcher = new BookLibSearcher(indexPath);
  const K = 5;

  const resultLists = [];
  const relevantSets = groundTruth.map(g => g.relevant);

  for (const { query } of groundTruth) {
    const results = await searcher.search(query, K, 0);
    resultLists.push(results.map(r => r.metadata.name).filter(Boolean));
  }

  const mrr = computeMRR(resultLists, relevantSets, K);
  const recall = computeRecall(resultLists, relevantSets, K);
  const ndcg = computeNDCG(resultLists, relevantSets, K);

  console.log(`\n  BookLib Retrieval Benchmark (${groundTruth.length} queries, @${K})\n`);
  console.log(`  MRR@${K}:    ${mrr.toFixed(3)}`);
  console.log(`  Recall@${K}: ${recall.toFixed(3)}`);
  console.log(`  NDCG@${K}:   ${ndcg.toFixed(3)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => { console.error(err); process.exit(1); });
}
