import fs from 'fs';
import path from 'path';
import { LocalIndex } from 'vectra';
import { parseSkillFile } from './parser.js';
import { resolveBookLibPaths } from '../paths.js';
import { BM25Index } from './bm25-index.js';
import { createEmbeddingPipeline, batchEmbed, BATCH_SIZE } from './embedding-provider.js';

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
    if (!fs.existsSync(this.bm25Path)) return new BM25Index();
    try {
      return BM25Index.load(this.bm25Path);
    } catch {
      // Corrupt BM25 — rebuild from scratch
      return new BM25Index();
    }
  }

  /**
   * Loads the embedding model with GPU auto-detection (lazy-loaded).
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
      const { extractor, providerInfo } = await createEmbeddingPipeline({ quiet });
      this.extractor = extractor;
      this.providerInfo = providerInfo;
    }
  }

  /**
   * Generates a vector embedding for a single string.
   * Used for search queries and single-node indexing.
   */
  async getEmbedding(text) {
    await this.loadModel({ quiet: true });
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
    const { quiet = false, onProgress, onFileProgress, onStatus, sourceName } = opts;

    if (clearFirst && fs.existsSync(this.indexPath)) {
      fs.rmSync(this.indexPath, { recursive: true, force: true });
    }

    // Validate vectra index.json — if corrupt (0 bytes or truncated JSON), delete and recreate.
    const vectraIndexFile = path.join(this.indexPath, 'index.json');
    if (fs.existsSync(vectraIndexFile)) {
      let corrupt = false;
      const stat = fs.statSync(vectraIndexFile);
      if (stat.size === 0) {
        corrupt = true;
      } else {
        try {
          JSON.parse(fs.readFileSync(vectraIndexFile, 'utf8'));
        } catch {
          corrupt = true;
        }
      }
      if (corrupt) {
        fs.rmSync(this.indexPath, { recursive: true, force: true });
        fs.mkdirSync(this.indexPath, { recursive: true });
        this.index = new LocalIndex(this.indexPath);
      }
    }

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }

    const files = this.getFiles(dirPath, ['.md', '.mdc']);
    if (!quiet) console.log(`Found ${files.length} skill files to index in ${dirPath}.`);

    // Pre-warm the model so the load message respects the quiet flag.
    await this.loadModel({ quiet });
    const bm25Chunks = [];

    // Phase 1: Parse all files and collect chunks
    let totalFiles = 0;
    let skipped = 0;
    const allChunks = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(dirPath, file);
      let chunks;
      try {
        chunks = parseSkillFile(content, relativePath);
      } catch (err) {
        if (quiet) {
          skipped++;
        } else {
          process.stderr.write(`Skipping ${relativePath}: ${err.message}\n`);
        }
        continue;
      }

      if (quiet) {
        totalFiles++;
      } else {
        console.log(`Parsing ${relativePath} (${chunks.length} chunks)...`);
      }
      onFileProgress?.({ current: fileIndex + 1, total: files.length, file: relativePath });

      bm25Chunks.push(...chunks);
      allChunks.push(...chunks);
    }

    // Phase 2: Batch-embed all chunks for throughput
    const texts = allChunks.map(c => buildMetadataPrefix(c.metadata) + c.text);
    const vectors = await batchEmbed(this.extractor, texts, BATCH_SIZE, ({ done, total }) => {
      onProgress?.({ current: done, total, file: `embedding ${done}/${total}` });
    });

    // Phase 3: Batch-insert into vectra (single disk write instead of N)
    onStatus?.('saving');
    const items = allChunks.map((chunk, i) => {
      const meta = { ...chunk.metadata, text: chunk.text };
      if (sourceName) meta.sourceName = sourceName;
      return { vector: vectors[i], metadata: meta };
    });
    await this.index.beginUpdate();
    for (const item of items) {
      await this.index.insertItem(item);
    }
    await this.index.endUpdate();

    // Tag BM25 chunks with sourceName so disconnect can filter them out
    if (sourceName) {
      for (const chunk of bm25Chunks) {
        chunk.metadata = { ...chunk.metadata, sourceName };
      }
    }

    if (clearFirst) {
      // Full rebuild from scratch
      const bm25 = new BM25Index();
      bm25.build(bm25Chunks);
      bm25.save(this.bm25Path);
    } else {
      // Append to existing — don't rebuild 19K docs for 200 new chunks
      const bm25 = this._loadOrCreateBM25();
      for (const chunk of bm25Chunks) {
        bm25.add(chunk);
      }
      bm25.save(this.bm25Path);
    }

    if (quiet) {
      console.log(`  Indexed ${totalFiles} files (${allChunks.length} chunks)`);
      if (skipped > 0) {
        console.log(`  ${skipped} file(s) skipped (malformed frontmatter)`);
      }
    } else {
      console.log('Indexing complete.');
    }

    return { files: totalFiles, chunks: allChunks.length };
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

    // Auto-link knowledge nodes to matching skills
    try {
      const { autoLinkSkills } = await import('./auto-linker.js');
      const matterLib = (await import('gray-matter')).default;

      const knowledgeNodes = files.map(file => {
        const content = fs.readFileSync(file, 'utf8');
        const { data, content: body } = matterLib(content);
        return { id: data.id, title: data.title ?? '', tags: data.tags ?? [], body: body?.slice(0, 500) ?? '' };
      }).filter(n => n.id);

      // Collect skill tags + descriptions from the skills directory
      const skillsPath = path.resolve(this.indexPath, '..', '..', 'skills');
      const skillTags = [];
      if (fs.existsSync(skillsPath)) {
        for (const dir of fs.readdirSync(skillsPath)) {
          const skillFile = path.join(skillsPath, dir, 'SKILL.md');
          if (!fs.existsSync(skillFile)) continue;
          const { data } = matterLib(fs.readFileSync(skillFile, 'utf8'));
          if (data.name) {
            skillTags.push({ name: data.name, tags: data.tags ?? [], description: data.description ?? '' });
          }
        }
      }

      if (knowledgeNodes.length > 0 && skillTags.length > 0) {
        const links = await autoLinkSkills({ knowledgeNodes, skillTags });
        if (links.length > 0) {
          console.log(`  Auto-linked ${links.length} knowledge↔skill edge(s)`);
        }
      }
    } catch { /* auto-linking is best-effort */ }
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
