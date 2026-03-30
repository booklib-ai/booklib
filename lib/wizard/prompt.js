// lib/wizard/prompt.js
import { createInterface } from 'node:readline';

function readLine() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const onSigint = () => { rl.close(); process.exit(130); };
    process.once('SIGINT', onSigint);
    rl.once('line', line => {
      process.removeListener('SIGINT', onSigint);
      rl.close();
      resolve(line.trim());
    });
    rl.once('close', () => {
      process.removeListener('SIGINT', onSigint);
      resolve('');
    });
  });
}

/**
 * Prompts for y/n confirmation. Returns boolean.
 */
export async function confirm(question, defaultY = true) {
  process.stdout.write(`${question} [${defaultY ? 'Y/n' : 'y/N'}] `);
  const answer = await readLine();
  if (!answer) return defaultY;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Prompts user to select from a list of choices.
 * Returns array of selected indices (0-based).
 * choices: Array<{ label: string, description?: string }>
 */
export async function multiSelect(question, choices) {
  process.stdout.write(`\n${question}\n\n`);
  choices.forEach((c, i) => {
    const desc = c.description ? `  — ${c.description}` : '';
    process.stdout.write(`  ${i + 1}. ${c.label}${desc}\n`);
  });
  process.stdout.write(`\n  [A] All (recommended)  [1,2,3...] pick  [S] Skip\n\n  > `);

  const answer = await readLine();
  if (!answer || answer.toLowerCase() === 'a') return choices.map((_, i) => i);
  if (answer.toLowerCase() === 's') return [];

  return answer.split(',')
    .map(n => parseInt(n.trim(), 10) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < choices.length);
}

/**
 * Returns a progress bar string (no I/O side effects — testable).
 * width: number of bar characters
 */
export function formatProgress(current, total, width = 30) {
  const clamped = Math.min(current, total);
  const filled = total > 0 ? Math.round((clamped / total) * width) : 0;
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  return `[${bar}] ${clamped}/${total}`;
}

/**
 * Writes an updating progress line to stdout.
 * Returns { tick(n), done() }.
 */
export function progressBar(total) {
  let current = 0;
  function render() {
    process.stdout.write(`\r  ${formatProgress(current, total)}`);
  }
  render();
  return {
    tick(n = 1) { current = Math.min(current + n, total); render(); },
    done() { process.stdout.write('\n'); },
  };
}

/**
 * Prompts the user for free-text input. Returns the trimmed response.
 */
export async function readText(promptText) {
  process.stdout.write(promptText);
  return readLine();
}

/** Returns a separator line. */
export function sep(char = '─', width = 45) {
  return char.repeat(width);
}
