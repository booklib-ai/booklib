// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { createWizardUI, sep } from './prompt.js';
import { detect as detectProject } from './project-detector.js';
import { SKILL_LIMIT } from './skill-recommender.js';
import { detectIntegrations } from './integration-detector.js';
import { SkillFetcher, countAllSlots, countInstalledSlots, listInstalledSkillNames, installSkill } from '../skill-fetcher.js';
import { BookLibIndexer } from '../engine/indexer.js';
import { BookLibSearcher } from '../engine/searcher.js';
import { AgentDetector } from '../agent-detector.js';
import { ProjectInitializer } from '../project-initializer.js';
import { resolveBookLibPaths } from '../paths.js';
import { writeMCPConfig, MCP_CAPABLE } from '../mcp-config-writer.js';

/** Recursively count content files (.md, .yaml, .txt, etc.) in a directory. */
function countContentFiles(dirPath) {
  let count = 0;
  const walk = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name));
        } else if (/\.(md|mdx|txt|yml|yaml|sh|json)$/i.test(entry.name)) {
          count++;
        }
      }
    } catch { /* permission error, skip */ }
  };
  walk(dirPath);
  return count;
}

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};
const ALL_AGENTS = Object.keys(AGENT_LABELS);

/**
 * Merge BookLib hooks into the user's .claude/settings.json.
 * Resolves ${BOOKLIB_ROOT} in hooks.json to the actual package path.
 * @param {string} cwd - project directory (unused, hooks are global)
 * @returns {string|null} path to written settings file, or null
 */
function writeClaudeHooks(cwd) {
  const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
  const hooksJsonPath = path.join(packageRoot, 'hooks', 'hooks.json');

  if (!fs.existsSync(hooksJsonPath)) return null;

  const hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }

  if (!settings.hooks) settings.hooks = {};

  // Resolve ${BOOKLIB_ROOT} to actual package path in all hook commands
  const resolveCmd = (cmd) => cmd.replace(/\$\{BOOKLIB_ROOT\}/g, packageRoot);

  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
    }

    for (const entry of entries) {
      const resolved = {
        ...entry,
        hooks: (entry.hooks ?? []).map(h => ({
          ...h,
          command: resolveCmd(h.command),
        })),
      };

      // Skip if an identical hook command already exists for this event
      const alreadyInstalled = settings.hooks[event].some(existing =>
        existing.hooks?.some(eh =>
          resolved.hooks.some(rh => rh.command === eh.command)
        )
      );
      if (alreadyInstalled) continue;

      settings.hooks[event].push(resolved);
    }
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return settingsPath;
}

export async function runWizard(cwd = process.cwd(), opts = {}) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');

  if (opts.reset) {
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    // Offer clean slate — clear local index, sources, cache
    const booklibDir = path.join(cwd, '.booklib');
    if (fs.existsSync(booklibDir)) {
      const ui = createWizardUI();
      const clean = await ui.confirm('Clear local BookLib data? (index, sources, cache)', false);
      if (clean) {
        fs.rmSync(booklibDir, { recursive: true, force: true });
      }
    }
    return runSetup(cwd);
  }

  if (fs.existsSync(markerPath)) {
    console.log('\n  Already initialized. Running relevance check...');
    console.log('  (to re-run full setup: rm -rf .booklib && booklib init)\n');
    return runRelevanceAudit(cwd);
  }
  return runSetup(cwd);
}

// ── Setup flow ───────────────────────────────────────────────────────────────

