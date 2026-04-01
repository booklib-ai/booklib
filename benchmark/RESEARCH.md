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

## Techniques Used and Their Evidence Base

### Established techniques (standard IR practice, no specific citation needed)
- **BM25 + vector hybrid retrieval** — widely adopted in production search systems
- **Reciprocal Rank Fusion** — standard technique for combining ranked lists
- **Cross-encoder reranking** — standard re-ranking approach, well-studied

### Research-backed techniques (preprints, use with caveats)
- **SRAG metadata prefixes** (arxiv:2603.26670) — prepending `[skill:X] [type:Y]` to chunks
  before embedding. Claims 30% QA improvement. *Caveat: recent preprint, not yet peer-reviewed
  or independently replicated. Implemented in BookLib based on the technique's intuitive merit.*

- **ETH Zurich context study** (arxiv:2602.11988) — finding that unstructured context files
  reduce agent performance. *Source quality: 4/5 — ETH Zurich SRI Lab, rigorous methodology.
  Preprint, but institution reputation is strong. Informed BookLib's config assembler design
  (30-60 line structured files instead of 10,000-line dumps).*

### Claims to verify with BookLib's own benchmarks

- Does hybrid retrieval improve MRR@5 over vector-only? → Compare row 1 vs row 3.
- Does cross-encoder reranking add measurable improvement? → Compare row 2 vs row 3.
- Does graph augmentation improve Recall@5 on multi-skill queries? → Compare row 3 vs row 4.

## Notes

- Baseline numbers should be captured before switching to the hybrid pipeline. Use git to
  revert `lib/engine/searcher.js` temporarily if the baseline run was missed.
- All rows should be produced from the same index build to ensure comparability.
- The `benchmark/ground-truth.json` file contains 23 curated query→skill pairs covering
  all skill areas. Queries 18–23 are specifically designed for long-tail and multi-skill recall.
