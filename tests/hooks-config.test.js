import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'hooks');
const hooksJson = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));

describe('hooks.json wires all hook files correctly', () => {
  it('should have PreToolUse hook for context injection on Edit|Write', () => {
    const pre = hooksJson.PreToolUse;
    assert.ok(Array.isArray(pre), 'PreToolUse should be an array');
    const editWrite = pre.find(h => h.matcher === 'Edit|Write');
    assert.ok(editWrite, 'should have Edit|Write matcher');
    const cmds = editWrite.hooks.map(h => h.command);
    assert.ok(cmds.some(c => c.includes('pretooluse-inject')), 'should wire pretooluse-inject.mjs');
  });

  it('should have PostToolUse hook for contradiction detection on Edit|Write', () => {
    const post = hooksJson.PostToolUse;
    assert.ok(Array.isArray(post), 'PostToolUse should be an array');
    const contradict = post.find(h =>
      h.matcher === 'Edit|Write' && h.hooks.some(hk => hk.command.includes('contradict'))
    );
    assert.ok(contradict, 'should wire posttooluse-contradict.mjs for Edit|Write');
  });

  it('should have PostToolUse hook for import checking on Edit|Write', () => {
    const post = hooksJson.PostToolUse;
    const imports = post.find(h =>
      h.matcher === 'Edit|Write' && h.hooks.some(hk => hk.command.includes('imports'))
    );
    assert.ok(imports, 'should wire posttooluse-imports.mjs for Edit|Write');
  });

  it('should have PostToolUse hook for knowledge capture on WebFetch|WebSearch', () => {
    const post = hooksJson.PostToolUse;
    const capture = post.find(h =>
      h.matcher === 'WebFetch|WebSearch' && h.hooks.some(hk => hk.command.includes('capture'))
    );
    assert.ok(capture, 'should wire posttooluse-capture.mjs for WebFetch|WebSearch');
  });

  it('every hook command should reference a file that exists on disk', () => {
    const allHooks = [
      ...hooksJson.PreToolUse ?? [],
      ...hooksJson.PostToolUse ?? [],
      ...hooksJson.UserPromptSubmit ?? [],
    ];
    for (const entry of allHooks) {
      for (const hook of entry.hooks ?? []) {
        // Extract filename from command like: node "${BOOKLIB_ROOT}/hooks/pretooluse-inject.mjs"
        const match = hook.command.match(/hooks\/([a-z-]+\.mjs)/);
        if (match) {
          const hookFile = path.join(HOOKS_DIR, match[1]);
          assert.ok(fs.existsSync(hookFile), `hook file should exist: ${match[1]}`);
        }
      }
    }
  });
});
