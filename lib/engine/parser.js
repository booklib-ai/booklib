import matter from 'gray-matter';

/**
 * Parses a markdown/mdc file and extracts semantic chunks based on XML tags.
 * Each chunk includes the file's frontmatter as metadata.
 * 
 * @param {string} content - The raw content of the file.
 * @param {string} filePath - The path to the file (for metadata).
 * @returns {Array<{text: string, metadata: object}>} - Array of semantic chunks.
 */
export function parseSkillFile(content, filePath) {
  const { data: frontmatter, content: body } = matter(content);
  const chunks = [];

  // 1. Extract the full summary/intro (everything before the first XML tag)
  const introMatch = body.split(/<[a-z_]+>/)[0].trim();
  if (introMatch) {
    chunks.push({
      text: introMatch,
      metadata: { ...frontmatter, filePath, type: 'summary' }
    });
  }

  // 2. Extract content from XML tags (Universal & Programming)
  const tagRegex = /<([a-z_]+)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(body)) !== null) {
    const tagName = match[1];
    const tagContent = match[2].trim();
    if (tagContent) {
      // Map domain-specific tags to universal categories
      let category = tagName;
      if (tagName === 'core_principles') category = 'framework';
      if (tagName === 'anti_patterns') category = 'pitfalls';
      if (tagName === 'examples') category = 'case_studies';

      chunks.push({
        text: tagContent,
        metadata: { ...frontmatter, filePath, type: category, originalTag: tagName }
      });
    }
  }

  // 3. If no XML tags were found but there is a body, treat the whole body as a chunk
  if (chunks.length <= 1 && body.trim() && body.trim() !== introMatch) {
    chunks.push({
      text: body.trim(),
      metadata: { ...frontmatter, filePath, type: 'content' }
    });
  }

  return chunks;
}
