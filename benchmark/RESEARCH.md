# BookLib Retrieval Quality — Research Notes

> **Status:** Pending benchmark run. Fill in after running `booklib benchmark`.

## How to Generate These Results

1. Build the full skill index: `node bin/booklib.js index skills/`
2. Run the benchmark: `node bin/booklib.js benchmark`
3. Record MRR@5, Recall@5, NDCG@5 in the table below for each configuration.
4. For the graph-augmented row: capture a few cross-skill insight nodes with
   `booklib capture --title "..." --links "skill-a:see-also,skill-b:applies-to"`,
   then re-run `node bin/booklib.js search "<query>" --graph` manually and note changes
   in Recall@5 for multi-skill queries (queries 18–23 in `ground-truth.json`).

## Retrieval Quality Results

| Configuration | MRR@5 | Recall@5 | NDCG@5 |
|---------------|-------|----------|--------|
| Baseline (vector-only, pre-Spec-2) | — | — | — |
| Hybrid (BM25 + vector + RRF) | — | — | — |
| Hybrid + cross-encoder reranking | — | — | — |
| Graph-augmented (hybrid + reranking + `--graph`) | — | — | — |

## Mapping to arxiv 2602.12430

Claims under investigation:

- **§3.2**: "Hybrid retrieval improves MRR@5 by 40–60% over dense-only baselines"
  → Compare row 1 vs row 3 above.

- **§4.1**: "Cross-encoder reranking adds 10–15% on top of hybrid fusion"
  → Compare row 2 vs row 3 above.

- **§5.3**: "Query expansion with hypothetical document embeddings improves recall on long-tail queries"
  → Examine Recall@5 on long-tail queries in `benchmark/ground-truth.json` (queries 18–23).

- **Graph augmentation** (BookLib-specific, not in arxiv): Does one-hop edge traversal via
  `--graph` improve Recall@5 on multi-skill queries? Capture 10 cross-skill insight nodes
  linking related skills, re-run benchmark, compare row 3 vs row 4.

## Notes

- Baseline numbers should be captured before switching to the hybrid pipeline. Use git to
  revert `lib/engine/searcher.js` temporarily if the baseline run was missed.
- All rows should be produced from the same index build to ensure comparability.
- The `benchmark/ground-truth.json` file contains 23 curated query→skill pairs covering
  all skill areas. Queries 18–23 are specifically designed for long-tail and multi-skill recall.
