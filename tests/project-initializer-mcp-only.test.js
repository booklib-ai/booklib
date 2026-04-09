import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeAgentLine } from '../lib/project-initializer.js';

const BOOKLIB_LINE = 'BookLib: knowledge tools for this project. Read skills/booklib-mcp-guide/SKILL.md before first use.';

describe('writeAgentLine', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-agentline-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates new file with skeleton + BookLib line when file does not exist', () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    writeAgentLine(filePath, { skeleton: true });
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes(BOOKLIB_LINE), 'should include BookLib line');
    assert.ok(content.includes('## Stack'), 'skeleton should have Stack section');
    assert.ok(content.includes('## Commands'), 'skeleton should have Commands section');
  });

  it('appends BookLib line to existing file without markers', () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(filePath, '# My Project\n\nCustom instructions here.\n');
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.startsWith('# My Project'), 'should preserve existing content');
    assert.ok(content.includes('Custom instructions here.'), 'should preserve existing content');
    assert.ok(content.includes(BOOKLIB_LINE), 'should append BookLib line');
  });

  it('cleans up old markers and adds BookLib line', () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(filePath, '# My Project\n\n<!-- booklib-standards-start -->\n## Old stuff\nLots of dumped content\n<!-- booklib-standards-end -->\n\n## My Section\n');
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(!content.includes('booklib-standards-start'), 'should remove old markers');
    assert.ok(!content.includes('Old stuff'), 'should remove old content');
    assert.ok(content.includes('# My Project'), 'should preserve content before markers');
    assert.ok(content.includes('## My Section'), 'should preserve content after markers');
    assert.ok(content.includes(BOOKLIB_LINE), 'should add BookLib line');
  });

  it('does nothing when BookLib line already present', () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    const original = `# My Project\n\n${BOOKLIB_LINE}\n`;
    fs.writeFileSync(filePath, original);
    writeAgentLine(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const count = (content.match(/booklib-mcp-guide/g) || []).length;
    assert.equal(count, 1, 'should not duplicate BookLib line');
  });
});

describe('wizard installs booklib-mcp-guide skill into project', () => {
  const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const srcSkill = path.join(PACKAGE_ROOT, 'skills', 'booklib-mcp-guide', 'SKILL.md');
  let tmpDir;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booklib-skill-install-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('booklib-mcp-guide SKILL.md exists in package', () => {
    assert.ok(fs.existsSync(srcSkill), 'skills/booklib-mcp-guide/SKILL.md should exist in package');
  });

  it('copies skill to project skills/ directory when missing', () => {
    const destDir = path.join(tmpDir, 'skills', 'booklib-mcp-guide');
    assert.ok(!fs.existsSync(destDir), 'should not exist before install');

    // Simulate what the wizard does
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcSkill, path.join(destDir, 'SKILL.md'));

    assert.ok(fs.existsSync(path.join(destDir, 'SKILL.md')), 'SKILL.md should be copied');
    const content = fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.ok(content.includes('booklib-mcp-guide'), 'should contain skill name');
    assert.ok(content.includes('lookup'), 'should reference lookup tool');
    assert.ok(content.includes('verify'), 'should reference verify tool');
    assert.ok(content.includes('guard'), 'should reference guard tool');
  });

  it('does not overwrite if skill directory already exists', () => {
    const destDir = path.join(tmpDir, 'skills', 'booklib-mcp-guide');
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), 'custom content');

    // Simulate wizard logic: only copy if dir doesn't exist
    if (!fs.existsSync(destDir)) {
      fs.copyFileSync(srcSkill, path.join(destDir, 'SKILL.md'));
    }

    const content = fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.equal(content, 'custom content', 'should not overwrite existing skill');
  });
});
