import fs from 'node:fs';
import path from 'node:path';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const RATE_MS = 334; // ~3 req/sec (Notion's limit)
const PAGE_SIZE = 100;

export class NotionConnector {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey ?? process.env.NOTION_API_KEY;
    this.rateMs = opts.rateMs ?? RATE_MS;
  }

  /**
   * Check if API key is configured.
   * @returns {{ ok: boolean, error?: string }}
   */
  checkAuth() {
    if (!this.apiKey) {
      return {
        ok: false,
        error: 'NOTION_API_KEY not set. Create an integration at https://www.notion.so/my-integrations then: export NOTION_API_KEY=<token>',
      };
    }
    return { ok: true };
  }

  /**
   * Fetch a single page and its content blocks, save as markdown.
   * @param {string} pageId
   * @param {string} outputDir
   * @returns {Promise<{ pageCount: number, title: string }>}
   */
  async fetchPage(pageId, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    const page = await this._apiGet(`/pages/${pageId}`);
    const title = this._extractTitle(page);

    const blocks = await this._getAllBlocks(pageId);

    const md = this._blocksToMarkdown(blocks, title);
    const filename = this._sanitizeFilename(title || pageId) + '.md';
    fs.writeFileSync(path.join(outputDir, filename), md);

    return { pageCount: 1, title };
  }

  /**
   * Fetch all entries from a Notion database, each as a markdown file.
   * @param {string} databaseId
   * @param {string} outputDir
   * @param {object} [opts]
   * @param {string} [opts.since] - ISO date, only fetch entries edited after this
   * @returns {Promise<{ pageCount: number }>}
   */
  async fetchDatabase(databaseId, outputDir, opts = {}) {
    fs.mkdirSync(outputDir, { recursive: true });

    let hasMore = true;
    let startCursor;
    let count = 0;

    while (hasMore) {
      const body = { page_size: PAGE_SIZE };
      if (startCursor) body.start_cursor = startCursor;
      if (opts.since) {
        body.filter = {
          timestamp: 'last_edited_time',
          last_edited_time: { after: opts.since },
        };
      }

      const result = await this._apiPost(`/databases/${databaseId}/query`, body);

      for (const entry of result.results ?? []) {
        const title = this._extractTitle(entry);
        const blocks = await this._getAllBlocks(entry.id);
        const props = this._extractProperties(entry);
        const md = this._entryToMarkdown(title, props, blocks);
        const filename = this._sanitizeFilename(title || entry.id) + '.md';
        fs.writeFileSync(path.join(outputDir, filename), md);
        count++;
        await this._sleep(this.rateMs);
      }

      hasMore = result.has_more;
      startCursor = result.next_cursor;
    }

    return { pageCount: count };
  }

  /**
   * Search Notion workspace and save matching pages.
   * @param {string} query
   * @param {string} outputDir
   * @param {object} [opts]
   * @param {number} [opts.limit=20]
   * @returns {Promise<{ pageCount: number }>}
   */
  async fetchSearch(query, outputDir, opts = {}) {
    const { limit = 20 } = opts;
    fs.mkdirSync(outputDir, { recursive: true });

    const body = { query, page_size: Math.min(limit, PAGE_SIZE) };
    const result = await this._apiPost('/search', body);

    let count = 0;
    for (const item of result.results ?? []) {
      if (item.object !== 'page') continue;
      if (count >= limit) break;

      const title = this._extractTitle(item);
      const blocks = await this._getAllBlocks(item.id);
      const md = this._blocksToMarkdown(blocks, title);
      const filename = this._sanitizeFilename(title || item.id) + '.md';
      fs.writeFileSync(path.join(outputDir, filename), md);
      count++;
      await this._sleep(this.rateMs);
    }

    return { pageCount: count };
  }

  // -- Block to Markdown Conversion --

  /**
   * Convert an array of Notion blocks to markdown string.
   * @param {Array} blocks
   * @param {string} [title]
   * @returns {string}
   */
  _blocksToMarkdown(blocks, title) {
    const lines = [];
    if (title) lines.push(`# ${title}`, '');

    for (const block of blocks) {
      const md = this._blockToMd(block);
      if (md !== null) lines.push(md);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Convert a single Notion block to markdown.
   * @param {object} block
   * @param {number} [indent=0]
   * @returns {string|null}
   */
  _blockToMd(block, indent = 0) {
    const prefix = '  '.repeat(indent);
    const type = block.type;
    const data = block[type];

    if (!data) return null;

    switch (type) {
      case 'paragraph':
        return prefix + this._richTextToMd(data.rich_text);
      case 'heading_1':
        return `## ${this._richTextToMd(data.rich_text)}`;
      case 'heading_2':
        return `### ${this._richTextToMd(data.rich_text)}`;
      case 'heading_3':
        return `#### ${this._richTextToMd(data.rich_text)}`;
      case 'bulleted_list_item':
        return `${prefix}- ${this._richTextToMd(data.rich_text)}`;
      case 'numbered_list_item':
        return `${prefix}1. ${this._richTextToMd(data.rich_text)}`;
      case 'to_do':
        return `${prefix}- [${data.checked ? 'x' : ' '}] ${this._richTextToMd(data.rich_text)}`;
      case 'toggle':
        return `${prefix}<details><summary>${this._richTextToMd(data.rich_text)}</summary>\n\n${prefix}_(toggle content)_\n\n${prefix}</details>`;
      case 'code':
        return `\`\`\`${data.language ?? ''}\n${this._richTextToMd(data.rich_text)}\n\`\`\``;
      case 'quote':
        return `${prefix}> ${this._richTextToMd(data.rich_text)}`;
      case 'callout':
        return `${prefix}> ${data.icon?.emoji ?? '\u{1F4A1}'} ${this._richTextToMd(data.rich_text)}`;
      case 'divider':
        return '---';
      case 'table_of_contents':
        return '_[Table of Contents]_';
      case 'breadcrumb':
        return '';
      case 'column_list':
        return '';
      case 'column':
        return '';
      case 'child_page':
        return `- \u{1F4C4} **[${data.title}]**`;
      case 'child_database':
        return `- \u{1F5C3}\u{FE0F} **[${data.title}]**`;
      case 'embed':
        return `[Embed: ${data.url ?? ''}](${data.url ?? ''})`;
      case 'image':
        return `![image](${data.file?.url ?? data.external?.url ?? ''})`;
      case 'video':
        return `[Video: ${data.file?.url ?? data.external?.url ?? ''}]`;
      case 'pdf':
        return `[PDF: ${data.file?.url ?? data.external?.url ?? ''}]`;
      case 'file':
        return `[File: ${data.file?.url ?? data.external?.url ?? ''}]`;
      case 'audio':
        return `[Audio: ${data.file?.url ?? data.external?.url ?? ''}]`;
      case 'bookmark':
        return `[${data.caption?.length ? this._richTextToMd(data.caption) : data.url}](${data.url})`;
      case 'equation':
        return `$$${data.expression}$$`;
      case 'link_preview':
        return `[Link: ${data.url}](${data.url})`;
      case 'link_to_page':
        return '[→ Linked page]';
      case 'synced_block':
        return '_(synced block)_';
      case 'template':
        return `_(template: ${this._richTextToMd(data.rich_text)})_`;
      case 'table':
        return '';
      case 'table_row':
        if (!data.cells) return null;
        return `| ${data.cells.map(cell => this._richTextToMd(cell)).join(' | ')} |`;
      default:
        return `<!-- unknown block: ${type} -->`;
    }
  }

  /**
   * Convert Notion rich_text array to markdown string with formatting.
   * @param {Array} richText
   * @returns {string}
   */
  _richTextToMd(richText) {
    if (!Array.isArray(richText)) return '';
    return richText.map(t => {
      let text = t.plain_text ?? '';
      if (!t.annotations) return text;
      if (t.annotations.bold) text = `**${text}**`;
      if (t.annotations.italic) text = `*${text}*`;
      if (t.annotations.strikethrough) text = `~~${text}~~`;
      if (t.annotations.code) text = `\`${text}\``;
      if (t.href) text = `[${text}](${t.href})`;
      return text;
    }).join('');
  }

  // -- Property Extraction (for database entries) --

  /**
   * Extract properties from a database entry as key-value pairs.
   * @param {object} entry - Notion page object with properties
   * @returns {Record<string, string>}
   */
  _extractProperties(entry) {
    const props = {};
    for (const [key, prop] of Object.entries(entry.properties ?? {})) {
      props[key] = this._propertyToString(prop);
    }
    return props;
  }

  /**
   * Convert a single Notion property value to a string.
   * @param {object} prop
   * @returns {string}
   */
  _propertyToString(prop) {
    switch (prop.type) {
      case 'title':
        return prop.title?.map(t => t.plain_text).join('') ?? '';
      case 'rich_text':
        return prop.rich_text?.map(t => t.plain_text).join('') ?? '';
      case 'number':
        return String(prop.number ?? '');
      case 'select':
        return prop.select?.name ?? '';
      case 'multi_select':
        return (prop.multi_select ?? []).map(s => s.name).join(', ');
      case 'date':
        return prop.date?.start ?? '';
      case 'checkbox':
        return prop.checkbox ? 'Yes' : 'No';
      case 'url':
        return prop.url ?? '';
      case 'email':
        return prop.email ?? '';
      case 'phone_number':
        return prop.phone_number ?? '';
      case 'status':
        return prop.status?.name ?? '';
      case 'people':
        return (prop.people ?? []).map(p => p.name ?? p.id).join(', ');
      case 'relation':
        return (prop.relation ?? []).map(r => r.id).join(', ');
      case 'rollup':
        return JSON.stringify(prop.rollup?.array ?? []);
      case 'formula':
        return String(prop.formula?.string ?? prop.formula?.number ?? prop.formula?.boolean ?? '');
      case 'created_time':
        return prop.created_time ?? '';
      case 'last_edited_time':
        return prop.last_edited_time ?? '';
      case 'created_by':
        return prop.created_by?.name ?? prop.created_by?.id ?? '';
      case 'last_edited_by':
        return prop.last_edited_by?.name ?? prop.last_edited_by?.id ?? '';
      case 'files':
        return (prop.files ?? []).map(f => f.name ?? f.file?.url ?? f.external?.url ?? '').join(', ');
      case 'unique_id':
        return `${prop.unique_id?.prefix ?? ''}${prop.unique_id?.number ?? ''}`;
      case 'verification':
        return prop.verification?.state ?? '';
      default:
        return '';
    }
  }

  // -- Helpers --

  /**
   * Format a database entry as markdown with YAML-like frontmatter.
   * @param {string} title
   * @param {Record<string, string>} props
   * @param {Array} blocks
   * @returns {string}
   */
  _entryToMarkdown(title, props, blocks) {
    const lines = [];
    lines.push('---');
    for (const [key, val] of Object.entries(props)) {
      if (val && key !== 'Name' && key !== 'Title') {
        lines.push(`${key}: ${val}`);
      }
    }
    lines.push('---', '');

    const body = this._blocksToMarkdown(blocks, title);
    lines.push(body);

    return lines.join('\n');
  }

  /** Extract title from a Notion page object. */
  _extractTitle(page) {
    for (const prop of Object.values(page.properties ?? {})) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map(t => t.plain_text).join('');
      }
    }
    if (page.child_page?.title) return page.child_page.title;
    return '';
  }

  /** Get all blocks for a page, handling pagination. */
  async _getAllBlocks(pageId) {
    const allBlocks = [];
    let hasMore = true;
    let startCursor;

    while (hasMore) {
      let url = `/blocks/${pageId}/children?page_size=${PAGE_SIZE}`;
      if (startCursor) url += `&start_cursor=${startCursor}`;

      const result = await this._apiGet(url);
      allBlocks.push(...(result.results ?? []));
      hasMore = result.has_more;
      startCursor = result.next_cursor;

      if (hasMore) await this._sleep(this.rateMs);
    }

    return allBlocks;
  }

  /** Sanitize a string for use as a filename. */
  _sanitizeFilename(str) {
    return str
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 100)
      .toLowerCase();
  }

  /** GET request to Notion API. */
  async _apiGet(endpoint) {
    await this._sleep(this.rateMs);
    const res = await fetch(`${NOTION_API}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_VERSION,
      },
    });
    if (!res.ok) {
      throw new Error(`Notion API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    }
    return res.json();
  }

  /** POST request to Notion API. */
  async _apiPost(endpoint, body) {
    await this._sleep(this.rateMs);
    const res = await fetch(`${NOTION_API}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Notion API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    }
    return res.json();
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
