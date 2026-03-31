import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../../lib/wizard/prompt.js';
import { Readable } from 'node:stream';

function fakeStdin(lines) {
  const pending = [...lines];
  return new Readable({
    read() {
      if (pending.length > 0) {
        const line = pending.shift();
        // Delay push so readline's question listener is ready before data arrives
        setTimeout(() => this.push(line + '\n'), 5);
      }
    },
  });
}

test('createSession confirm returns true for "y"', async () => {
  const stdin = fakeStdin(['y']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.confirm('Continue?', false);
  assert.strictEqual(result, true);
  session.close();
});

test('createSession confirm returns default on empty input', async () => {
  const stdin = fakeStdin(['']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.confirm('Continue?', true);
  assert.strictEqual(result, true);
  session.close();
});

test('createSession sequential calls do not race', async () => {
  const stdin = fakeStdin(['y', 'hello', 'n']);
  const session = createSession({ input: stdin, output: process.stdout });
  const r1 = await session.confirm('First?', false);
  const r2 = await session.readText('Name: ');
  const r3 = await session.confirm('Third?', true);
  assert.strictEqual(r1, true);
  assert.strictEqual(r2, 'hello');
  assert.strictEqual(r3, false);
  session.close();
});

test('createSession numberedInput parses comma-separated numbers', async () => {
  const stdin = fakeStdin(['1,3,5']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.numberedInput('Pick: ', 6);
  assert.deepStrictEqual(result, [0, 2, 4]);
  session.close();
});

test('createSession numberedInput returns empty for Enter', async () => {
  const stdin = fakeStdin(['']);
  const session = createSession({ input: stdin, output: process.stdout });
  const result = await session.numberedInput('Pick: ', 5);
  assert.deepStrictEqual(result, []);
  session.close();
});