async function runSetup(cwd) {
  const ui = createWizardUI();

  // Banner
  console.log('');
  console.log('      \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2510 \u2726');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  BookLib');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502');
  console.log('      \u2502 \u2500\u2500   \u2502 \u2500\u2500   \u2502  AI-agent skills from');
  console.log('      \u2502 \u2500\u2500\u2500  \u2502 \u2500\u2500\u2500  \u2502  expert knowledge');
  console.log('      \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2518');
  console.log('');

  ui.intro('Setup Wizard');

  // Step 1: Project detection
  const project = await stepProjectDetection(ui, cwd);

  // Step 2: Profile selection
  const profile = await stepProfileSelection(ui);

  // Step 3: Processing mode
  const { mode: reasoningMode, ollamaModel } = await stepProcessingMode(ui, cwd);

  // Save profile + reasoning to config (single write)
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.profile = profile;
    savedConfig.reasoning = reasoningMode;
    if (reasoningMode === 'local') savedConfig.ollamaModel = ollamaModel;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch (err) { ui.log.warn(`Could not save config: ${err.message}`); }

  // Step 4: Count installed skills (warning deferred to skill recommendation step)
  const slotsUsed = countInstalledSlots();
  const installedNames = listInstalledSkillNames();

  // Step 5: Tool detection
  const selectedAgents = await stepToolSelection(ui, cwd);

  // Step 6: Index build with spinner
  const resolvedIndexPath = await stepIndexBuild(ui);

  // Step 7: Scan for knowledge gaps
  const { gaps, connectSuggestions } = await stepGapDetection(ui, cwd);

  // Step 8: Connect project docs
  const indexedSources = await stepConnectDocs(ui, cwd, connectSuggestions);

  // Step 8b: Demo decision checker on one source file
  await stepDecisionDemo(ui, cwd, indexedSources);

  // Step 9: Offer GitHub releases for post-training deps
  await stepConnectGitHub(ui, gaps);

  // Step 10: Show project analysis — which APIs are affected by gaps
  let analysisResult = null;
  if (gaps?.postTraining?.length > 0) {
    analysisResult = await stepShowAnalysis(ui, cwd);
  }

  // Step 11: Auto-resolve knowledge gaps via Context7 / GitHub / manual
  let gapResults = { resolved: 0, unresolved: 0 };
  if (gaps?.postTraining?.length > 0) {
    gapResults = await stepResolveGaps(ui, cwd, gaps.postTraining);
  }

  // Step 11b: Build runtime context map from knowledge graph + gaps
  await stepBuildContextMap(ui, cwd, gaps);

  // Step 12: Recommend + install + cleanup
  const selectedSkills = await stepRecommendAndInstall(ui, project, slotsUsed, installedNames, resolvedIndexPath);

  // Step 13: Write config files
  const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
  const stack = project.languages.join(', ');
  await stepWriteConfigs(ui, cwd, selectedAgents, skillsForConfig, profile, stack);

  // Step 14: Summary
  ui.outro('Setup complete');

  const finalSlots = countInstalledSlots();
  const totalDocs = indexedSources.reduce((sum, s) => sum + (s.files || 0), 0);
  const resolvedCount = gapResults.details?.filter(d => d.resolved).length ?? 0;
  const unresolvedCount = gapResults.details?.filter(d => !d.resolved).length ?? 0;

  console.log('');

  const postCount = gaps?.postTraining?.length ?? 0;
  const apiCount = analysisResult?.totalApis ?? 0;
  const fileCount = analysisResult?.totalFiles ?? 0;

  console.log('  What was found:');
  if (postCount > 0) {
    console.log(`    ${postCount} packages released after your AI's training data`);
    console.log(`    ${fileCount} files affected, ${apiCount} APIs your AI may get wrong`);
  }
  if (indexedSources.length > 0) {
    console.log('    Team decisions indexed from your docs and specs');
  }
  if (postCount === 0 && indexedSources.length === 0) {
    console.log('    No knowledge gaps detected. Connect team docs for more value.');
  }
  console.log('');

  if (selectedAgents.length > 0) {
    console.log('  Your tools:');
    console.log('');
    for (const agent of selectedAgents) {
      const label = (AGENT_LABELS[agent] ?? agent).padEnd(17);
      if (agent === 'claude') {
        console.log(`    ${label}automatic — corrects before edits, catches`);
        console.log('                      contradictions after');
      } else if (['cursor', 'copilot', 'gemini', 'windsurf', 'roo-code', 'goose', 'opencode'].includes(agent)) {
        console.log(`    ${label}on-demand — AI calls BookLib when it needs help`);
      } else {
        console.log(`    ${label}guidelines — project standards in config file`);
      }
    }
    console.log('');
  }

  console.log('  BookLib stays silent when everything is fine.');
  console.log('');
  console.log(`  ${sep()}`);
  console.log('');
  console.log('  Try it now:  booklib analyze');
  console.log('');
  console.log('  When you need it:');
  console.log('    booklib analyze            files and APIs your AI may get wrong');
  console.log('    booklib gaps               packages newer than your AI knows');
  console.log('    booklib connect <source>   add Notion, GitHub, or local docs');
  console.log('    booklib search "query"     search indexed knowledge');
  console.log('    booklib doctor             health check');
  console.log('');

  // Mark initialized
  const markerPath = path.join(cwd, '.booklib', 'initialized');
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString());
}

async function stepProjectDetection(ui, cwd) {
  const project = detectProject(cwd);

  if (project.languages.length > 0) {
    const langs = project.languages.join(', ');
    const fw = project.frameworks.length ? ` (${project.frameworks.join(', ')})` : '';
    const ok = await ui.confirm(`Detected: ${langs}${fw}. Correct?`, true);
    if (!ok) {
      const answer = await ui.text('Describe your stack:', 'e.g. React + Node.js, Kotlin Android');
      return { languages: [answer], frameworks: [], signals: [] };
    }
  } else {
    const answer = await ui.text('What are you building?', 'e.g. React + Node.js, Kotlin Android');
    return { languages: [answer], frameworks: [], signals: [] };
  }

  return project;
}

async function stepProfileSelection(ui) {
  const profile = await ui.select('What kind of work is this project for?', [
    { value: 'software-development', label: 'Software development', hint: 'recommended' },
    { value: 'writing-content', label: 'Writing & content' },
    { value: 'research-analysis', label: 'Research & analysis' },
    { value: 'design', label: 'Design' },
    { value: 'general', label: 'General / other' },
  ]);
  return profile;
}

