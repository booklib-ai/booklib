import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';
import { LocalIndex } from 'vectra';
import { parseSkillFile } from './parser.js';

/**
 * Handles the creation and updating of the semantic index for the BookLib library.
 */
export class BookLibIndexer {
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
      console.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  /**
   * Generates a vector embedding for a string.
   */
  async getEmbedding(text) {
    await this.loadModel();
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Indexes a directory of skills.
   * 
   * @param {string} dirPath - The root directory of the skills library.
   * @param {boolean} clearFirst - Whether to clear the index before starting.
   */
  async indexDirectory(dirPath, clearFirst = false) {
    if (clearFirst && fs.existsSync(this.indexPath)) {
      fs.rmSync(this.indexPath, { recursive: true, force: true });
    }

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }

    const files = this.getFiles(dirPath, ['.md', '.mdc']);
    console.log(`Found ${files.length} skill files to index in ${dirPath}.`);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(dirPath, file);
      const chunks = parseSkillFile(content, relativePath);

      console.log(`Indexing ${relativePath} (${chunks.length} chunks)...`);

      for (const chunk of chunks) {
        const vector = await this.getEmbedding(chunk.text);
        await this.index.insertItem({
          vector,
          metadata: { ...chunk.metadata, text: chunk.text }
        });
      }
    }

    console.log('Indexing complete.');
  }

  /**
   * Helper to recursively list files with specific extensions.
   */
  getFiles(dir, extensions) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getFiles(file, extensions));
      } else {
        if (extensions.some(ext => file.endsWith(ext))) {
          results.push(file);
        }
      }
    });
    return results;
  }
}
