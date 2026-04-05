import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Install pre-built BookLib index to a target directory.
 * Decompresses gzipped index and BM25 files.
 * @param {string} targetDir - e.g., '/path/to/project/.booklib'
 * @returns {Promise<{ indexPath: string, bm25Path: string }>}
 */
export async function installIndex(targetDir) {
  const indexDir = path.join(targetDir, 'index');
  mkdirSync(indexDir, { recursive: true });

  const indexPath = path.join(indexDir, 'index.json');
  const bm25Path = path.join(targetDir, 'bm25.json');

  await decompress(path.join(__dirname, 'data', 'index.json.gz'), indexPath);
  await decompress(path.join(__dirname, 'data', 'bm25.json.gz'), bm25Path);

  return { indexPath, bm25Path };
}

/** Check if the pre-built index package data exists. */
export function hasPrebuiltIndex() {
  return existsSync(path.join(__dirname, 'data', 'index.json.gz'));
}

/** Get the data directory path. */
export function getDataDir() {
  return path.join(__dirname, 'data');
}

async function decompress(src, dest) {
  await pipeline(
    createReadStream(src),
    createGunzip(),
    createWriteStream(dest),
  );
}
