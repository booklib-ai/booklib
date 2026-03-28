#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];
const skillsRoot    = path.join(__dirname, '..', 'skills');
const commandsRoot  = path.join(__dirname, '..', 'commands');
const agentsRoot    = path.join(__dirname, '..', 'agents');

// ─── Installation profiles ────────────────────────────────────────────────────
const PROFILES = {
  core: {
    description: 'Routing + general code quality — a good starting point for any project',
    skills: ['skill-router', 'clean-code-reviewer'],
    agents: ['booklib-reviewer'],
  },
  python: {
    description: 'Python best practices, async patterns, and web scraping',
    skills: ['effective-python', 'using-asyncio-python', 'web-scraping-python'],
    agents: ['python-reviewer'],
  },
  jvm: {
    description: 'Java, Kotlin, and Spring Boot best practices',
    skills: ['effective-java', 'effective-kotlin', 'kotlin-in-action', 'spring-boot-in-action'],
    agents: ['jvm-reviewer'],
  },
  rust: {
    description: 'Rust ownership, systems programming, and idiomatic patterns',
    skills: ['programming-with-rust', 'rust-in-action'],
    agents: ['rust-reviewer'],
  },
  ts: {
    description: 'TypeScript type system and clean code for JS/TS projects',
    skills: ['effective-typescript', 'clean-code-reviewer'],
    agents: ['ts-reviewer'],
  },
  architecture: {
    description: 'DDD, microservices, system design, and data-intensive patterns',
    skills: ['domain-driven-design', 'microservices-patterns', 'system-design-interview', 'data-intensive-patterns'],
    agents: ['architecture-reviewer'],
  },
  data: {
    description: 'Data pipelines, ETL, and storage system patterns',
    skills: ['data-intensive-patterns', 'data-pipelines'],
    agents: ['data-reviewer'],
  },
  ui: {
    description: 'UI design, data visualization, and web animations',
    skills: ['refactoring-ui', 'storytelling-with-data', 'animation-at-work'],
    agents: ['ui-reviewer'],
  },
  lean: {
    description: 'Lean Startup methodology for product and feature decisions',
    skills: ['lean-startup'],
    agents: [],
  },
};

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  blue:   s => `\x1b[34m${s}\x1b[0m`,
  line:   (len = 60) => `\x1b[2m${'─'.repeat(len)}\x1b[0m`,
};

