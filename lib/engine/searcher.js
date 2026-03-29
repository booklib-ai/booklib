import path from 'path';
import { LocalIndex } from 'vectra';
import { pipeline } from '@xenova/transformers';

/**
 * Handles semantic retrieval from the BookLib knowledge base.
 */
export class BookLibSearcher {
  constructor(indexPath = path.join(process.cwd(), '.booklib', 'index')) {
    this.indexPath = indexPath;
    this.index = new LocalIndex(indexPath);
    this.extractor = null;
  }

  /**
   * Loads the embedding model (lazy-loaded).
   */
  async loadModel() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  /**
   * Generates a vector embedding for a query string.
   */
  async getEmbedding(text) {
    await this.loadModel();
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Performs a semantic search for the given query.
   * 
   * @param {string} query - The conceptual search query.
   * @param {number} limit - Maximum number of results.
   * @param {number} minScore - Minimum similarity threshold (0-1).
   * @returns {Array<object>} - Ranked search results.
   */
  async search(query, limit = 5, minScore = 0.5) {
    if (!(await this.index.isIndexCreated())) {
      throw new Error('Index not found. Please run "booklib index" first.');
    }

    const vector = await this.getEmbedding(query);
    const results = await this.index.queryItems(vector, limit);

    return results
      .filter(r => r.score >= minScore)
      .map(r => ({
        score: r.score,
        text: r.item.metadata.text,
        metadata: { ...r.item.metadata, text: undefined } // Remove redundant text from metadata
      }));
  }
}