async function stepProcessingMode(ui, cwd) {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasApiKey = hasAnthropicKey || hasOpenAIKey;
  const keyProvider = hasAnthropicKey ? 'Anthropic' : hasOpenAIKey ? 'OpenAI' : null;

  // Check if Ollama is available
  let ollamaAvailable = false;
  let ollamaModels = [];
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      ollamaModels = (data.models ?? []).map(m => m.name);
      ollamaAvailable = true;
    }
  } catch { /* Ollama not running */ }

  const options = [];

  if (hasApiKey) {
    options.push({ value: 'api', label: 'Cloud AI (recommended)', hint: `Uses your ${keyProvider} API key — best quality, ~1-2s per query` });
  } else {
    options.push({ value: 'api', label: 'Cloud AI (recommended)', hint: 'Uses API key (Anthropic or OpenAI) — best quality, ~1-2s per query' });
  }

  if (ollamaAvailable && ollamaModels.length > 0) {
    options.push({ value: 'local', label: 'Local AI (Ollama)', hint: `${ollamaModels.length} model(s) available — free, private, ~2s per query` });
  } else {
    options.push({ value: 'local', label: 'Local AI (Ollama)', hint: ollamaAvailable ? 'Ollama running but no models pulled yet' : 'Requires Ollama — free, private, runs on your machine' });
  }

  options.push({ value: 'fast', label: 'Fast (no AI)', hint: 'Instant results, basic filtering — no AI reasoning' });

  let mode = await ui.select('How should BookLib process search results?', options);
  let ollamaModel = 'phi3';

  // === Local mode setup ===
  if (mode === 'local') {
    if (!ollamaAvailable) {
      // Help install Ollama
      const platform = process.platform;
      const installCmd = platform === 'darwin' ? 'brew install ollama' : platform === 'linux' ? 'curl -fsSL https://ollama.com/install.sh | sh' : 'See https://ollama.com/download';

      ui.log.info(
        'Ollama is not running. To set up local AI:\n\n' +
        `  1. Install:  ${installCmd}\n` +
        '  2. Start:    ollama serve\n' +
        '  3. Pull a model:  ollama pull phi3\n\n' +
        'Recommended models:\n' +
        '  phi3       — 3.8B params, ~2GB, fast and capable\n' +
        '  qwen2.5:1.5b — 1.5B params, ~1GB, very fast\n' +
        '  gemma2:2b  — 2B params, ~1.5GB, good quality'
      );

      const proceed = await ui.confirm('Continue with fast mode for now?', true);
      if (proceed) {
        mode = 'fast';
      }
    } else if (ollamaModels.length === 0) {
      // Ollama running but no models
      ui.log.info(
        'Ollama is running but has no models. Pull one:\n\n' +
        '  ollama pull phi3         — 3.8B, ~2GB, recommended\n' +
        '  ollama pull qwen2.5:1.5b — 1.5B, ~1GB, fastest\n' +
        '  ollama pull gemma2:2b    — 2B, ~1.5GB, good quality'
      );
      mode = 'fast';
    } else {
      // Ollama running with models — let user pick
      if (ollamaModels.length === 1) {
        ollamaModel = ollamaModels[0];
        ui.log.success(`Using Ollama model: ${ollamaModel}`);
      } else {
        const modelOptions = ollamaModels.map(m => ({ value: m, label: m }));
        ollamaModel = await ui.select('Which Ollama model should BookLib use?', modelOptions);
        ui.log.success(`Selected: ${ollamaModel}`);
      }
    }
  }

  // === Cloud AI setup ===
  if (mode === 'api' && !hasApiKey) {
    const key = await ui.text(
      'Paste your API key (Anthropic or OpenAI):',
      'sk-...'
    );

    if (key && key.length > 10) {
      const envVar = key.startsWith('sk-ant-') ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      const envPath = path.join(cwd, '.env');
      const envLine = `${envVar}=${key}\n`;
      if (fs.existsSync(envPath)) {
        const existing = fs.readFileSync(envPath, 'utf8');
        if (!existing.includes(envVar)) {
          fs.appendFileSync(envPath, envLine);
        }
      } else {
        fs.writeFileSync(envPath, envLine);
      }
      process.env[envVar] = key;

      const gitignorePath = path.join(cwd, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        if (!gitignore.includes('.env')) {
          fs.appendFileSync(gitignorePath, '\n.env\n');
        }
      } else {
        fs.writeFileSync(gitignorePath, '.env\n');
      }

      ui.log.success(`${envVar} saved to .env (added to .gitignore)`);
    } else {
      ui.log.info(
        'No key provided. BookLib will use fast mode for now.\n' +
        'To enable later, add your key to .env:\n' +
        '  echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env'
      );
      mode = 'fast';
    }
  } else if (mode === 'api' && hasApiKey) {
    ui.log.success(`${keyProvider} API key detected. Cloud AI reasoning enabled.`);
  }

  return { mode, ollamaModel };
}

async function stepToolSelection(ui, cwd) {
  const detector = new AgentDetector({ cwd });
  const detected = detector.detect();
  const detectedSet = new Set(detected);

  const options = ALL_AGENTS.map(a => ({
    value: a,
    label: AGENT_LABELS[a],
    hint: detectedSet.has(a) ? 'detected' : undefined,
  }));

  const selected = await ui.multiselect('Which AI tools do you use?', options, {
    initialValues: detected,
  });

  // Save to config
  try {
    const { configPath } = resolveBookLibPaths(cwd);
    let savedConfig = {};
    try { savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* no config */ }
    savedConfig.tools = selected;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(savedConfig, null, 2));
  } catch { /* best-effort */ }

  const integrations = detectIntegrations({ cwd });
  if (integrations.superpowers) {
    ui.log.info('Detected: obra/superpowers plugin (skills auto-synced)');
  }

  return selected;
}

/**
 * Cheaply checks whether the BM25 index contains at least one skill chunk.
 * A skill chunk is any doc whose metadata has a truthy `name` field
 * (as opposed to knowledge nodes which have `title` or connected sources
 * which have `sourceName`).
 *
 * @param {string} bm25FilePath - Path to bm25.json
 * @returns {boolean}
 */
function bm25ContainsSkills(bm25FilePath) {
  try {
    const raw = fs.readFileSync(bm25FilePath, 'utf8');
    const { docs } = JSON.parse(raw);
    if (!Array.isArray(docs)) return false;
    return docs.some(doc => doc.metadata?.name);
  } catch {
    return false;
  }
}

async function stepIndexBuild(ui) {
  const s = ui.spinner();
  const { indexPath } = resolveBookLibPaths();
  const indexDir = path.dirname(indexPath);
  const indexFile = path.join(indexPath, 'index.json');
  const bm25File = path.join(indexDir, 'bm25.json');

  const vectraExists = fs.existsSync(indexFile);
  const bm25Exists = fs.existsSync(bm25File) && fs.statSync(bm25File).size > 100;

  // Fast path: both indexes exist and contain skill chunks
  if (vectraExists && bm25Exists && bm25ContainsSkills(bm25File)) {
    s.start('Index found');
    s.stop('Index ready (existing)');
    return indexPath;
  }

  // Backup restore: vectra exists but BM25 is missing or has no skills
  if (vectraExists) {
    const backupBm25 = path.join(indexDir, 'index-backup', 'bm25.json');
    if (fs.existsSync(backupBm25) && fs.statSync(backupBm25).size > 100 && bm25ContainsSkills(backupBm25)) {
      fs.copyFileSync(backupBm25, bm25File);
      s.start('Index found');
      s.stop('Index ready');
      return indexPath;
    }
  }

  // Try pre-built index package first — instant setup, no model download
  try {
    const { installIndex, hasPrebuiltIndex } = await import('@booklib/index');
    if (hasPrebuiltIndex()) {
      s.start('Installing pre-built index (~93 MB, one-time download)...');
      await installIndex(indexDir);
      s.stop('Index ready (pre-built)');
      return indexPath;
    }
  } catch {
    // @booklib/index not installed — fall through to build
  }

  // Fall back to building index locally
  const indexer = new BookLibIndexer();

  if (!fs.existsSync(indexFile)) {
    s.start('Downloading embedding model (~25 MB, first time only)...');
    try {
      await indexer.loadModel({ quiet: true });
    } catch (err) {
      s.stop(`Model download failed: ${err.message}`);
      const continueWithFast = await ui.confirm(
        'Continue without semantic search? (BM25 keyword search still works)',
        true
      );
      if (!continueWithFast) {
        ui.log.info('Re-run "booklib init" when network is available.');
        return indexPath;
      }
      ui.log.info('Continuing with keyword search only.');
      return indexPath;
    }
    s.message('Building knowledge index...');
  } else {
    s.start('Building knowledge index...');
  }

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, {
      quiet: true,
      onFileProgress({ current, total, file }) {
        const name = file.split('/')[0] ?? file;
        s.message(`Building knowledge index [${current}/${total} files] ${name}`);
      },
    });
    s.stop('Index ready');
  } catch (err) {
    s.stop(`Index build failed: ${err.message}`);
  }

  return indexPath;
}