// ─── SKILL.md helpers ─────────────────────────────────────────────────────────
function parseSkillFrontmatter(skillName) {
  const skillMdPath = path.join(skillsRoot, skillName, 'SKILL.md');
  try {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return { name: skillName, description: '' };
    const fm = fmMatch[1];

    const blockMatch  = fm.match(/^description:\s*>\s*\n((?:[ \t]+.+\n?)+)/m);
    const quotedMatch = fm.match(/^description:\s*["'](.+?)["']\s*$/m);
    const plainMatch  = fm.match(/^description:\s*(?!>)(.+)$/m);

    let description = '';
    if (blockMatch)       description = blockMatch[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    else if (quotedMatch) description = quotedMatch[1];
    else if (plainMatch)  description = plainMatch[1].trim();

    return { name: skillName, description };
  } catch {
    return { name: skillName, description: '' };
  }
}

function getSkillMdContent(skillName) {
  return fs.readFileSync(path.join(skillsRoot, skillName, 'SKILL.md'), 'utf8');
}

function getAvailableSkills() {
  return fs.readdirSync(skillsRoot)
    .filter(name => {
      const p = path.join(skillsRoot, name);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SKILL.md'));
    })
    .sort();
}

function firstSentence(text, maxLen = 65) {
  const end = text.search(/[.!?](\s|$)/);
  const s = end >= 0 ? text.slice(0, end + 1) : text;
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

// ─── File copy ────────────────────────────────────────────────────────────────
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function copySkill(skillName, targetDir) {
  const src = path.join(skillsRoot, skillName);
  if (!fs.existsSync(src)) {
    console.error(c.red(`✗ Skill "${skillName}" not found.`) + ' Run ' + c.cyan('skills list') + ' to see available skills.');
    process.exit(1);
  }
  const dest = path.join(targetDir, skillName);
  copyDir(src, dest);
  console.log(c.green('✓') + ` ${c.bold(skillName)} → ${c.dim(dest)}`);
}

const isGlobal         = args.includes('--global');
const targetDir        = isGlobal
  ? path.join(os.homedir(), '.claude', 'skills')
  : path.join(process.cwd(), '.claude', 'skills');
const commandsTargetDir = isGlobal
  ? path.join(os.homedir(), '.claude', 'commands')
  : path.join(process.cwd(), '.claude', 'commands');
const agentsTargetDir = isGlobal
  ? path.join(os.homedir(), '.claude', 'agents')
  : path.join(process.cwd(), '.claude', 'agents');

function copyCommand(skillName) {
  const src = path.join(commandsRoot, `${skillName}.md`);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(commandsTargetDir, { recursive: true });
  const dest = path.join(commandsTargetDir, `${skillName}.md`);
  fs.copyFileSync(src, dest);
  console.log(c.green('✓') + ` /${skillName} command → ${c.dim(dest)}`);
}

function getAvailableAgents() {
  if (!fs.existsSync(agentsRoot)) return [];
  return fs.readdirSync(agentsRoot)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
}

function copyAgent(agentName) {
  const src = path.join(agentsRoot, `${agentName}.md`);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(agentsTargetDir, { recursive: true });
  const dest = path.join(agentsTargetDir, `${agentName}.md`);
  fs.copyFileSync(src, dest);
  console.log(c.green('✓') + ` @${agentName} agent → ${c.dim(dest)}`);
}

// ─── CHECK command ────────────────────────────────────────────────────────────
function checkSkill(skillName) {
  const skillDir = path.join(skillsRoot, skillName);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    console.error(c.red(`✗ "${skillName}" not found or has no SKILL.md`));
    process.exit(1);
  }

  const pass = (tier, msg) => ({ ok: true, tier, msg });
  const fail = (tier, msg) => ({ ok: false, tier, msg });
  const checks = [];

  const skillMdContent = getSkillMdContent(skillName);
  const lines = skillMdContent.split('\n');
  const { name, description } = parseSkillFrontmatter(skillName);

  // ── Bronze ──────────────────────────────────────────────────────────────────
  checks.push(name === skillName
    ? pass('bronze', `name matches folder (${name})`)
    : fail('bronze', `name mismatch — SKILL.md: "${name}", folder: "${skillName}"`));

  checks.push(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)
    ? pass('bronze', 'name format valid (lowercase, hyphens)')
    : fail('bronze', `name format invalid — must be lowercase letters, numbers, hyphens; no consecutive hyphens`));

  if (description.length < 50)
    checks.push(fail('bronze', `description too short: ${description.length} chars (min 50)`));
  else if (description.length > 1024)
    checks.push(fail('bronze', `description too long: ${description.length} chars (max 1024)`));
  else
    checks.push(pass('bronze', `description: ${description.length} chars`));

  checks.push(/trigger|use when|use for|when.*ask|when.*mention/i.test(description)
    ? pass('bronze', 'description has trigger conditions')
    : fail('bronze', 'description missing trigger conditions — add "use when…" or "trigger on…"'));

  checks.push(lines.length <= 500
    ? pass('bronze', `SKILL.md: ${lines.length} lines`)
    : fail('bronze', `SKILL.md too long: ${lines.length} lines — move content to references/`));

  const bodyStart = skillMdContent.indexOf('---', 3);
  const body = bodyStart >= 0 ? skillMdContent.slice(bodyStart + 3).trim() : '';
  checks.push(body.split('\n').length > 30
    ? pass('bronze', `body present (${body.split('\n').length} lines of instructions)`)
    : fail('bronze', 'body too thin — add actionable step-by-step instructions'));

  // ── Silver ──────────────────────────────────────────────────────────────────
  for (const [file, label] of [['before.md', 'examples/before.md'], ['after.md', 'examples/after.md']]) {
    const p = path.join(skillDir, 'examples', file);
    if (!fs.existsSync(p)) {
      checks.push(fail('silver', `${label} missing`));
    } else {
      const n = fs.readFileSync(p, 'utf8').split('\n').length;
      checks.push(n >= 10
        ? pass('silver', `${label} (${n} lines)`)
        : fail('silver', `${label} too short: ${n} lines (need 10+)`));
    }
  }

  // ── Gold ────────────────────────────────────────────────────────────────────
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    checks.push(fail('gold', 'evals/evals.json missing'));
    checks.push(fail('gold', 'eval prompts not checked (no evals.json)'));
    checks.push(fail('gold', 'eval expectations not checked (no evals.json)'));
  } else {
    let evals = [];
    try {
      evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8')).evals || [];
    } catch {
      checks.push(fail('gold', 'evals/evals.json is invalid JSON'));
    }
    if (evals.length) {
      checks.push(evals.length >= 3
        ? pass('gold', `evals/evals.json: ${evals.length} evals`)
        : fail('gold', `only ${evals.length} evals (need 3+)`));

      const avgLines = evals.reduce((s, e) => s + (e.prompt || '').split('\n').length, 0) / evals.length;
      checks.push(avgLines >= 8
        ? pass('gold', `eval prompts have code (avg ${Math.round(avgLines)} lines)`)
        : fail('gold', `eval prompts may lack real code (avg ${Math.round(avgLines)} lines, target 10+)`));

      const avgExp = evals.reduce((s, e) => s + (e.expectations || []).length, 0) / evals.length;
      checks.push(avgExp >= 5
        ? pass('gold', `eval expectations thorough (avg ${(avgExp).toFixed(1)} per eval)`)
        : fail('gold', `few expectations per eval (avg ${(avgExp).toFixed(1)}, target 5+)`));
    }
  }

  const refsDir = path.join(skillDir, 'references');
  if (!fs.existsSync(refsDir)) {
    checks.push(fail('gold', 'references/ directory missing'));
  } else {
    const refFiles = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
    checks.push(refFiles.length >= 1
      ? pass('gold', `references/ (${refFiles.length} files: ${refFiles.join(', ')})`)
      : fail('gold', 'references/ has no .md files'));
  }

  // ── Platinum ────────────────────────────────────────────────────────────────
  const scriptsDir = path.join(skillDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    checks.push(fail('platinum', 'scripts/ directory missing'));
  } else {
    const scriptFiles = fs.readdirSync(scriptsDir).filter(f => !f.startsWith('.'));
    checks.push(scriptFiles.length >= 1
      ? pass('platinum', `scripts/ (${scriptFiles.join(', ')})`)
      : fail('platinum', 'scripts/ exists but is empty'));
  }

  const resultsPath = path.join(skillDir, 'evals', 'results.json');
  if (!fs.existsSync(resultsPath)) {
    checks.push(fail('platinum', 'evals/results.json missing — run: npx @booklib/skills eval <name>'));
  } else {
    let results = null;
    try { results = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); } catch {
      checks.push(fail('platinum', 'evals/results.json is invalid JSON'));
    }
    if (results) {
      if (results.non_standard_provider) {
        checks.push(fail('platinum', `eval results from non-standard provider (${results.model}) — rerun with ANTHROPIC_API_KEY or OPENAI_API_KEY`));
      }
      const pct = Math.round((results.pass_rate || 0) * 100);
      const meta = `(${results.evals_run} evals, ${results.model}, ${results.date})`;
      checks.push(pct >= 80
        ? pass('platinum', `eval pass rate: ${pct}% with skill ${meta}`)
        : fail('platinum', `eval pass rate ${pct}% below 80% minimum — run: npx @booklib/skills eval <name>`));
      if (results.delta !== undefined) {
        const deltaPp = Math.round(results.delta * 100);
        const basePct = Math.round((results.baseline_pass_rate || 0) * 100);
        checks.push(deltaPp >= 20
          ? pass('platinum', `eval delta: +${deltaPp}pp over baseline (${basePct}% without skill)`)
          : fail('platinum', `eval delta +${deltaPp}pp below 20pp minimum (baseline: ${basePct}%)`));
      }
    }
  }

  return checks;
}

