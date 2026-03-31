# BookLib Retrieval Quality — Research Notes

> **Status:** Pending benchmark run. Fill in after running `booklib benchmark`.

## Baseline vs Hybrid Pipeline

| Configuration | MRR@5 | Recall@5 | NDCG@5 |
|---------------|-------|----------|--------|
| Baseline (vector-only) | — | — | — |
| Hybrid (BM25 + vector + RRF) | — | — | — |
| Hybrid + cross-encoder reranking | — | — | — |

## Mapping to arxiv 2602.12430

Claims under investigation:
- §3.2: "Hybrid retrieval improves MRR@5 by 40–60% over dense-only baselines"
- §4.1: "Cross-encoder reranking adds 10–15% on top of hybrid fusion"
- §5.3: "Query expansion with hypothetical document embeddings improves recall on long-tail queries"

## Notes

_Fill in after running `booklib benchmark` against the live index._
