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

  async rerank(query, candidates) {
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

    return candidates
      .map((c, i) => {
        const raw = outputs[i];
        const scores = Array.isArray(raw) ? raw : [raw];
        const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
        return { ...c, score: best.score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