async function stepRecommendAndInstall(ui, project, slotsUsed, installedNames, indexPath) {
  const s = ui.spinner();
  s.start('Finding best skills for your project...');

  const searcher = new BookLibSearcher(indexPath);
  const queryText = project.languages.join(' ') + ' best practices';

  // Search to find which skills are most relevant → these get pre-selected
  const recommendedNames = new Set();
  const scoreMap = new Map();
  try {
    const results = await searcher.search(queryText, 30, 0);
    for (const r of results) {
      const name = r.metadata?.name;
      if (!name) continue;
      if (!scoreMap.has(name) || r.score > scoreMap.get(name).score) {
        const snippet = (r.text ?? '').replace(/\n/g, ' ').slice(0, 60).trim();
        scoreMap.set(name, { score: r.score, displayScore: r.displayScore, snippet });
      }
    }
    // Top scoring skills are recommended
    const sorted = [...scoreMap.entries()].sort((a, b) => b[1].score - a[1].score);
    for (const [name] of sorted.slice(0, 8)) {
      recommendedNames.add(name);
    }
  } catch (err) {
    // Search failed — show all skills without recommendations
    ui.log.warn(`Skill matching unavailable: ${err.message}`);
  }

  // Fallback: if search returned 0 recommendations, use language-based mapping
  if (recommendedNames.size === 0) {
    const LANG_SKILLS = {
      typescript: ['effective-typescript', 'clean-code-typescript', 'react-typescript-cheatsheet'],
      javascript: ['airbnb-javascript', 'js-testing-best-practices', 'node-error-handling'],
      python: ['effective-python', 'python-google-style', 'using-asyncio-python'],
      java: ['effective-java', 'spring-boot-in-action', 'design-patterns'],
      kotlin: ['effective-kotlin', 'kotlin-in-action'],
      rust: ['programming-with-rust', 'rust-in-action'],
      ruby: ['clean-code-reviewer'],
      go: ['system-design-interview', 'api-design-rest'],
      php: ['clean-code-reviewer', 'api-design-rest'],
    };
    for (const lang of project.languages) {
      for (const skill of LANG_SKILLS[lang] ?? []) {
        recommendedNames.add(skill);
      }
    }
  }

  // Collect ALL available skills: bundled (from package root) + community registry
  // Use fileURLToPath for proper path resolution across platforms
  const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
  const bundledSkillsDir = path.join(packageRoot, 'skills');
  const skillMeta = new Map(); // name → { source, description }

  // Bundled skills (in package's skills/ directory)
  try {
    const bundled = fs.readdirSync(bundledSkillsDir)
      .filter(d => {
        try { return fs.statSync(path.join(bundledSkillsDir, d)).isDirectory(); } catch { return false; }
      })
      .filter(d => fs.existsSync(path.join(bundledSkillsDir, d, 'SKILL.md')))
      .filter(d => d !== 'skill-router');
    for (const name of bundled) {
      skillMeta.set(name, { source: 'bundled', description: '' });
    }
  } catch { /* skills dir missing */ }

  // Community registry skills
  try {
    const registryPath = path.join(packageRoot, 'community', 'registry.json');
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      for (const skill of registry.skills ?? []) {
        if (!skillMeta.has(skill.name)) {
          const langs = skill.languages?.join(', ') ?? '';
          skillMeta.set(skill.name, {
            source: 'community',
            description: skill.description?.slice(0, 60) ?? '',
            languages: langs,
          });
        }
      }
    }
  } catch { /* registry missing */ }

  s.stop(`${skillMeta.size} skills available (${recommendedNames.size} recommended for your stack)`);

  if (skillMeta.size === 0) return [];

  // Overload warning — shown here (during skill selection) rather than before indexing
  if (slotsUsed > SKILL_LIMIT) {
    ui.log.warn(
      `${slotsUsed} skills installed (limit: ${SKILL_LIMIT}).\n` +
      'Agent context is overloaded \u2014 most skills get truncated.\n' +
      'Select only the skills you need below, then clean up the rest.'
    );
  }

  const installedSet = new Set(installedNames.map(n => n.toLowerCase()));
  const allNames = [...skillMeta.keys()];

  // Sort: recommended first, then installed, then bundled, then community — alphabetical within each
  const sortedSkills = allNames.sort((a, b) => {
    const aRec = recommendedNames.has(a) ? 0 : 1;
    const bRec = recommendedNames.has(b) ? 0 : 1;
    if (aRec !== bRec) return aRec - bRec;
    const aInst = installedSet.has(a.toLowerCase()) ? 0 : 1;
    const bInst = installedSet.has(b.toLowerCase()) ? 0 : 1;
    if (aInst !== bInst) return aInst - bInst;
    const aBundled = skillMeta.get(a)?.source === 'bundled' ? 0 : 1;
    const bBundled = skillMeta.get(b)?.source === 'bundled' ? 0 : 1;
    if (aBundled !== bBundled) return aBundled - bBundled;
    return a.localeCompare(b);
  });

  const options = sortedSkills.map(name => {
    const meta = scoreMap.get(name);
    const info = skillMeta.get(name);
    const isRec = recommendedNames.has(name);
    const isInst = installedSet.has(name.toLowerCase());
    const isCommunity = info?.source === 'community';
    const parts = [];
    if (isRec) parts.push('recommended');
    if (isInst) parts.push('installed');
    if (isCommunity) parts.push('community');
    let hint = parts.join(' + ');
    if (!hint && info?.description) hint = info.description;
    if (!hint && meta?.snippet) hint = meta.snippet;
    const score = meta ? ` [${meta.displayScore ?? Math.round(meta.score * 100)}%]` : '';
    return { value: name, label: `${name}${score}`, hint: hint || undefined };
  });

  // Pre-select recommended + already installed
  const initialValues = sortedSkills.filter(n =>
    recommendedNames.has(n) || installedSet.has(n.toLowerCase())
  );

  const selected = await ui.multiselect(
    `Skills for your project (${recommendedNames.size} pre-selected, ${skillMeta.size} total):`,
    options,
    { initialValues },
  );

  if (selected.length === 0) return installedNames;

  // Install selected skills
  const toInstall = selected.filter(n => !installedSet.has(n.toLowerCase()));
  const installed = [];

  for (const name of selected) {
    if (installedSet.has(name.toLowerCase())) {
      ui.log.info(`${name} (already installed)`);
      installed.push(name);
    } else {
      const result = installSkill(name);
      if (result === 'installed') {
        ui.log.success(`${name}`);
        installed.push(name);
      } else if (result === 'already-installed') {
        ui.log.info(`${name} (already installed)`);
        installed.push(name);
      } else {
        ui.log.warn(`${name}: not found in any catalog`);
      }
    }
  }

  // Cleanup offer
  if (slotsUsed > SKILL_LIMIT && installed.length > 0) {
    const toRemove = installedNames.filter(n => !selected.includes(n));
    if (toRemove.length === 0) {
      // Nothing to clean up — skip the question
    } else {
    const cleanup = await ui.select(`You have ${slotsUsed} skills but only need ~${installed.length}.`, [
      { value: 'clean', label: `Clean up \u2014 keep only recommended (remove ${toRemove.length})` },
      { value: 'keep', label: 'Keep all + add recommended' },
      { value: 'skip', label: 'Skip \u2014 I\'ll handle it manually' },
    ]);

    if (cleanup === 'clean') {
      const fetcher = new SkillFetcher();
      let removed = 0;
      for (const name of toRemove) {
        fetcher.desyncFromClaudeSkills({ name });
        removed++;
      }
      ui.log.success(`Removed ${removed} skills. Kept ${installed.length}.`);
    }
    } // end if toRemove.length > 0
  }

  return installed;
}