const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
const BADGE = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold', platinum: '💎 Platinum' };
const LABEL = { bronze: 'Functional', silver: 'Complete', gold: 'Polished', platinum: 'Exemplary' };

function earnedBadge(checks) {
  let badge = null;
  for (const tier of TIERS) {
    const tierChecks = checks.filter(r => r.tier === tier);
    if (tierChecks.every(r => r.ok)) badge = tier;
    else break;
  }
  return badge;
}

function printCheckResults(skillName, checks) {
  console.log('');
  console.log(c.bold(`  ${skillName}`) + c.dim(' — quality check'));
  console.log('  ' + c.line(55));

  for (const tier of TIERS) {
    const tierChecks = checks.filter(r => r.tier === tier);
    console.log(`\n  ${BADGE[tier]} — ${c.dim(LABEL[tier])}`);
    for (const r of tierChecks) {
      const icon = r.ok ? c.green('✓') : c.red('✗');
      console.log(`  ${icon} ${r.ok ? r.msg : c.red(r.msg)}`);
    }
  }

  const badge = earnedBadge(checks);
  console.log('');
  console.log(`  Result: ${badge ? BADGE[badge] : c.dim('No badge — fix Bronze issues first')}`);
  console.log('');
  return badge;
}

// ─── EVAL command ─────────────────────────────────────────────────────────────

function commandExists(cmd) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

function detectProvider() {
  if (process.env.ANTHROPIC_API_KEY)
    return { type: 'anthropic', defaultModel: 'claude-haiku-4-5-20251001' };
  if (process.env.OPENAI_API_KEY)
    return { type: 'openai-compat', baseUrl: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY, defaultModel: 'gpt-4o-mini' };
  if (process.env.EVAL_API_KEY && process.env.EVAL_BASE_URL)
    return { type: 'openai-compat', baseUrl: process.env.EVAL_BASE_URL, key: process.env.EVAL_API_KEY, defaultModel: null };
  if (commandExists('claude'))
    return { type: 'claude-cli', defaultModel: 'default' };
  if (commandExists('ollama'))
    return { type: 'openai-compat', baseUrl: 'http://localhost:11434/v1', key: 'ollama', defaultModel: null };
  return null;
}

