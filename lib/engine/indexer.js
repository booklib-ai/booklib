import fs from 'fs';
import path from 'path';
import { pipeline } from '@huggingface/transformers';
import { LocalIndex } from 'vectra';
import { parseSkillFile } from './parser.js';
import { resolveBookLibPaths } from '../paths.js';
import { BM25Index } from './bm25-index.js';

/**
 * Builds a structured metadata prefix for SRAG-style embeddings.
 * Prepended to chunk text before vector embedding so the model encodes domain context.
 * @param {object} metadata - Chunk metadata (name/title, type, tags).
 * @returns {string} Prefix string like "[skill:X] [type:Y] [tags:a,b] " or "".
 */
export function buildMetadataPrefix(metadata) {
  const parts = [];
  const label = metadata.name ?? metadata.title;
  if (label) parts.push(`[skill:${label}]`);
  if (metadata.type) parts.push(`[type:${metadata.type}]`);
  if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
    parts.push(`[tags:${metadata.tags.join(',')}]`);
  }
  return parts.length > 0 ? parts.join(' ') + ' ' : '';
}

/**
 * Handles the creation and updating of the semantic index for the BookLib library.
 */
export class BookLibIndexer {
  constructor(indexPath) {
    this.indexPath = indexPath ?? resolveBookLibPaths().indexPath;
    fs.mkdirSync(this.indexPath, { recursive: true });
    this.index = new LocalIndex(this.indexPath);
    this.extractor = null;
  }

  get bm25Path() {
    return path.join(path.dirname(this.indexPath), 'bm25.json');
  }

  _loadOrCreateBM25() {
    return fs.existsSync(this.bm25Path) ? BM25Index.load(this.bm25Path) : new BM25Index();
  }

  /**
   * Loads the embedding model (lazy-loaded).
   * @param {Object} opts
   * @param {boolean} [opts.quiet=false] - Suppress the "Loading local embedding model..." message.
   */
  async loadModel(opts = {}) {
    const { quiet = false } = opts;
    if (!this.extractor) {
      const indexExists = await this.index.isIndexCreated().catch(() => false);
      if (!indexExists) {
        console.log('First run: downloading embedding model (~25 MB, ~1 min)...');
      } else if (!quiet) {
        console.log('Loading local embedding model...');
      }
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
   * @param {Object} opts
   * @param {boolean} [opts.quiet=false] - Suppress per-file output; print a single summary instead.
   */
  async indexDirectory(dirPath, clearFirst = false, opts = {}) {
    const { quiet = false } = opts;

    if (clearFirst && fs.existsSync(this.indexPath)) {
      fs.rmSync(this.indexPath, { recursive: true, force: true });
    }

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }

    const files = this.getFiles(dirPath, ['.md', '.mdc']);
    if (!quiet) console.log(`Found ${files.length} skill files to index in ${dirPath}.`);

    // Pre-warm the model so the load message respects the quiet flag.
    await this.loadModel({ quiet });
    const bm25Chunks = [];

    let totalFiles = 0;
    let totalChunks = 0;
    let skipped = 0;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(dirPath, file);
      let chunks;
      try {
        chunks = parseSkillFile(content, relativePath);
      } catch (err) {
        if (quiet) {
          skipped++;
        } else {
          process.stderr.write(`⚠ Skipping ${relativePath}: ${err.message}\n`);
        }
        continue;
      }

      if (quiet) {
        totalFiles++;
        totalChunks += chunks.length;
      } else {
        console.log(`Indexing ${relativePath} (${chunks.length} chunks)...`);
      }

      bm25Chunks.push(...chunks);

      for (const chunk of chunks) {
        const prefixedText = buildMetadataPrefix(chunk.metadata) + chunk.text;
        const vector = await this.getEmbedding(prefixedText);
        await this.index.insertItem({
          vector,
          metadata: { ...chunk.metadata, text: chunk.text }
        });
      }
    }

    const bm25 = new BM25Index();
    bm25.build(bm25Chunks);
    bm25.save(this.bm25Path);

    if (quiet) {
      console.log(`  Indexed ${totalFiles} files (${totalChunks} chunks)`);
      if (skipped > 0) {
        console.log(`  ⚠ ${skipped} file(s) skipped (malformed frontmatter)`);
      }
    } else {
      console.log('Indexing complete.');
    }
  }

  /**
   * Indexes a single knowledge node file into the existing index.
   * Safe to call after each capture command — only adds the new node.
   * @param {string} filePath - Absolute path to the node .md file.
   * @param {string} nodesDir - Root nodes directory (used for relative path in metadata).
   */
  async indexNodeFile(filePath, nodesDir) {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(nodesDir, filePath);
    let chunks;
    try {
      chunks = parseSkillFile(content, relativePath);
    } catch (err) {
      process.stderr.write(`⚠ Skipping node ${relativePath}: ${err.message}\n`);
      return;
    }

    // If body is empty, index the frontmatter fields so the node is still findable by title/tags
    if (chunks.length === 0) {
      const matter = (await import('gray-matter')).default;
      const { data } = matter.read(filePath);
      const fallbackText = [data.title, data.type, ...(data.tags ?? [])].filter(Boolean).join(' ');
      if (!fallbackText) return;
      const prefixedFallback = buildMetadataPrefix(data) + fallbackText;
      const vector = await this.getEmbedding(prefixedFallback);
      await this.index.insertItem({
        vector,
        metadata: { text: fallbackText, id: data.id, title: data.title, type: data.type, nodeKind: 'knowledge', nodeFile: filePath }
      });
      const bm25 = this._loadOrCreateBM25();
      bm25.add({ text: fallbackText, metadata: { id: data.id, title: data.title, type: data.type, nodeKind: 'knowledge', nodeFile: filePath } });
      bm25.save(this.bm25Path);
      return;
    }

    for (const chunk of chunks) {
      const prefixedText = buildMetadataPrefix(chunk.metadata) + chunk.text;
      const vector = await this.getEmbedding(prefixedText);
      await this.index.insertItem({
        vector,
        metadata: { ...chunk.metadata, text: chunk.text, nodeKind: 'knowledge', nodeFile: filePath }
      });
    }

    const bm25 = this._loadOrCreateBM25();
    for (const chunk of chunks) bm25.add(chunk);
    bm25.save(this.bm25Path);
  }

  /**
   * Indexes all knowledge nodes from .booklib/knowledge/nodes/.
   * Used by `booklib index` to rebuild the full knowledge portion of the index.
   * @param {string} nodesDir - Path to the nodes directory.
   */
  async indexKnowledgeNodes(nodesDir) {
    if (!fs.existsSync(nodesDir)) return;

    const files = this.getFiles(nodesDir, ['.md']);
    if (files.length === 0) return;
    console.log(`Indexing ${files.length} knowledge node(s)...`);

    for (const file of files) {
      await this.indexNodeFile(file, nodesDir);
    }
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
