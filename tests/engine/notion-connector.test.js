import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NotionConnector } from '../../lib/connectors/notion.js';

/**
 * Subclass that stubs _apiGet/_apiPost to avoid real network calls.
 * Mock responses are keyed by endpoint for targeted stubbing.
 */
class TestNotionConnector extends NotionConnector {
  constructor(mockResponses = {}) {
    super({ apiKey: 'test-key', rateMs: 0 });
    this._mocks = mockResponses;
  }
  async _apiGet(endpoint) {
    return this._mocks[endpoint] ?? { results: [] };
  }
  async _apiPost(endpoint) {
    return this._mocks[endpoint] ?? { results: [], has_more: false };
  }
}

describe('NotionConnector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-notion-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('checkAuth', () => {
    it('returns ok:true when API key is set', () => {
      const n = new NotionConnector({ apiKey: 'ntn_test123' });
      const result = n.checkAuth();
      assert.equal(result.ok, true);
      assert.equal(result.error, undefined);
    });

    it('returns ok:false with helpful message when no key', () => {
      const n = new NotionConnector({ apiKey: undefined });
      const result = n.checkAuth();
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('NOTION_API_KEY'));
      assert.ok(result.error.includes('notion.so/my-integrations'));
    });
  });

  describe('_richTextToMd', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('converts plain text', () => {
      const result = n._richTextToMd([
        { plain_text: 'Hello world', annotations: {} },
      ]);
      assert.equal(result, 'Hello world');
    });

    it('applies bold formatting', () => {
      const result = n._richTextToMd([
        { plain_text: 'bold', annotations: { bold: true } },
      ]);
      assert.equal(result, '**bold**');
    });

    it('applies italic formatting', () => {
      const result = n._richTextToMd([
        { plain_text: 'italic', annotations: { italic: true } },
      ]);
      assert.equal(result, '*italic*');
    });

    it('applies code formatting', () => {
      const result = n._richTextToMd([
        { plain_text: 'code', annotations: { code: true } },
      ]);
      assert.equal(result, '`code`');
    });

    it('applies strikethrough', () => {
      const result = n._richTextToMd([
        { plain_text: 'removed', annotations: { strikethrough: true } },
      ]);
      assert.equal(result, '~~removed~~');
    });

    it('applies link with href', () => {
      const result = n._richTextToMd([
        { plain_text: 'click here', annotations: {}, href: 'https://example.com' },
      ]);
      assert.equal(result, '[click here](https://example.com)');
    });

    it('combines multiple annotations', () => {
      const result = n._richTextToMd([
        { plain_text: 'important', annotations: { bold: true, italic: true } },
      ]);
      assert.equal(result, '***important***');
    });

    it('handles empty array', () => {
      assert.equal(n._richTextToMd([]), '');
    });

    it('handles non-array input', () => {
      assert.equal(n._richTextToMd(null), '');
      assert.equal(n._richTextToMd(undefined), '');
      assert.equal(n._richTextToMd('string'), '');
    });
  });

  describe('_blockToMd', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    const richText = [{ plain_text: 'Some text', annotations: {} }];

    it('converts paragraph', () => {
      const result = n._blockToMd({ type: 'paragraph', paragraph: { rich_text: richText } });
      assert.equal(result, 'Some text');
    });

    it('converts heading_1 to ##', () => {
      const result = n._blockToMd({ type: 'heading_1', heading_1: { rich_text: richText } });
      assert.equal(result, '## Some text');
    });

    it('converts heading_2 to ###', () => {
      const result = n._blockToMd({ type: 'heading_2', heading_2: { rich_text: richText } });
      assert.equal(result, '### Some text');
    });

    it('converts heading_3 to ####', () => {
      const result = n._blockToMd({ type: 'heading_3', heading_3: { rich_text: richText } });
      assert.equal(result, '#### Some text');
    });

    it('converts bulleted_list_item', () => {
      const result = n._blockToMd({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } });
      assert.equal(result, '- Some text');
    });

    it('converts numbered_list_item', () => {
      const result = n._blockToMd({ type: 'numbered_list_item', numbered_list_item: { rich_text: richText } });
      assert.equal(result, '1. Some text');
    });

    it('converts to_do checked', () => {
      const result = n._blockToMd({ type: 'to_do', to_do: { rich_text: richText, checked: true } });
      assert.equal(result, '- [x] Some text');
    });

    it('converts to_do unchecked', () => {
      const result = n._blockToMd({ type: 'to_do', to_do: { rich_text: richText, checked: false } });
      assert.equal(result, '- [ ] Some text');
    });

    it('converts code block with language', () => {
      const result = n._blockToMd({ type: 'code', code: { rich_text: richText, language: 'javascript' } });
      assert.equal(result, '```javascript\nSome text\n```');
    });

    it('converts quote', () => {
      const result = n._blockToMd({ type: 'quote', quote: { rich_text: richText } });
      assert.equal(result, '> Some text');
    });

    it('converts callout with emoji', () => {
      const result = n._blockToMd({ type: 'callout', callout: { rich_text: richText, icon: { emoji: '\u{26A0}\u{FE0F}' } } });
      assert.ok(result.includes('\u{26A0}\u{FE0F}'));
      assert.ok(result.includes('Some text'));
    });

    it('converts callout with default emoji when none provided', () => {
      const result = n._blockToMd({ type: 'callout', callout: { rich_text: richText, icon: null } });
      assert.ok(result.includes('\u{1F4A1}'));
    });

    it('converts divider', () => {
      const result = n._blockToMd({ type: 'divider', divider: {} });
      assert.equal(result, '---');
    });

    it('converts toggle as details/summary', () => {
      const result = n._blockToMd({ type: 'toggle', toggle: { rich_text: richText } });
      assert.ok(result.includes('<details>'));
      assert.ok(result.includes('<summary>Some text</summary>'));
      assert.ok(result.includes('</details>'));
    });

    it('converts child_page', () => {
      const result = n._blockToMd({ type: 'child_page', child_page: { title: 'Sub Page' } });
      assert.ok(result.includes('Sub Page'));
    });

    it('converts child_database', () => {
      const result = n._blockToMd({ type: 'child_database', child_database: { title: 'My DB' } });
      assert.ok(result.includes('My DB'));
    });

    it('converts embed', () => {
      const result = n._blockToMd({ type: 'embed', embed: { url: 'https://example.com/embed' } });
      assert.equal(result, '[Embed: https://example.com/embed](https://example.com/embed)');
    });

    it('converts image', () => {
      const result = n._blockToMd({ type: 'image', image: { file: { url: 'https://img.com/pic.png' } } });
      assert.equal(result, '![image](https://img.com/pic.png)');
    });

    it('converts image with external url', () => {
      const result = n._blockToMd({ type: 'image', image: { external: { url: 'https://ext.com/pic.png' } } });
      assert.equal(result, '![image](https://ext.com/pic.png)');
    });

    it('converts video', () => {
      const result = n._blockToMd({ type: 'video', video: { file: { url: 'https://vid.com/v.mp4' } } });
      assert.equal(result, '[Video: https://vid.com/v.mp4]');
    });

    it('converts bookmark', () => {
      const result = n._blockToMd({ type: 'bookmark', bookmark: { url: 'https://example.com', caption: [] } });
      assert.equal(result, '[https://example.com](https://example.com)');
    });

    it('converts bookmark with caption', () => {
      const caption = [{ plain_text: 'My Link', annotations: {} }];
      const result = n._blockToMd({ type: 'bookmark', bookmark: { url: 'https://example.com', caption } });
      assert.equal(result, '[My Link](https://example.com)');
    });

    it('converts equation', () => {
      const result = n._blockToMd({ type: 'equation', equation: { expression: 'E = mc^2' } });
      assert.equal(result, '$$E = mc^2$$');
    });

    it('converts table_row', () => {
      const cells = [
        [{ plain_text: 'A', annotations: {} }],
        [{ plain_text: 'B', annotations: {} }],
      ];
      const result = n._blockToMd({ type: 'table_row', table_row: { cells } });
      assert.equal(result, '| A | B |');
    });

    it('returns comment for unknown block type', () => {
      const result = n._blockToMd({ type: 'weird_thing', weird_thing: {} });
      assert.equal(result, '<!-- unknown block: weird_thing -->');
    });

    it('returns null when block data is missing', () => {
      const result = n._blockToMd({ type: 'paragraph' });
      assert.equal(result, null);
    });

    it('converts table_of_contents', () => {
      const result = n._blockToMd({ type: 'table_of_contents', table_of_contents: {} });
      assert.equal(result, '_[Table of Contents]_');
    });

    it('converts breadcrumb to empty string', () => {
      const result = n._blockToMd({ type: 'breadcrumb', breadcrumb: {} });
      assert.equal(result, '');
    });

    it('converts link_preview', () => {
      const result = n._blockToMd({ type: 'link_preview', link_preview: { url: 'https://link.com' } });
      assert.equal(result, '[Link: https://link.com](https://link.com)');
    });

    it('converts link_to_page', () => {
      const result = n._blockToMd({ type: 'link_to_page', link_to_page: { page_id: 'abc' } });
      assert.equal(result, '[→ Linked page]');
    });

    it('converts synced_block', () => {
      const result = n._blockToMd({ type: 'synced_block', synced_block: {} });
      assert.equal(result, '_(synced block)_');
    });

    it('converts pdf', () => {
      const result = n._blockToMd({ type: 'pdf', pdf: { file: { url: 'https://docs.com/file.pdf' } } });
      assert.equal(result, '[PDF: https://docs.com/file.pdf]');
    });

    it('converts file', () => {
      const result = n._blockToMd({ type: 'file', file: { file: { url: 'https://files.com/doc.zip' } } });
      assert.equal(result, '[File: https://files.com/doc.zip]');
    });

    it('converts audio', () => {
      const result = n._blockToMd({ type: 'audio', audio: { external: { url: 'https://audio.com/clip.mp3' } } });
      assert.equal(result, '[Audio: https://audio.com/clip.mp3]');
    });

    it('converts template', () => {
      const result = n._blockToMd({ type: 'template', template: { rich_text: richText } });
      assert.equal(result, '_(template: Some text)_');
    });

    it('converts column_list to empty string', () => {
      const result = n._blockToMd({ type: 'column_list', column_list: {} });
      assert.equal(result, '');
    });

    it('converts column to empty string', () => {
      const result = n._blockToMd({ type: 'column', column: {} });
      assert.equal(result, '');
    });

    it('converts table to empty string', () => {
      const result = n._blockToMd({ type: 'table', table: {} });
      assert.equal(result, '');
    });

    it('returns null for table_row without cells', () => {
      const result = n._blockToMd({ type: 'table_row', table_row: {} });
      assert.equal(result, null);
    });
  });

  describe('_propertyToString', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('converts title property', () => {
      const result = n._propertyToString({
        type: 'title',
        title: [{ plain_text: 'My Page' }],
      });
      assert.equal(result, 'My Page');
    });

    it('converts rich_text property', () => {
      const result = n._propertyToString({
        type: 'rich_text',
        rich_text: [{ plain_text: 'Some description' }],
      });
      assert.equal(result, 'Some description');
    });

    it('converts number property', () => {
      const result = n._propertyToString({ type: 'number', number: 42 });
      assert.equal(result, '42');
    });

    it('converts select property', () => {
      const result = n._propertyToString({ type: 'select', select: { name: 'Option A' } });
      assert.equal(result, 'Option A');
    });

    it('converts multi_select property', () => {
      const result = n._propertyToString({
        type: 'multi_select',
        multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }],
      });
      assert.equal(result, 'Tag1, Tag2');
    });

    it('converts date property', () => {
      const result = n._propertyToString({ type: 'date', date: { start: '2025-06-15' } });
      assert.equal(result, '2025-06-15');
    });

    it('converts checkbox true', () => {
      const result = n._propertyToString({ type: 'checkbox', checkbox: true });
      assert.equal(result, 'Yes');
    });

    it('converts checkbox false', () => {
      const result = n._propertyToString({ type: 'checkbox', checkbox: false });
      assert.equal(result, 'No');
    });

    it('converts url property', () => {
      const result = n._propertyToString({ type: 'url', url: 'https://example.com' });
      assert.equal(result, 'https://example.com');
    });

    it('converts status property', () => {
      const result = n._propertyToString({ type: 'status', status: { name: 'In Progress' } });
      assert.equal(result, 'In Progress');
    });

    it('converts people property', () => {
      const result = n._propertyToString({
        type: 'people',
        people: [{ name: 'Alice' }, { id: 'user-id-123' }],
      });
      assert.equal(result, 'Alice, user-id-123');
    });

    it('converts formula string', () => {
      const result = n._propertyToString({
        type: 'formula',
        formula: { string: 'computed value' },
      });
      assert.equal(result, 'computed value');
    });

    it('converts formula number', () => {
      const result = n._propertyToString({
        type: 'formula',
        formula: { number: 99 },
      });
      assert.equal(result, '99');
    });

    it('converts created_time', () => {
      const result = n._propertyToString({
        type: 'created_time',
        created_time: '2025-01-01T00:00:00Z',
      });
      assert.equal(result, '2025-01-01T00:00:00Z');
    });

    it('converts unknown type to empty string', () => {
      const result = n._propertyToString({ type: 'some_future_type' });
      assert.equal(result, '');
    });

    it('converts email property', () => {
      const result = n._propertyToString({ type: 'email', email: 'test@example.com' });
      assert.equal(result, 'test@example.com');
    });

    it('converts phone_number property', () => {
      const result = n._propertyToString({ type: 'phone_number', phone_number: '+1234567890' });
      assert.equal(result, '+1234567890');
    });

    it('converts relation property', () => {
      const result = n._propertyToString({
        type: 'relation',
        relation: [{ id: 'page-1' }, { id: 'page-2' }],
      });
      assert.equal(result, 'page-1, page-2');
    });

    it('converts files property', () => {
      const result = n._propertyToString({
        type: 'files',
        files: [{ name: 'doc.pdf' }, { file: { url: 'https://f.com/x' } }],
      });
      assert.equal(result, 'doc.pdf, https://f.com/x');
    });

    it('converts unique_id property', () => {
      const result = n._propertyToString({
        type: 'unique_id',
        unique_id: { prefix: 'TASK-', number: 42 },
      });
      assert.equal(result, 'TASK-42');
    });

    it('converts last_edited_time', () => {
      const result = n._propertyToString({
        type: 'last_edited_time',
        last_edited_time: '2025-06-01T12:00:00Z',
      });
      assert.equal(result, '2025-06-01T12:00:00Z');
    });

    it('converts created_by', () => {
      const result = n._propertyToString({
        type: 'created_by',
        created_by: { name: 'Alice' },
      });
      assert.equal(result, 'Alice');
    });

    it('converts last_edited_by', () => {
      const result = n._propertyToString({
        type: 'last_edited_by',
        last_edited_by: { id: 'user-456' },
      });
      assert.equal(result, 'user-456');
    });

    it('converts verification property', () => {
      const result = n._propertyToString({
        type: 'verification',
        verification: { state: 'verified' },
      });
      assert.equal(result, 'verified');
    });

    it('converts rollup property', () => {
      const result = n._propertyToString({
        type: 'rollup',
        rollup: { array: [1, 2, 3] },
      });
      assert.equal(result, '[1,2,3]');
    });
  });

  describe('_extractTitle', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('extracts title from properties', () => {
      const page = {
        properties: {
          Name: {
            type: 'title',
            title: [{ plain_text: 'My Page Title' }],
          },
        },
      };
      assert.equal(n._extractTitle(page), 'My Page Title');
    });

    it('extracts title from non-Name property', () => {
      const page = {
        properties: {
          CustomTitle: {
            type: 'title',
            title: [{ plain_text: 'Custom' }],
          },
        },
      };
      assert.equal(n._extractTitle(page), 'Custom');
    });

    it('falls back to child_page title', () => {
      const page = {
        properties: {},
        child_page: { title: 'Child Title' },
      };
      assert.equal(n._extractTitle(page), 'Child Title');
    });

    it('returns empty string when no title property', () => {
      const page = { properties: {} };
      assert.equal(n._extractTitle(page), '');
    });

    it('returns empty string when properties missing', () => {
      assert.equal(n._extractTitle({}), '');
    });
  });

  describe('_sanitizeFilename', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('replaces special characters', () => {
      assert.equal(n._sanitizeFilename('file/name:with*special'), 'file_name_with_special');
    });

    it('replaces spaces with hyphens', () => {
      assert.equal(n._sanitizeFilename('my file name'), 'my-file-name');
    });

    it('lowercases the result', () => {
      assert.equal(n._sanitizeFilename('MyPage'), 'mypage');
    });

    it('truncates to 100 chars', () => {
      const long = 'a'.repeat(200);
      assert.equal(n._sanitizeFilename(long).length, 100);
    });

    it('handles combined transformations', () => {
      const result = n._sanitizeFilename('My Page: A "Guide" to <Things>');
      assert.equal(result, 'my-page_-a-_guide_-to-_things_');
    });
  });

  describe('_blocksToMarkdown', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('combines multiple blocks with title', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Line one', annotations: {} }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Line two', annotations: {} }] } },
      ];
      const md = n._blocksToMarkdown(blocks, 'My Title');
      assert.ok(md.startsWith('# My Title\n'));
      assert.ok(md.includes('Line one'));
      assert.ok(md.includes('Line two'));
    });

    it('works without title', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Only line', annotations: {} }] } },
      ];
      const md = n._blocksToMarkdown(blocks, '');
      assert.ok(!md.includes('# '));
      assert.ok(md.includes('Only line'));
    });

    it('skips blocks that return null', () => {
      const blocks = [
        { type: 'paragraph' }, // missing data -> null
        { type: 'divider', divider: {} },
      ];
      const md = n._blocksToMarkdown(blocks, '');
      assert.ok(md.includes('---'));
      // null blocks are filtered out (not included as "null" text)
      assert.ok(!md.includes('null'));
    });
  });

  describe('_entryToMarkdown', () => {
    const n = new NotionConnector({ apiKey: 'test' });

    it('creates frontmatter from properties + body from blocks', () => {
      const props = { Status: 'Done', Priority: 'High', Name: 'Task 1' };
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Task details', annotations: {} }] } },
      ];
      const md = n._entryToMarkdown('Task 1', props, blocks);

      assert.ok(md.includes('---'));
      assert.ok(md.includes('Status: Done'));
      assert.ok(md.includes('Priority: High'));
      assert.ok(md.includes('# Task 1'));
      assert.ok(md.includes('Task details'));
    });

    it('excludes Name/Title from frontmatter', () => {
      const props = { Name: 'My Page', Title: 'Also Title', Category: 'Docs' };
      const blocks = [];
      const md = n._entryToMarkdown('My Page', props, blocks);

      assert.ok(!md.includes('Name: My Page'));
      assert.ok(!md.includes('Title: Also Title'));
      assert.ok(md.includes('Category: Docs'));
    });

    it('excludes empty property values from frontmatter', () => {
      const props = { Status: 'Active', EmptyField: '' };
      const blocks = [];
      const md = n._entryToMarkdown('Test', props, blocks);

      assert.ok(md.includes('Status: Active'));
      assert.ok(!md.includes('EmptyField'));
    });
  });

  describe('fetchPage (with stubbed API)', () => {
    it('fetches page metadata and blocks, saves as markdown', async () => {
      const outputDir = path.join(tmpDir, 'page-out');
      const pageId = 'abc-123';

      const n = new TestNotionConnector({
        [`/pages/${pageId}`]: {
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Test Page' }] },
          },
        },
        [`/blocks/${pageId}/children?page_size=100`]: {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello from Notion', annotations: {} }] } },
            { type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Section', annotations: {} }] } },
          ],
          has_more: false,
        },
      });

      const result = await n.fetchPage(pageId, outputDir);

      assert.equal(result.pageCount, 1);
      assert.equal(result.title, 'Test Page');

      const files = fs.readdirSync(outputDir);
      assert.equal(files.length, 1);
      assert.equal(files[0], 'test-page.md');

      const content = fs.readFileSync(path.join(outputDir, files[0]), 'utf8');
      assert.ok(content.includes('# Test Page'));
      assert.ok(content.includes('Hello from Notion'));
      assert.ok(content.includes('## Section'));
    });
  });

  describe('fetchDatabase (with stubbed API)', () => {
    it('queries database and saves entries as markdown', async () => {
      const outputDir = path.join(tmpDir, 'db-out');
      const dbId = 'db-456';

      const n = new TestNotionConnector({
        [`/databases/${dbId}/query`]: {
          results: [
            {
              id: 'entry-1',
              properties: {
                Name: { type: 'title', title: [{ plain_text: 'Entry One' }] },
                Status: { type: 'select', select: { name: 'Done' } },
              },
            },
            {
              id: 'entry-2',
              properties: {
                Name: { type: 'title', title: [{ plain_text: 'Entry Two' }] },
                Status: { type: 'select', select: { name: 'In Progress' } },
              },
            },
          ],
          has_more: false,
        },
        // Blocks for each entry
        ['/blocks/entry-1/children?page_size=100']: {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'First entry body', annotations: {} }] } },
          ],
          has_more: false,
        },
        ['/blocks/entry-2/children?page_size=100']: {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Second entry body', annotations: {} }] } },
          ],
          has_more: false,
        },
      });

      const result = await n.fetchDatabase(dbId, outputDir);

      assert.equal(result.pageCount, 2);

      const files = fs.readdirSync(outputDir).sort();
      assert.equal(files.length, 2);

      const content1 = fs.readFileSync(path.join(outputDir, 'entry-one.md'), 'utf8');
      assert.ok(content1.includes('Status: Done'));
      assert.ok(content1.includes('First entry body'));

      const content2 = fs.readFileSync(path.join(outputDir, 'entry-two.md'), 'utf8');
      assert.ok(content2.includes('Status: In Progress'));
      assert.ok(content2.includes('Second entry body'));
    });

    it('passes since filter in query body', async () => {
      const outputDir = path.join(tmpDir, 'db-since');
      const dbId = 'db-789';

      // Capture the POST body by overriding _apiPost
      let capturedBody;
      const n = new TestNotionConnector({});
      n._apiPost = async (endpoint, body) => {
        capturedBody = body;
        return { results: [], has_more: false };
      };

      await n.fetchDatabase(dbId, outputDir, { since: '2025-01-01' });

      assert.ok(capturedBody.filter);
      assert.equal(capturedBody.filter.timestamp, 'last_edited_time');
      assert.equal(capturedBody.filter.last_edited_time.after, '2025-01-01');
    });
  });

  describe('fetchSearch (with stubbed API)', () => {
    it('searches and saves matching pages', async () => {
      const outputDir = path.join(tmpDir, 'search-out');

      const n = new TestNotionConnector({
        '/search': {
          results: [
            {
              object: 'page',
              id: 'search-1',
              properties: {
                Name: { type: 'title', title: [{ plain_text: 'Found Page' }] },
              },
            },
            {
              object: 'database', // should be skipped
              id: 'search-2',
            },
          ],
          has_more: false,
        },
        ['/blocks/search-1/children?page_size=100']: {
          results: [
            { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Search result content', annotations: {} }] } },
          ],
          has_more: false,
        },
      });

      const result = await n.fetchSearch('test query', outputDir);

      assert.equal(result.pageCount, 1);

      const files = fs.readdirSync(outputDir);
      assert.equal(files.length, 1);

      const content = fs.readFileSync(path.join(outputDir, files[0]), 'utf8');
      assert.ok(content.includes('Found Page'));
      assert.ok(content.includes('Search result content'));
    });

    it('respects limit', async () => {
      const outputDir = path.join(tmpDir, 'search-limit');

      const pages = Array.from({ length: 5 }, (_, i) => ({
        object: 'page',
        id: `page-${i}`,
        properties: {
          Name: { type: 'title', title: [{ plain_text: `Page ${i}` }] },
        },
      }));

      const mocks = {
        '/search': { results: pages, has_more: false },
      };
      // Add block mocks for all pages
      for (let i = 0; i < 5; i++) {
        mocks[`/blocks/page-${i}/children?page_size=100`] = {
          results: [],
          has_more: false,
        };
      }

      const n = new TestNotionConnector(mocks);
      const result = await n.fetchSearch('query', outputDir, { limit: 2 });

      assert.equal(result.pageCount, 2);
      assert.equal(fs.readdirSync(outputDir).length, 2);
    });
  });
});