async function stepWriteConfigs(ui, cwd, selectedAgents, skillNames, profile, stack) {
  if (selectedAgents.length === 0) return;

  // Write config files (only if we have skills to write about)
  if (skillNames.length > 0) {
    const s = ui.spinner();
    s.start('Writing config files...');

    const initializer = new ProjectInitializer({ projectCwd: cwd });
    const target = selectedAgents.length === ALL_AGENTS.length ? 'all' : selectedAgents.join(',');

    try {
      const written = await initializer.init({ skills: skillNames, target, dryRun: false, quiet: true, profile, stack });
      if (written.length > 0) {
        s.stop('Config files written');
        for (const file of written) {
          ui.log.success(file);
        }
      } else {
        s.stop('Config files up to date');
      }
    } catch (err) {
      s.stop(`Config write failed: ${err.message}`);
    }
  }

  // Write MCP configs — ALWAYS, regardless of skills
  const mcpWritten = [];
  for (const tool of selectedAgents) {
    if (MCP_CAPABLE.has(tool)) {
      try {
        const mcpPath = writeMCPConfig(tool, cwd);
        if (mcpPath) mcpWritten.push(mcpPath);
      } catch { /* best-effort */ }
    }
  }
  if (mcpWritten.length > 0) {
    for (const p of mcpWritten) {
      const rel = path.relative(cwd, p);
      ui.log.success(`${rel} (MCP)`);
    }
  }

  // Write Claude Code hooks if claude is a selected agent
  if (selectedAgents.includes('claude')) {
    try {
      const hookResult = writeClaudeHooks(cwd);
      if (hookResult) {
        ui.log.success(`${path.relative(cwd, hookResult)} (hooks)`);
      }
    } catch { /* best-effort */ }
  }
}

// ── New wizard steps: gap detection, doc connection, GitHub releases ─────────

async function stepGapDetection(ui, cwd) {
  const s = ui.spinner();
  s.start('Scanning dependencies for knowledge gaps...');

  try {
    const { GapDetector } = await import('../engine/gap-detector.js');
    const detector = new GapDetector();
    const gaps = await detector.detect(cwd);

    if (gaps.postTraining.length === 0 && gaps.uncapturedDocs.length === 0) {
      s.stop('No knowledge gaps detected');
      return { gaps, connectSuggestions: [] };
    }

    s.stop(`Found ${gaps.postTraining.length} post-training dep(s), ${gaps.uncapturedDocs.length} uncaptured doc(s)`);

    if (gaps.postTraining.length > 0) {
      ui.log.warn('Post-training dependencies (model may have outdated knowledge):');
      for (const dep of gaps.postTraining.slice(0, 5)) {
        const date = dep.publishDate.toISOString().split('T')[0];
        ui.log.info(`  ${dep.name}@${dep.version} (${dep.ecosystem}, published ${date})`);
      }
      if (gaps.postTraining.length > 5) {
        ui.log.info(`  ... and ${gaps.postTraining.length - 5} more`);
      }
    }

    return { gaps, connectSuggestions: gaps.uncapturedDocs };
  } catch (err) {
    s.stop(`Gap scan skipped: ${err.message}`);
    return { gaps: null, connectSuggestions: [] };
  }
}

