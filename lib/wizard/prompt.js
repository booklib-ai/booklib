// lib/wizard/prompt.js
import * as clack from '@clack/prompts';
import { createInterface } from 'node:readline';

// ── Clack-based wizard session ───────────────────────────────────────────────

export function createWizardUI() {
  return {
    intro(text) { clack.intro(text); },
    outro(text) { clack.outro(text); },

    async confirm(message, initial = true) {
      const result = await clack.confirm({
        message,
        initialValue: initial,
      });
      if (clack.isCancel(result)) { clack.outro('Setup cancelled.'); process.exit(0); }
      return result;
    },

    async text(message, placeholder) {
      const result = await clack.text({
        message,
        placeholder,
      });
      if (clack.isCancel(result)) { clack.outro('Setup cancelled.'); process.exit(0); }
      return result;
    },

    async select(message, options) {
      const result = await clack.select({
        message,
        options,
      });
      if (clack.isCancel(result)) { clack.outro('Setup cancelled.'); process.exit(0); }
      return result;
    },

    async multiselect(message, options, opts = {}) {
      const result = await clack.multiselect({
        message,
        options,
        required: false,
        cursorAt: opts.initialValues?.[0],
        ...opts,
      });
      if (clack.isCancel(result)) { clack.outro('Setup cancelled.'); process.exit(0); }
      return result;
    },

    spinner() { return clack.spinner(); },
    log: clack.log,
    isCancel: clack.isCancel,
  };
}

// ── Legacy standalone functions (used outside wizard) ────────────────────────

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

export async function confirm(question, defaultY = true) {
  process.stdout.write(`${question} [${defaultY ? 'Y/n' : 'y/N'}] `);
  const answer = await readLine();
  if (!answer) return defaultY;
  return answer.toLowerCase().startsWith('y');
}

export async function multiSelect(question, choices) {
  process.stdout.write(`\n${question}\n\n`);
  choices.forEach((c, i) => {
    const desc = c.description ? `  — ${c.description}` : '';
    process.stdout.write(`  ${i + 1}. ${c.label}${desc}\n`);
  });
  process.stdout.write(`\n  [A] All (recommended)  [1,2,3...] pick  [S] Skip\n\n  > `);
  const answer = await readLine();
  if (!answer) return process.stdin.isTTY ? choices.map((_, i) => i) : [];
  if (answer.toLowerCase() === 'a') return choices.map((_, i) => i);
  if (answer.toLowerCase() === 's') return [];
  return answer.split(',')
    .map(n => parseInt(n.trim(), 10) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < choices.length);
}

export function formatProgress(current, total, width = 30) {
  const clamped = Math.min(current, total);
  const filled = total > 0 ? Math.round((clamped / total) * width) : 0;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, width - filled));
  return `[${bar}] ${clamped}/${total}`;
}

export function progressBar(total) {
  let current = 0;
  function render() { process.stdout.write(`\r  ${formatProgress(current, total)}`); }
  render();
  return {
    tick(n = 1) { current = Math.min(current + n, total); render(); },
    done() { process.stdout.write('\n'); },
  };
}

export async function readText(promptText) {
  process.stdout.write(promptText);
  return readLine();
}

export function sep(char = '\u2500', width = 45) {
  return char.repeat(width);
}

export function createSession(opts = {}) {
  const rl = createInterface({
    input: opts.input ?? process.stdin,
    output: opts.output ?? process.stdout,
  });
  function question(prompt) {
    return new Promise(resolve => {
      rl.question(prompt, answer => resolve(answer.trim()));
    });
  }
  return {
    async confirm(text, defaultY = true) {
      const answer = await question(`${text} [${defaultY ? 'Y/n' : 'y/N'}] `);
      if (!answer) return defaultY;
      return answer.toLowerCase().startsWith('y');
    },
    async readText(prompt) { return question(prompt); },
    async multiSelect(title, choices) {
      process.stdout.write(`\n${title}\n\n`);
      choices.forEach((c, i) => {
        const desc = c.description ? `  — ${c.description}` : '';
        process.stdout.write(`  ${i + 1}. ${c.label}${desc}\n`);
      });
      process.stdout.write(`\n  [A] All  [1,2,3...] pick  [S] Skip\n\n`);
      const answer = await question('  > ');
      if (!answer) return choices.map((_, i) => i);
      if (answer.toLowerCase() === 'a') return choices.map((_, i) => i);
      if (answer.toLowerCase() === 's') return [];
      return answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < choices.length);
    },
    async numberedInput(prompt, maxN) {
      const answer = await question(prompt);
      if (!answer) return [];
      return answer.split(',')
        .map(n => parseInt(n.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < maxN);
    },
    close() { rl.close(); },
  };
}
