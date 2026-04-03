import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitMarkdown, parseSkillFile } from '../../lib/engine/parser.js';

const FM = `---
name: test-skill
tags: [kotlin]
---
`;

describe('splitMarkdown', () => {
  it('splits bullet points into individual chunks with correct parentId, siblingIndex, siblingCount', () => {
    const md = FM + `
## Principles

- First principle
- Second principle
- Third principle
`;
    const chunks = splitMarkdown(md, 'test.md');
    const principles = chunks.filter(c => c.parentTitle === 'Principles');
    assert.equal(principles.length, 3);
    assert.equal(principles[0].text, 'First principle');
    assert.equal(principles[0].siblingIndex, 0);
    assert.equal(principles[0].siblingCount, 3);
    assert.equal(principles[1].siblingIndex, 1);
    assert.equal(principles[2].siblingIndex, 2);
    // All share the same parentId
    assert.ok(principles[0].parentId);
    assert.equal(principles[0].parentId, principles[1].parentId);
    assert.equal(principles[1].parentId, principles[2].parentId);
  });

  it('splits numbered items', () => {
    const md = FM + `
## Steps

1. Do this first
2. Do this second
3. Do this third
`;
    const chunks = splitMarkdown(md, 'test.md');
    const steps = chunks.filter(c => c.parentTitle === 'Steps');
    assert.equal(steps.length, 3);
    assert.equal(steps[0].text, 'Do this first');
    assert.equal(steps[1].text, 'Do this second');
    assert.equal(steps[2].text, 'Do this third');
  });

  it('keeps continuation lines with their bullet', () => {
    const md = FM + `
## Rules

- First rule has
  a continuation line
  and another one
- Second rule
`;
    const chunks = splitMarkdown(md, 'test.md');
    const rules = chunks.filter(c => c.parentTitle === 'Rules');
    assert.equal(rules.length, 2);
    assert.ok(rules[0].text.includes('First rule has'));
    assert.ok(rules[0].text.includes('a continuation line'));
    assert.ok(rules[0].text.includes('and another one'));
    assert.equal(rules[1].text, 'Second rule');
  });

  it('merges adjacent chunks when second negates the first (contradiction guard)', () => {
    const md = FM + `
## Guidelines

- Use mutable state for performance
- Never use mutable state when immutable works
`;
    const chunks = splitMarkdown(md, 'test.md');
    const guidelines = chunks.filter(c => c.parentTitle === 'Guidelines');
    // Should merge because "Never" negates and shares keyword "mutable" (>3 chars)
    assert.equal(guidelines.length, 1);
    assert.ok(guidelines[0].text.includes('Use mutable state'));
    assert.ok(guidelines[0].text.includes('Never use mutable'));
  });

  it('creates summary chunk from content before first header', () => {
    const md = FM + `
This is intro text before any header.

## Section One

- Item
`;
    const chunks = splitMarkdown(md, 'test.md');
    const summary = chunks.find(c => c.section === 'summary');
    assert.ok(summary, 'should have a summary chunk');
    assert.ok(summary.text.includes('intro text before any header'));
  });

  it('preserves frontmatter as metadata on all chunks', () => {
    const md = FM + `
## Section

- Item one
- Item two
`;
    const chunks = splitMarkdown(md, 'test.md');
    for (const chunk of chunks) {
      assert.equal(chunk.metadata.name, 'test-skill');
      assert.deepEqual(chunk.metadata.tags, ['kotlin']);
    }
  });

  it('handles document with no headers (title becomes parent)', () => {
    const md = FM + `
Just some content without any headers.

More content here.
`;
    const chunks = splitMarkdown(md, 'test.md');
    assert.ok(chunks.length > 0);
    // parentTitle should come from frontmatter name
    assert.equal(chunks[0].parentTitle, 'test-skill');
  });

  it('splits bold-headed paragraphs', () => {
    const md = FM + `
## Patterns

**Factory Method** — Creates objects without specifying exact class

**Observer** — Defines a subscription mechanism

**Strategy** — Defines a family of algorithms
`;
    const chunks = splitMarkdown(md, 'test.md');
    const patterns = chunks.filter(c => c.parentTitle === 'Patterns');
    assert.equal(patterns.length, 3);
    assert.ok(patterns[0].text.includes('Factory Method'));
    assert.ok(patterns[1].text.includes('Observer'));
    assert.ok(patterns[2].text.includes('Strategy'));
  });

  it('infers section type from XML tag if present', () => {
    const md = FM + `
## Principles

<core_principles>
- Be safe
- Be clear
</core_principles>
`;
    const chunks = splitMarkdown(md, 'test.md');
    const principles = chunks.filter(c => c.parentTitle === 'Principles');
    assert.ok(principles.length > 0);
    assert.equal(principles[0].section, 'framework');
  });
});

describe('parseSkillFile backwards compatibility', () => {
  it('returns [{text, metadata}] format with parent fields in metadata', () => {
    const md = FM + `
Intro text.

## Section

- Item one
- Item two
`;
    const result = parseSkillFile(md, 'test.md');
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    for (const chunk of result) {
      assert.ok(typeof chunk.text === 'string');
      assert.ok(typeof chunk.metadata === 'object');
      assert.ok('filePath' in chunk.metadata);
      assert.ok('parentId' in chunk.metadata);
      assert.ok('parentTitle' in chunk.metadata);
    }
  });
});