async function stepConnectDocs(ui, cwd, uncapturedDocs) {
  const docSources = [...uncapturedDocs];

  // Check for PKM vaults and SDD spec directories
  const pkmDirs = ['.obsidian', '.logseq', '.foam'];
  const sddDirs = ['.specify', '.planning', '.gsd', '.kiro'];

  for (const dir of [...pkmDirs, ...sddDirs]) {
    const full = path.join(cwd, dir);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      // For PKM vaults, scan the vault root (parent of .obsidian etc.)
      const scanDir = pkmDirs.includes(dir) ? cwd : full;
      const sourcePath = pkmDirs.includes(dir) ? '.' : dir;
      const type = pkmDirs.includes(dir) ? 'pkm' : 'sdd-spec';
      if (!docSources.some(d => d.path === sourcePath)) {
        const fileCount = countContentFiles(scanDir);
        if (fileCount > 0) {
          docSources.push({ path: sourcePath, type, fileCount });
        }
      }
    }
  }

  if (docSources.length === 0) return [];

  ui.log.info('Found project documentation that could be indexed:');

  const options = docSources.map(doc => ({
    value: doc,
    label: `${doc.path}/ (${doc.fileCount} file(s))`,
    hint: doc.type ?? 'auto-detect',
  }));

  const selected = await ui.multiselect('Index these docs into BookLib?', options);

  if (selected.length === 0) return [];

  const indexed = [];
  for (const doc of selected) {
    const s = ui.spinner();
    const sourcePath = path.resolve(cwd, doc.path);
    const sourceName = doc.path.replace(/[/\\]/g, '-').replace(/^\./, '');
    s.start(`Indexing ${doc.path}...`);

    try {
      const { detectSourceType } = await import('../engine/source-detector.js');
      const detected = detectSourceType(sourcePath);
      const sourceType = doc.type ?? detected.type;

      const { SourceManager } = await import('../engine/source-manager.js');
      const booklibDir = path.join(cwd, '.booklib');
      const mgr = new SourceManager(booklibDir);

      if (mgr.getSource(sourceName)) {
        s.stop(`${doc.path} (already indexed)`);
        continue;
      }

      mgr.registerSource({ name: sourceName, sourcePath, type: sourceType });

      const indexer = new BookLibIndexer();
      const result = await indexer.indexDirectory(sourcePath, false, {
        sourceName,
        quiet: true,
        onFileProgress({ current, total }) {
          if (total >= 5) s.message(`Indexing ${doc.path} [${current}/${total} files]`);
        },
      });

      const chunkCount = result?.chunks ?? 0;
      mgr.markIndexed(sourceName, chunkCount);
      s.stop(`${doc.path} \u2014 ${result?.files ?? doc.fileCount} files, ${chunkCount} chunks indexed (${sourceType})`);
      indexed.push({ name: sourceName, files: doc.fileCount });
    } catch (err) {
      s.stop(`${doc.path}: failed (${err.message})`);
    }
  }

  return indexed;
}

async function stepDecisionDemo(ui, cwd, indexedSources) {
  if (indexedSources.length === 0) return;

  const demoFile = findDemoFile(cwd);
  if (!demoFile) return;

  const s = ui.spinner();
  const relPath = path.relative(cwd, demoFile);
  s.start(`Running decision check on ${relPath}...`);

  try {
    const { DecisionChecker } = await import('../engine/decision-checker.js');
    const searcher = new BookLibSearcher();
    const checker = new DecisionChecker({ searcher });
    const result = await checker.checkFile(demoFile);

    if (result.contradictions.length > 0) {
      s.stop(`Found ${result.contradictions.length} potential contradiction(s) in ${relPath}`);
      for (const c of result.contradictions.slice(0, 3)) {
        ui.log.warn(`${c.identifier} -- contradicts: ${c.source}`);
        ui.log.info(`  "${c.decision.slice(0, 120)}..."`);
      }
      if (result.contradictions.length > 3) {
        ui.log.info(`  ... and ${result.contradictions.length - 3} more`);
      }
    } else {
      s.stop(''); // silent when no contradictions — no noise
    }

    ui.log.info('Run "booklib check-decisions <file>" to check any file against your team decisions.');
  } catch (err) {
    s.stop(`Decision check skipped: ${err.message}`);
  }
}

/**
 * Find the first .js or .ts source file in the project for demo purposes.
 * Scans up to 3 levels deep, skips node_modules and .booklib.
 */
function findDemoFile(cwd) {
  const SKIP = new Set(['node_modules', '.booklib', '.git', 'dist', 'build', 'coverage']);
  const EXTENSIONS = /\.(js|ts|jsx|tsx)$/;

  function scan(dir, depth) {
    if (depth > 3) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && EXTENSIONS.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          return path.join(dir, entry.name);
        }
      }
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP.has(entry.name)) {
          const found = scan(path.join(dir, entry.name), depth + 1);
          if (found) return found;
        }
      }
    } catch { /* permission error */ }
    return null;
  }

  return scan(cwd, 0);
}

async function stepConnectGitHub(ui, gaps) {
  if (!gaps?.postTraining?.length) return;

  try {
    const { GitHubConnector } = await import('../connectors/github.js');
    const gh = new GitHubConnector();
    if (!gh.checkAuth().ok) return;
  } catch {
    return;
  }

  const npmDeps = gaps.postTraining.filter(d => d.ecosystem === 'npm').slice(0, 5);
  if (npmDeps.length === 0) return;

  const connect = await ui.confirm(
    `${npmDeps.length} npm dep(s) are post-training. Check GitHub for release notes?`,
    true
  );

  if (!connect) return;

  ui.log.info(
    'To index release notes for post-training packages:\n' +
    npmDeps.map(d => `  booklib connect github releases <owner>/${d.name}`).join('\n') +
    '\n\nRun these after setup \u2014 they require the package owner/repo names.'
  );
}