function callAnthropicApi(systemPrompt, userMessage, model) {
  const reqBody = { model, max_tokens: 4096, messages: [{ role: 'user', content: userMessage }] };
  if (systemPrompt) reqBody.system = systemPrompt;
  const body = JSON.stringify(reqBody);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.content?.[0]?.text ?? '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callOpenAICompat(baseUrl, apiKey, systemPrompt, userMessage, model) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });
  const body = JSON.stringify({ model, max_tokens: 4096, messages });

  const url = new URL('/chat/completions', baseUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          else resolve(parsed.choices?.[0]?.message?.content ?? '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callClaudeCli(systemPrompt, userMessage) {
  // --bare disables OAuth/keychain auth (requires ANTHROPIC_API_KEY), so omit it
  // when using a subscription-based Claude login.
  const cliArgs = ['-p', userMessage, '--tools', ''];
  if (systemPrompt) cliArgs.push('--system-prompt', systemPrompt);
  const result = spawnSync('claude', cliArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error) return Promise.reject(result.error);
  if (result.status !== 0) return Promise.reject(new Error(result.stderr?.trim() || 'claude CLI failed'));
  return Promise.resolve(result.stdout.trim());
}

let _provider = null;
function getProvider() {
  if (!_provider) _provider = detectProvider();
  return _provider;
}

function callLLM(systemPrompt, userMessage, model) {
  const provider = getProvider();
  if (!provider) throw new Error(
    'No LLM provider found.\n' +
    '  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or EVAL_API_KEY+EVAL_BASE_URL\n' +
    '  — or install Claude Code (claude.ai/code) or Ollama (ollama.com)'
  );
  if (provider.type === 'anthropic')    return callAnthropicApi(systemPrompt, userMessage, model);
  if (provider.type === 'openai-compat') return callOpenAICompat(provider.baseUrl, provider.key, systemPrompt, userMessage, model);
  if (provider.type === 'claude-cli')   return callClaudeCli(systemPrompt, userMessage);
  throw new Error(`Unknown provider type: ${provider.type}`);
}

function judgeResponse(response, expectations, model) {
  const numbered = expectations.map((e, i) => `${i + 1}. ${e}`).join('\n');
  const judgeSystem = `You are an eval judge. For each numbered expectation, respond with exactly:
<n>. PASS — <brief one-line reason>
or
<n>. FAIL — <brief one-line reason>
Output only the numbered lines. No other text.`;

  const judgePrompt = `=== Response to evaluate ===
${response}

=== Expectations ===
${numbered}`;

  return callLLM(judgeSystem, judgePrompt, model);
}

function parseJudgement(judgement, count) {
  const results = [];
  for (let i = 1; i <= count; i++) {
    const match = judgement.match(new RegExp(`${i}\\.\\s*(PASS|FAIL)\\s*[—\\-–]?\\s*(.+)`, 'i'));
    if (match) {
      results.push({ ok: match[1].toUpperCase() === 'PASS', reason: match[2].trim() });
    } else {
      results.push({ ok: false, reason: 'judge did not return a result for this expectation' });
    }
  }
  return results;
}

async function runEvalSet(evals, systemPrompt, model, judgeModel, verbose) {
  let totalPass = 0, totalFail = 0, evalsFullyPassed = 0;

  for (const ev of evals) {
    const promptLines = (ev.prompt || '').split('\n').length;
    const expectations = ev.expectations || [];

    if (verbose) {
      process.stdout.write(`  ${c.cyan('●')} ${c.bold(ev.id)}\n`);
      process.stdout.write(c.dim(`    prompt: ${promptLines} lines — calling ${model}...`));
    } else {
      process.stdout.write(c.dim(`  ${ev.id}...`));
    }

    let response;
    try {
      response = await callLLM(systemPrompt, ev.prompt, model);
      if (verbose) process.stdout.write(c.green(' done\n'));
      else process.stdout.write(c.dim(' ✓\n'));
    } catch (e) {
      if (verbose) process.stdout.write(c.red(` failed: ${e.message}\n`));
      else process.stdout.write(c.red(` ✗\n`));
      totalFail += expectations.length;
      continue;
    }

    if (verbose) process.stdout.write(c.dim(`    judging ${expectations.length} expectations...`));

    let judgement;
    try {
      judgement = await judgeResponse(response, expectations, judgeModel);
      if (verbose) process.stdout.write(c.dim(' done\n'));
    } catch (e) {
      if (verbose) process.stdout.write(c.red(` judge failed: ${e.message}\n`));
      totalFail += expectations.length;
      continue;
    }

    const results = parseJudgement(judgement, expectations.length);
    let evalPass = 0;

    for (let i = 0; i < expectations.length; i++) {
      const r = results[i];
      if (verbose) {
        const icon = r.ok ? c.green('✓') : c.red('✗');
        const exp = expectations[i].length > 80 ? expectations[i].slice(0, 79) + '…' : expectations[i];
        console.log(`    ${icon} ${exp}`);
        if (!r.ok) console.log(c.dim(`      → ${r.reason}`));
      }
      if (r.ok) { evalPass++; totalPass++; } else { totalFail++; }
    }

    const evalTotal = expectations.length;
    const allPassed = evalPass === evalTotal;
    if (allPassed) evalsFullyPassed++;
    if (verbose) console.log(c.dim(`    ${evalPass}/${evalTotal} expectations passed`) + (allPassed ? ' ' + c.green('✓') : '') + '\n');
  }

  const total = totalPass + totalFail;
  return { passed: totalPass, failed: totalFail, total, evalsFullyPassed, pass_rate: total > 0 ? totalPass / total : 0 };
}

async function runEvals(skillName, opts = {}) {
  const skillDir = path.join(skillsRoot, skillName);
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  const provider = getProvider();
  if (!provider) {
    console.error(c.red(
      '✗ No LLM provider found.\n' +
      '  Options (pick one):\n' +
      '    ANTHROPIC_API_KEY=sk-ant-...   (Anthropic API)\n' +
      '    OPENAI_API_KEY=sk-...           (OpenAI)\n' +
      '    EVAL_API_KEY=... EVAL_BASE_URL=https://api.groq.com/openai/v1  (any OpenAI-compatible)\n' +
      '    Install Claude Code: claude.ai/code  (subscription, no key)\n' +
      '    Install Ollama: ollama.com           (local, no key)'
    ));
    process.exit(1);
  }
  const defaultModel = provider.defaultModel;
  const model = opts.model || process.env.EVAL_MODEL || defaultModel;
  if (!model) {
    console.error(c.red(`✗ No model specified. Use --model=<name> or set EVAL_MODEL env var.`));
    process.exit(1);
  }
  const judgeModel = model;
  const filterId = opts.id || null;

  if (!fs.existsSync(evalsPath)) {
    console.error(c.red(`✗ No evals/evals.json found for "${skillName}"`));
    process.exit(1);
  }

  let evals;
  try {
    evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8')).evals || [];
  } catch {
    console.error(c.red('✗ evals/evals.json is invalid JSON'));
    process.exit(1);
  }

  if (filterId) evals = evals.filter(e => e.id === filterId);
  if (!evals.length) {
    console.error(c.red(`✗ No evals found${filterId ? ` matching --id ${filterId}` : ''}`));
    process.exit(1);
  }

  const skillMd = getSkillMdContent(skillName);

  console.log('');
  console.log(c.bold(`  ${skillName}`) + c.dim(` — evals (${evals.length})`));
  console.log('  ' + c.line(55));
  const providerLabel = provider.type === 'claude-cli' ? 'claude CLI' : provider.type === 'anthropic' ? 'Anthropic API' : provider.baseUrl;
  console.log(c.dim(`  provider: ${providerLabel}  model: ${model}\n`));

  // ── With-skill run ──────────────────────────────────────────────────────────
  console.log(c.bold('  With skill\n'));
  const withResult = await runEvalSet(evals, skillMd, model, judgeModel, true);
  const withPct = Math.round(withResult.pass_rate * 100);
  const withColor = withPct >= 80 ? c.green : withPct >= 60 ? c.yellow : c.red;
  console.log('  ' + c.line(55));
  console.log(`  ${withColor(`${withPct}%`)} — ${withResult.evalsFullyPassed}/${evals.length} evals fully passed, ${withResult.passed}/${withResult.total} expectations met\n`);

  // ── Baseline run (no skill system prompt) ───────────────────────────────────
  console.log(c.dim('  Baseline (without skill)\n'));
  const baseResult = await runEvalSet(evals, null, model, judgeModel, false);
  const basePct = Math.round(baseResult.pass_rate * 100);
  console.log('  ' + c.line(55));
  console.log(c.dim(`  ${basePct}% — ${baseResult.passed}/${baseResult.total} expectations met\n`));

  // ── Summary ─────────────────────────────────────────────────────────────────
  const deltaPp = withPct - basePct;
  const deltaColor = deltaPp >= 20 ? c.green : deltaPp >= 10 ? c.yellow : c.red;
  console.log('  ' + c.line(55));
  console.log(`  ${c.bold('Summary')}  with skill: ${withColor(`${withPct}%`)}  baseline: ${c.dim(`${basePct}%`)}  delta: ${deltaColor(`+${deltaPp}pp`)}`);

  // ── Warn if using a non-standard provider ───────────────────────────────────
  const isLocalModel = provider.type === 'openai-compat' && provider.baseUrl.includes('localhost');
  const isCliModel   = provider.type === 'claude-cli';
  if (isLocalModel || isCliModel) {
    const providerName = isLocalModel ? `local model (${model})` : 'claude CLI';
    console.log('');
    console.log(c.yellow(`  ⚠ Results generated with ${providerName}.`));
    console.log(c.dim('    For committing to the repo, use a standardized provider so scores'));
    console.log(c.dim('    are comparable across all skills:'));
    console.log(c.dim('      ANTHROPIC_API_KEY=...   (recommended: claude-haiku-4-5-20251001)'));
    console.log(c.dim('      OPENAI_API_KEY=...       (recommended: gpt-4o-mini)'));
    console.log(c.dim('    results.json will be written but should not be committed as-is.'));
  }

  // ── Write results.json ───────────────────────────────────────────────────────
  const resultsData = {
    pass_rate: Math.round(withResult.pass_rate * 1000) / 1000,
    passed: withResult.passed,
    total: withResult.total,
    baseline_pass_rate: Math.round(baseResult.pass_rate * 1000) / 1000,
    baseline_passed: baseResult.passed,
    baseline_total: baseResult.total,
    delta: Math.round((withResult.pass_rate - baseResult.pass_rate) * 1000) / 1000,
    model,
    evals_run: evals.length,
    date: new Date().toISOString().split('T')[0],
    ...(isLocalModel || isCliModel ? { non_standard_provider: true } : {}),
  };
  const resultsPath = path.join(skillDir, 'evals', 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));
  console.log(c.dim(`\n  ✓ results saved → evals/results.json\n`));

  if (withPct < 80) {
    console.error(c.red(`  ✗ Pass rate ${withPct}% is below the 80% minimum\n`));
    process.exit(1);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function main() {
  switch (command) {

    case 'list': {
      const skills = getAvailableSkills();
      const nameWidth = Math.max(...skills.map(s => s.length)) + 2;
      console.log('');
      console.log(c.bold(`  Skills`) + c.dim(` (${skills.length} available)`));
      console.log('  ' + c.line(nameWidth + 67));
      for (const s of skills) {
        const { description } = parseSkillFrontmatter(s);
        console.log(`  ${c.cyan(s.padEnd(nameWidth))}${c.dim(description ? firstSentence(description) : '')}`);
      }
      console.log('  ' + c.line(nameWidth + 67));
      console.log(c.dim(`\n  npx @booklib/skills add <name>      install to .claude/skills/`));
      console.log(c.dim(`  npx @booklib/skills info <name>     full description`));
      console.log(c.dim(`  npx @booklib/skills demo <name>     before/after example`));
      console.log(c.dim(`  npx @booklib/skills check <name>    quality check\n`));
      break;
    }

    case 'info': {
      const skillName = args.find(a => !a.startsWith('--') && a !== 'info');
      if (!skillName) { console.error(c.red('Usage: skills info <skill-name>')); process.exit(1); }
      const skills = getAvailableSkills();
      if (!skills.includes(skillName)) {
        console.error(c.red(`✗ "${skillName}" not found.`) + ' Run ' + c.cyan('skills list') + ' to see available skills.');
        process.exit(1);
      }
      const { description } = parseSkillFrontmatter(skillName);
      const skillMdPath = path.join(skillsRoot, skillName, 'SKILL.md');
      const hasEvals    = fs.existsSync(path.join(skillsRoot, skillName, 'evals'));
      const hasExamples = fs.existsSync(path.join(skillsRoot, skillName, 'examples'));
      const hasRefs     = fs.existsSync(path.join(skillsRoot, skillName, 'references'));
      const lines = fs.readFileSync(skillMdPath, 'utf8').split('\n').length;

      console.log('');
      console.log(c.bold(`  ${skillName}`));
      console.log('  ' + c.line(60));
      const words = description.split(' ');
      let line = '  ';
      for (const word of words) {
        if (line.length + word.length > 74) { console.log(line); line = '  ' + word + ' '; }
        else line += word + ' ';
      }
      if (line.trim()) console.log(line);
      console.log('');
      console.log(c.dim('  Includes: ') + [
        hasEvals    ? c.green('evals')    : null,
        hasExamples ? c.green('examples') : null,
        hasRefs     ? c.green('references') : null,
        `${lines} lines`,
      ].filter(Boolean).join(c.dim(' · ')));
      console.log('');
      console.log(`  ${c.cyan('Install:')} npx @booklib/skills add ${skillName}`);
      if (hasExamples) console.log(`  ${c.cyan('Demo:')}    npx @booklib/skills demo ${skillName}`);
      console.log(`  ${c.cyan('Check:')}   npx @booklib/skills check ${skillName}`);
      console.log('');
      break;
    }

    case 'demo': {
      const skillName = args.find(a => !a.startsWith('--') && a !== 'demo');
      if (!skillName) { console.error(c.red('Usage: skills demo <skill-name>')); process.exit(1); }
      const skills = getAvailableSkills();
      if (!skills.includes(skillName)) {
        console.error(c.red(`✗ "${skillName}" not found.`) + ' Run ' + c.cyan('skills list') + ' to see available skills.');
        process.exit(1);
      }
      const beforePath = path.join(skillsRoot, skillName, 'examples', 'before.md');
      const afterPath  = path.join(skillsRoot, skillName, 'examples', 'after.md');
      if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
        console.log(c.yellow(`  No demo available for "${skillName}" yet.`));
        console.log(c.dim(`  Try: npx @booklib/skills info ${skillName}\n`));
        process.exit(0);
      }
      const before = fs.readFileSync(beforePath, 'utf8').trim();
      const after  = fs.readFileSync(afterPath, 'utf8').trim();
      console.log('');
      console.log(c.bold(`  ${skillName}`) + c.dim(' — before/after example'));
      console.log('  ' + c.line(60));
      console.log('\n' + c.bold(c.yellow('  BEFORE')) + '\n');
      before.split('\n').forEach(l => console.log('  ' + l));
      console.log('\n' + c.bold(c.green('  AFTER')) + '\n');
      after.split('\n').forEach(l => console.log('  ' + l));
      console.log(c.dim(`\n  Install: npx @booklib/skills add ${skillName}\n`));
      break;
    }

    case 'add': {
      const addAll     = args.includes('--all');
      const noCommands = args.includes('--no-commands');
      const noAgents   = args.includes('--no-agents');
      const agentArg   = args.find(a => a.startsWith('--agent='))?.split('=')[1];
      const profileArg = args.find(a => a.startsWith('--profile='))?.split('=')[1];
      const skillName  = args.find(a => !a.startsWith('--') && a !== 'add');

      if (profileArg) {
        const profile = PROFILES[profileArg];
        if (!profile) {
          console.error(c.red(`✗ Profile "${profileArg}" not found.`) + ' Run ' + c.cyan('skills profiles') + ' to see available profiles.');
          process.exit(1);
        }
        profile.skills.forEach(s => copySkill(s, targetDir));
        if (!noCommands) profile.skills.forEach(s => copyCommand(s));
        if (!noAgents)   profile.agents.forEach(a => copyAgent(a));
        const agentStr = profile.agents.length
          ? `, ${profile.agents.length} agent${profile.agents.length > 1 ? 's' : ''}`
          : '';
        console.log(c.dim(`\nInstalled profile "${profileArg}": ${profile.skills.length} skills${agentStr}`));
      } else if (agentArg) {
        // explicit: skills add --agent=booklib-reviewer
        const agents = getAvailableAgents();
        if (!agents.includes(agentArg)) {
          console.error(c.red(`✗ Agent "${agentArg}" not found.`) + ' Available: ' + c.dim(agents.join(', ')));
          process.exit(1);
        }
        copyAgent(agentArg);
        console.log(c.dim(`\nInstalled to ${agentsTargetDir}`));
      } else if (addAll) {
        const skills = getAvailableSkills();
        skills.forEach(s => copySkill(s, targetDir));
        if (!noCommands) skills.forEach(s => copyCommand(s));
        if (!noAgents) getAvailableAgents().forEach(a => copyAgent(a));
        const agentCount = noAgents ? 0 : getAvailableAgents().length;
        console.log(c.dim(`\nInstalled ${skills.length} skills, ${agentCount} agents to .claude/`));
      } else if (skillName) {
        copySkill(skillName, targetDir);
        if (!noCommands) copyCommand(skillName);
        console.log(c.dim(`\nInstalled to ${targetDir}`));
      } else {
        console.error(c.red('Usage: skills add <skill-name> | skills add --all | skills add --agent=<name>'));
        process.exit(1);
      }
      break;
    }

    case 'check': {
      const checkAll  = args.includes('--all');
      const skillName = args.find(a => !a.startsWith('--') && a !== 'check');

      if (checkAll) {
        const skills = getAvailableSkills();
        const summary = [];
        for (const s of skills) {
          const checks = checkSkill(s);
          const badge  = earnedBadge(checks);
          const pass   = checks.filter(r => r.ok).length;
          const total  = checks.length;
          const icon   = badge ? BADGE[badge] : c.red('no badge');
          summary.push({ name: s, badge, pass, total, icon });
        }
        console.log('');
        console.log(c.bold('  Quality summary'));
        console.log('  ' + c.line(60));
        const nameW = Math.max(...summary.map(s => s.name.length)) + 2;
        for (const s of summary) {
          const bar = `${s.pass}/${s.total}`.padStart(5);
          const failures = s.pass < s.total ? c.dim(` (${s.total - s.pass} issues)`) : '';
          console.log(`  ${s.name.padEnd(nameW)}${s.icon}  ${c.dim(bar)}${failures}`);
        }
        const gold = summary.filter(s => ['gold', 'platinum'].includes(s.badge)).length;
        const belowGold = summary.filter(s => !['gold', 'platinum'].includes(s.badge));
        console.log('  ' + c.line(60));
        console.log(c.dim(`\n  ${gold}/${skills.length} skills at Gold or above\n`));
        if (belowGold.length) {
          console.error(c.red(`  ✗ ${belowGold.length} skill(s) below Gold: ${belowGold.map(s => s.name).join(', ')}\n`));
          process.exit(1);
        }
      } else if (skillName) {
        const checks = checkSkill(skillName);
        printCheckResults(skillName, checks);
        const badge = earnedBadge(checks);
        process.exit(badge ? 0 : 1);
      } else {
        console.error(c.red('Usage: skills check <skill-name> | skills check --all'));
        process.exit(1);
      }
      break;
    }

    case 'eval': {
      const skillName  = args.find(a => !a.startsWith('--') && a !== 'eval');
      const modelArg   = args.find(a => a.startsWith('--model='))?.split('=')[1];
      const idArg      = args.find(a => a.startsWith('--id='))?.split('=')[1];

      if (!skillName) {
        console.error(c.red('Usage: skills eval <skill-name> [--model=<model>] [--id=<eval-id>]'));
        process.exit(1);
      }
      const skills = getAvailableSkills();
      if (!skills.includes(skillName)) {
        console.error(c.red(`✗ "${skillName}" not found.`) + ' Run ' + c.cyan('skills list') + ' to see available skills.');
        process.exit(1);
      }
      await runEvals(skillName, { model: modelArg, id: idArg });
      break;
    }

    case 'update-readme': {
      const skills = getAvailableSkills();
      const rows = skills.map(skillName => {
        const resultsPath = path.join(skillsRoot, skillName, 'evals', 'results.json');
        if (!fs.existsSync(resultsPath)) return `| ${skillName} | — | — | — | — | — |`;
        try {
          const r = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
          const pct      = Math.round((r.pass_rate || 0) * 100) + '%';
          const basePct  = r.baseline_pass_rate !== undefined ? Math.round(r.baseline_pass_rate * 100) + '%' : '—';
          const delta    = r.delta !== undefined ? `+${Math.round(r.delta * 100)}pp` : '—';
          const warn     = r.non_standard_provider ? ' ⚠' : '';
          return `| ${skillName} | ${pct}${warn} | ${basePct} | ${delta} | ${r.evals_run ?? '—'} | ${r.date ?? '—'} |`;
        } catch { return `| ${skillName} | — | — | — | — | — |`; }
      });

      const tableHeader = '| Skill | Pass Rate | Baseline | Delta | Evals | Last Run |\n|-------|-----------|----------|-------|-------|----------|';
      const newTable = `<!-- quality-table-start -->\n${tableHeader}\n${rows.join('\n')}\n<!-- quality-table-end -->`;

      const readmePath = path.join(__dirname, '..', 'README.md');
      let readme = fs.readFileSync(readmePath, 'utf8');
      readme = readme.replace(/<!-- quality-table-start -->[\s\S]*?<!-- quality-table-end -->/, newTable);
      fs.writeFileSync(readmePath, readme);

      const missing = skills.filter(s => !fs.existsSync(path.join(skillsRoot, s, 'evals', 'results.json')));
      const nonStd  = skills.filter(s => {
        try { return JSON.parse(fs.readFileSync(path.join(skillsRoot, s, 'evals', 'results.json'), 'utf8')).non_standard_provider; }
        catch { return false; }
      });
      console.log('');
      console.log(c.green('✓') + ` README.md quality table updated (${skills.length} skills)`);
      if (missing.length)  console.log(c.dim(`  ${missing.length} pending: ${missing.join(', ')}`));
      if (nonStd.length)   console.log(c.yellow(`  ⚠ ${nonStd.length} non-standard provider: ${nonStd.join(', ')}`));
      console.log('');
      break;
    }

    case 'profiles': {
      const nameW = Math.max(...Object.keys(PROFILES).map(k => k.length)) + 2;
      console.log('');
      console.log(c.bold('  Installation profiles'));
      console.log('  ' + c.line(60));
      for (const [name, profile] of Object.entries(PROFILES)) {
        const skillCount = `${profile.skills.length} skill${profile.skills.length !== 1 ? 's' : ''}`;
        const agentPart  = profile.agents.length ? ` + ${profile.agents.length} agent` : '';
        console.log(`  ${c.cyan(name.padEnd(nameW))}${c.dim(skillCount + agentPart)}`);
        console.log(`  ${' '.repeat(nameW)}${profile.description}`);
        console.log('');
      }
      console.log(c.dim(`  Install: ${c.cyan('skills add --profile=<name>')}`));
      console.log('');
      break;
    }

    default:
      console.log(`
${c.bold('  @booklib/skills')} — book knowledge distilled into AI agent skills

${c.bold('  Usage:')}
    ${c.cyan('skills list')}                       list all available skills
    ${c.cyan('skills profiles')}                   list available profiles
    ${c.cyan('skills info')}  ${c.dim('<name>')}               full description of a skill
    ${c.cyan('skills demo')}  ${c.dim('<name>')}               before/after example
    ${c.cyan('skills add')}   ${c.dim('--profile=<name>')}     install a profile (skills + commands + agent)
    ${c.cyan('skills add')}   ${c.dim('<name>')}               install a single skill + /command
    ${c.cyan('skills add --all')}                  install everything (skills + commands + agents)
    ${c.cyan('skills add')}   ${c.dim('<name> --global')}      install globally (~/.claude/)
    ${c.cyan('skills add')}   ${c.dim('--agent=<name>')}       install a single agent to .claude/agents/
    ${c.cyan('skills add')}   ${c.dim('--no-commands')}        skip /command installation
    ${c.cyan('skills add')}   ${c.dim('--no-agents')}          skip agent installation
    ${c.cyan('skills check')} ${c.dim('<name>')}               quality check (Bronze/Silver/Gold/Platinum)
    ${c.cyan('skills check --all')}                quality summary for all skills
    ${c.cyan('skills update-readme')}              refresh README quality table from results.json files
    ${c.cyan('skills eval')}  ${c.dim('<name>')}               run evals (auto-detects provider)
    ${c.cyan('skills eval')}  ${c.dim('<name> --model=<id>')}  use a specific model
    ${c.cyan('skills eval')}  ${c.dim('<name> --id=<eval-id>')} run a single eval

  ${c.bold('Provider auto-detection (first match wins):')}
    ANTHROPIC_API_KEY          Anthropic API  (default model: claude-haiku-4-5-20251001)
    OPENAI_API_KEY             OpenAI API     (default model: gpt-4o-mini)
    EVAL_API_KEY+EVAL_BASE_URL any OpenAI-compatible endpoint (Groq, Together, etc.)
    ollama installed           local Ollama   (requires --model or EVAL_MODEL)
    claude CLI installed       Claude Code subscription — no key needed
`);
  }
}

main().catch(err => {
  console.error(c.red('Error: ') + err.message);
  process.exit(1);
});
