import { createHash } from 'node:crypto';
import matter from 'gray-matter';

const NEGATION_WORDS = ['never', 'not', "don't", 'instead', 'but', 'however', 'avoid', 'do not'];

const XML_TAG_SECTION_MAP = {
  core_principles: 'framework',
  anti_patterns: 'pitfalls',
  examples: 'case_studies',
};

/**
 * Generates a stable parentId from document name and header text.
 */
function makeParentId(docName, headerText) {
  return createHash('sha256')
    .update(`${docName}::${headerText}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Infer section type from header text or surrounding XML tag.
 */
function inferSection(headerText, xmlTag) {
  if (xmlTag && XML_TAG_SECTION_MAP[xmlTag]) return XML_TAG_SECTION_MAP[xmlTag];

  const lower = headerText.toLowerCase();
  if (/principle|rule/.test(lower)) return 'framework';
  if (/anti|avoid|pitfall/.test(lower)) return 'pitfalls';
  if (/example|case/.test(lower)) return 'case_studies';
  return 'content';
}

/**
 * Detect which XML tag (if any) wraps a line range within the body.
 */
function detectXmlTag(body, sectionText) {
  for (const [tag] of Object.entries(XML_TAG_SECTION_MAP)) {
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    const openIdx = body.indexOf(openTag);
    const closeIdx = body.indexOf(closeTag);
    if (openIdx !== -1 && closeIdx !== -1) {
      const tagContent = body.slice(openIdx + openTag.length, closeIdx);
      if (tagContent.includes(sectionText)) return tag;
    }
  }
  return null;
}

/**
 * Extracts keywords (>3 chars) from text for contradiction detection.
 */
function extractKeywords(text) {
  return new Set(
    text.toLowerCase().match(/\b[a-z]{4,}\b/g) || []
  );
}

/**
 * Returns true if chunkB starts with a negation word and shares
 * a keyword (>3 chars) with chunkA.
 */
function shouldMerge(textA, textB) {
  const lowerB = textB.toLowerCase().trimStart();
  const startsWithNegation = NEGATION_WORDS.some(w => lowerB.startsWith(w));
  if (!startsWithNegation) return false;

  const kwA = extractKeywords(textA);
  const kwB = extractKeywords(textB);
  for (const kw of kwB) {
    if (kwA.has(kw)) return true;
  }
  return false;
}

/**
 * Splits a section body into atomic chunks: bullets, numbered items,
 * bold-headed paragraphs, or plain paragraphs.
 */
function splitSectionBody(body) {
  const lines = body.split('\n');
  const rawChunks = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const isBullet = /^[-*] /.test(trimmed);
    const isNumbered = /^\d+\.\s/.test(trimmed);
    const isBoldHead = /^\*\*[^*]+\*\*/.test(trimmed);
    const isContinuation = !isBullet && !isNumbered && !isBoldHead
      && current !== null && trimmed.length > 0
      && (line.startsWith('  ') || line.startsWith('\t'));

    if (isBullet || isNumbered || isBoldHead) {
      if (current !== null) rawChunks.push(current);
      const cleaned = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '');
      current = cleaned;
    } else if (isContinuation) {
      current += ' ' + trimmed;
    } else if (trimmed.length > 0) {
      // Plain paragraph line that isn't a continuation
      if (current !== null) rawChunks.push(current);
      current = trimmed;
    }
    // Skip blank lines (they just separate things)
  }
  if (current !== null) rawChunks.push(current);
  return rawChunks;
}

/**
 * Apply contradiction guard: merge adjacent chunks where the second
 * negates the first.
 */
function applyContradictionGuard(chunks) {
  if (chunks.length <= 1) return chunks;
  const merged = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = merged[merged.length - 1];
    if (shouldMerge(prev, chunks[i])) {
      merged[merged.length - 1] = prev + '\n' + chunks[i];
    } else {
      merged.push(chunks[i]);
    }
  }
  return merged;
}

/**
 * Strip XML tags from text, returning the inner content.
 */
function stripXmlTags(text) {
  return text.replace(/<\/?[a-z_]+>/g, '').trim();
}

/**
 * Splits any markdown document into atomic chunks with parent references.
 *
 * @param {string} content - Raw markdown content (may include YAML frontmatter)
 * @param {string} filePath - Path to the source file
 * @returns {Array<{text: string, parentId: string, parentTitle: string, siblingIndex: number, siblingCount: number, section: string, metadata: object}>}
 */
export function splitMarkdown(content, filePath) {
  const { data: frontmatter, content: body } = matter(content);
  const docName = frontmatter.name || filePath;
  const allChunks = [];

  // Split body by ## headers
  const headerRegex = /^## (.+)$/gm;
  const headers = [];
  let match;
  while ((match = headerRegex.exec(body)) !== null) {
    headers.push({ title: match[1].trim(), index: match.index });
  }

  // Content before first header is the summary
  const preHeaderText = headers.length > 0
    ? body.slice(0, headers[0].index).trim()
    : body.trim();

  if (preHeaderText && headers.length > 0) {
    const cleaned = stripXmlTags(preHeaderText);
    if (cleaned) {
      allChunks.push({
        text: cleaned,
        parentId: makeParentId(docName, 'summary'),
        parentTitle: docName,
        siblingIndex: 0,
        siblingCount: 1,
        section: 'summary',
        metadata: { ...frontmatter, filePath },
      });
    }
  }

  // No headers: whole document under title parent
  if (headers.length === 0) {
    const cleaned = stripXmlTags(preHeaderText);
    if (cleaned) {
      const bodyChunks = splitSectionBody(cleaned);
      const merged = applyContradictionGuard(bodyChunks);
      const parentId = makeParentId(docName, docName);
      for (let i = 0; i < merged.length; i++) {
        allChunks.push({
          text: merged[i],
          parentId,
          parentTitle: docName,
          siblingIndex: i,
          siblingCount: merged.length,
          section: 'content',
          metadata: { ...frontmatter, filePath },
        });
      }
    }
    return allChunks;
  }

  // Process each header section
  for (let h = 0; h < headers.length; h++) {
    const header = headers[h];
    const nextStart = h + 1 < headers.length ? headers[h + 1].index : body.length;
    const sectionRaw = body.slice(
      header.index + body.slice(header.index).indexOf('\n') + 1,
      nextStart
    ).trim();

    const xmlTag = detectXmlTag(body, sectionRaw.slice(0, 80));
    const section = inferSection(header.title, xmlTag);
    const cleaned = stripXmlTags(sectionRaw);
    if (!cleaned) continue;

    const bodyChunks = splitSectionBody(cleaned);
    const merged = applyContradictionGuard(bodyChunks);
    const parentId = makeParentId(docName, header.title);

    for (let i = 0; i < merged.length; i++) {
      allChunks.push({
        text: merged[i],
        parentId,
        parentTitle: header.title,
        siblingIndex: i,
        siblingCount: merged.length,
        section,
        metadata: { ...frontmatter, filePath },
      });
    }
  }

  return allChunks;
}

/**
 * Backwards-compatible wrapper. Returns [{text, metadata}] format
 * with parent fields included in metadata.
 *
 * @param {string} content - Raw file content
 * @param {string} filePath - Path to the file
 * @returns {Array<{text: string, metadata: object}>}
 */
export function parseSkillFile(content, filePath) {
  const chunks = splitMarkdown(content, filePath);
  return chunks.map(chunk => ({
    text: chunk.text,
    metadata: {
      ...chunk.metadata,
      type: chunk.section,
      parentId: chunk.parentId,
      parentTitle: chunk.parentTitle,
      siblingIndex: chunk.siblingIndex,
      siblingCount: chunk.siblingCount,
    },
  }));
}