async function stepShowAnalysis(ui, cwd) {
  const s = ui.spinner();
  s.start('Analyzing your code for affected APIs...');

  try {
    const { ProjectAnalyzer } = await import('../engine/project-analyzer.js');
    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.analyze(cwd);

    if (result.affected.length === 0) {
      s.stop('No affected APIs found in your code');
      return;
    }

    const apiSummary = result.iconApis > 0
      ? `${result.totalApis} APIs (${result.frameworkApis} framework, ${result.iconApis} icon imports)`
      : `${result.totalApis} post-training API(s)`;
    s.stop(`Found ${apiSummary} across ${result.totalFiles} file(s)`);

    // Group by dep for clean display, skip icon libraries from headline
    const byDep = new Map();
    for (const entry of result.affected) {
      if (entry.isIconLibrary) continue;
      const key = entry.dep.name;
      if (!byDep.has(key)) byDep.set(key, { dep: entry.dep, files: [] });
      byDep.get(key).files.push({ file: entry.file, apis: entry.apis });
    }

    for (const [, { dep, files }] of byDep) {
      const trained = dep.publishDate
        ? `model trained before ${dep.publishDate.toISOString().split('T')[0]}`
        : 'post-training';
      ui.log.warn(`${dep.name}@${dep.version} (${trained}):`);
      for (const { file, apis } of files.slice(0, 5)) {
        ui.log.info(`  ${file} \u2192 ${apis.join(', ')}`);
      }
      if (files.length > 5) {
        ui.log.info(`  ... and ${files.length - 5} more file(s)`);
      }
    }

    ui.log.success('Your AI now has current docs for these APIs.');
    return result;
  } catch (err) {
    s.stop(`Analysis skipped: ${err.message}`);
  }
}

async function stepResolveGaps(ui, cwd, postTrainingDeps) {
  const s = ui.spinner();
  try {
    const { GapResolver } = await import('../engine/gap-resolver.js');
    const resolver = new GapResolver({
      outputBase: path.join(cwd, '.booklib', 'sources'),
    });

    s.start(`Resolving ${postTrainingDeps.length} knowledge gap(s)...`);

    const results = await resolver.resolveAll(postTrainingDeps, ({ dep, result, index, total }) => {
      const status = result.resolved ? '\u2713' : '\u2717';
      s.message(`Resolving gaps... [${index + 1}/${total}] ${status} ${dep.name}`);
    });

    const resolved = results.filter(r => r.result.resolved);
    const unresolved = results.filter(r => !r.result.resolved);

    s.stop(`${resolved.length} of ${postTrainingDeps.length} gap(s) resolved`);

    // Index resolved sources into BookLib
    if (resolved.length > 0) {
      for (const { dep, result } of resolved) {
        try {
          const { SourceManager } = await import('../engine/source-manager.js');
          const booklibDir = path.join(cwd, '.booklib');
          const mgr = new SourceManager(booklibDir);
          const { detectSourceType } = await import('../engine/source-detector.js');
          const detected = detectSourceType(result.outputDir);
          mgr.registerSource({ name: result.sourceName, sourcePath: result.outputDir, type: detected.type });

          const indexer = new BookLibIndexer();
          await indexer.indexDirectory(result.outputDir, false, { sourceName: result.sourceName, quiet: true });

          ui.log.success(`${dep.name}@${dep.version} \u2014 ${result.pageCount} pages from ${result.source}`);
        } catch (err) {
          ui.log.warn(`${dep.name}: indexed but failed to register: ${err.message}`);
        }
      }
    }

    // Show suggestions for unresolved
    for (const { dep, result } of unresolved) {
      if (result.suggestion) {
        ui.log.info(`${dep.name}@${dep.version} \u2014 not found automatically\n  \u2192 ${result.suggestion}`);
      }
    }

    const details = results.map(({ dep, result }) => ({
      name: dep.name,
      version: dep.version,
      resolved: result.resolved,
      source: result.source,
      pageCount: result.pageCount ?? 0,
    }));

    return { resolved: resolved.length, unresolved: unresolved.length, details };
  } catch (err) {
    s.stop(`Gap resolution skipped: ${err.message}`);
    return { resolved: 0, unresolved: postTrainingDeps.length, details: [] };
  }
}

async function stepBuildContextMap(ui, cwd, gaps) {
  const s = ui.spinner();
  s.start('Building runtime context map...');
  try {
    const { ContextMapBuilder } = await import('../engine/context-map.js');
    const { listNodes, loadNode, parseNodeFrontmatter, resolveKnowledgePaths } = await import('../engine/graph.js');

    // Read config for processing mode
    const { configPath } = resolveBookLibPaths(cwd);
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

    const builder = new ContextMapBuilder({
      processingMode: config.reasoning ?? 'fast',
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
      ollamaModel: config.ollamaModel,
    });

    // Collect knowledge items from PROJECT-LOCAL graph nodes only
    // Global ~/.booklib/knowledge/ is for MCP search, not hook injection
    const projectNodesDir = path.join(cwd, '.booklib', 'knowledge', 'nodes');
    const nodeIds = fs.existsSync(projectNodesDir) ? listNodes({ nodesDir: projectNodesDir }) : [];
    const knowledgeItems = nodeIds.map(id => {
      const raw = loadNode(id, { nodesDir: projectNodesDir });
      if (!raw) return null;
      const parsed = parseNodeFrontmatter(raw);
      return { id, text: (parsed.title ?? '') + '\n' + (parsed.body ?? ''), source: 'knowledge-graph', type: parsed.type ?? 'note' };
    }).filter(Boolean);

    // Also extract decisions/constraints from connected project sources
    const sourcesPath = path.join(cwd, '.booklib', 'sources.json');
    if (fs.existsSync(sourcesPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
        for (const source of registry.sources ?? []) {
          if (!source.sourcePath || !fs.existsSync(source.sourcePath)) continue;
          const extracted = extractDecisionsFromSource(source.sourcePath, source.name);
          knowledgeItems.push(...extracted);
        }
      } catch { /* best effort */ }
    }

    let map = await builder.buildFromKnowledge(knowledgeItems);

    // Add gap detection items
    if (gaps?.postTraining?.length > 0) {
      const gapMap = await builder.buildFromGaps(gaps.postTraining);
      map = { ...map, items: [...map.items, ...gapMap.items] };
    }

    const mapPath = path.join(cwd, '.booklib', 'context-map.json');
    builder.save(mapPath, map);
    s.stop(`Context map: ${map.items.length} items ready for runtime injection`);
  } catch (err) {
    s.stop(`Context map skipped: ${err.message}`);
  }
}

