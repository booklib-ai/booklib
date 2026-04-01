import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

export class Reranker {
  constructor() {
    this._pipeline = null;
  }

  async _ensurePipelineLoaded() {
    if (this._pipeline === null) {
      this._pipeline = await pipeline('text-classification', MODEL);
    }
  }

  async rerank(query, candidates, { relevanceThreshold = 0.5 } = {}) {
    // Return empty array early without loading model if candidates is empty
    if (candidates.length === 0) {
      return [];
    }

    // Load the model on first use
    await this._ensurePipelineLoaded();

    // Create query-passage pairs
    const pairs = candidates.map(c => [query, c.text]);

    // Call the cross-encoder model
    const outputs = await this._pipeline(pairs);

    const scored = candidates
      .map((c, i) => {
        const raw = outputs[i];
        const scores = Array.isArray(raw) ? raw : [raw];
        const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
        return { ...c, score: best.score, rawScore: best.score };
      })
      .sort((a, b) => b.score - a.score);

    // Filter by threshold: sigmoid < 0.5 means the model considers the
    // passage NOT relevant (logit < 0). This is the model's natural
    // decision boundary.
    return scored.filter(r => r.score >= relevanceThreshold);
  }
}