/**
 * Extract decisions, constraints, and key rules from connected source files.
 * Scans markdown files for ADR-style sections, MUST/SHOULD statements,
 * constitution rules, and spec requirements.
 * @param {string} sourcePath - directory of the connected source
 * @param {string} sourceName - name for attribution
 * @returns {Array<{id, text, source, type}>}
 */
function extractDecisionsFromSource(sourcePath, sourceName) {
  const items = [];
  let files;
  try {
    const stat = fs.statSync(sourcePath);
    if (stat.isFile()) {
      files = [sourcePath];
    } else {
      files = [];
      const walk = (dir) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) walk(path.join(dir, entry.name));
            else if (/\.(md|mdx|txt)$/i.test(entry.name)) files.push(path.join(dir, entry.name));
          }
        } catch { /* permission error */ }
      };
      walk(sourcePath);
    }
  } catch { return []; }

  for (const file of files.slice(0, 20)) { // cap to avoid huge source dirs
    // Skip template files — they contain MUST/SHOULD but aren't actual decisions
    const basename = path.basename(file).toLowerCase();
    if (basename.includes('template') || basename.includes('example') || basename.includes('sample')) continue;

    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const relPath = path.relative(sourcePath, file);

    // Extract ADR-style decisions: sections with ## Decision or ## Context + ## Consequences
    const adrMatch = content.match(/##\s*Decision[\s\S]*?(?=\n##\s|$)/gi);
    if (adrMatch) {
      for (const section of adrMatch.slice(0, 3)) {
        items.push({
          id: `src:${sourceName}:${relPath}:decision`,
          text: section.trim().slice(0, 500),
          source: `${sourceName}/${relPath}`,
          type: 'decision',
        });
      }
    }

    // Extract MUST/SHOULD/SHALL rules
    const rules = content.match(/^.*\b(?:MUST|SHOULD|SHALL|MUST NOT|SHOULD NOT)\b.*$/gm);
    if (rules) {
      // Group nearby rules into one item
      const grouped = rules.slice(0, 10).join('\n');
      items.push({
        id: `src:${sourceName}:${relPath}:rules`,
        text: grouped.slice(0, 500),
        source: `${sourceName}/${relPath}`,
        type: 'decision',
      });
    }

    // Extract GOAL/DELIVERS/NOT DOING from SDD specs
    const goalMatch = content.match(/^GOAL:.*$/gm);
    const deliversMatch = content.match(/^DELIVERS:[\s\S]*?(?=\n(?:NOT DOING|ASSUMPTIONS|##|$))/gm);
    if (goalMatch) {
      items.push({
        id: `src:${sourceName}:${relPath}:spec`,
        text: (goalMatch[0] + '\n' + (deliversMatch?.[0] ?? '')).slice(0, 500),
        source: `${sourceName}/${relPath}`,
        type: 'note',
      });
    }
  }

  return items;
}

// ── Re-run flow (already initialized) ────────────────────────────────────────

async function runRelevanceAudit(cwd) {
  const { cosine } = await import('./skill-recommender.js');
  const { getEmbeddings } = await import('./registry-embeddings.js');
  const { detect: detectProj } = await import('./project-detector.js');

  console.log('\n  BookLib \u2014 Relevance Check\n');

  const project = detectProj(cwd);
  const installedNames = listInstalledSkillNames();

  if (installedNames.length === 0) {
    console.log('  No BookLib-managed skills installed. Run "booklib init" to set up.');
    return;
  }

  process.stdout.write(`\u25ba Scoring ${installedNames.length} skill(s) against your project`);
  const dotInterval = setInterval(() => { process.stdout.write('.'); }, 300);

  const embeddings = await getEmbeddings();
  const searcher = new BookLibSearcher();
  const queryText = project.languages.map(l => `${l} programming`).join('. ') || 'software engineering';
  const queryVec = await searcher.getEmbedding(queryText);

  clearInterval(dotInterval);
  process.stdout.write('\n\n');

  const RELEVANCE_THRESHOLD = 0.35;
  const scored = installedNames
    .map(name => ({ name, score: embeddings.has(name) ? cosine(queryVec, embeddings.get(name)) : null }))
    .filter(s => s.score !== null)
    .sort((a, b) => b.score - a.score);

  const unindexedCount = installedNames.length - scored.length;
  if (unindexedCount > 0) {
    process.stdout.write(`  ${unindexedCount} skill(s) not yet indexed \u2014 run "booklib index" to score them\n\n`);
  }

  if (scored.length === 0) {
    process.stdout.write('  Nothing to score yet. Run "booklib index" first.\n\n');
    return;
  }

  const relevant = scored.filter(s => s.score >= RELEVANCE_THRESHOLD);
  const lowRelevance = scored.filter(s => s.score < RELEVANCE_THRESHOLD);

  for (const { name, score } of relevant.slice(0, 5)) {
    process.stdout.write(`  \u2713 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (relevant.length > 5) {
    process.stdout.write(`  \u2026 and ${relevant.length - 5} more relevant skill(s)\n`);
  }

  if (lowRelevance.length === 0) {
    process.stdout.write(`\n  All ${scored.length} scored skill(s) are relevant to this project.\n\n`);
    return;
  }

  process.stdout.write('\n  Low relevance for this project:\n');
  for (const { name, score } of lowRelevance.slice(0, 10)) {
    process.stdout.write(`  \u00b7 ${name.padEnd(30)} ${(score * 100).toFixed(0)}% match\n`);
  }
  if (lowRelevance.length > 10) {
    process.stdout.write(`  \u2026 and ${lowRelevance.length - 10} more\n`);
  }

  process.stdout.write('\n  Tip: run "booklib uninstall <skill>" to free slots for more relevant skills.\n\n');
}
