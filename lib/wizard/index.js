// lib/wizard/index.js
import fs from 'fs';
import path from 'path';
import os from 'os';
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

const AGENT_LABELS = {
  claude: 'Claude Code', cursor: 'Cursor', copilot: 'Copilot',
  gemini: 'Gemini CLI', codex: 'Codex', windsurf: 'Windsurf',
  'roo-code': 'Roo Code', openhands: 'OpenHands', junie: 'Junie',
  goose: 'Goose', opencode: 'OpenCode', letta: 'Letta',
};
const ALL_AGENTS = Object.keys(AGENT_LABELS);

export async function runWizard(cwd = process.cwd(), opts = {}) {
  const markerPath = path.join(cwd, '.booklib', 'initialized');

  if (opts.reset) {
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
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
  } catch { /* best-effort */ }

  // Step 4: Health check
  const slotsUsed = countInstalledSlots();
  const installedNames = listInstalledSkillNames();
  if (slotsUsed > SKILL_LIMIT) {
    ui.log.warn(
      `${slotsUsed} skills installed (limit: ${SKILL_LIMIT}).\n` +
      'Agent context is overloaded \u2014 most skills get truncated.\n' +
      'After indexing, I\'ll find the best skills for your stack and help clean up.'
    );
  }

  // Step 5: Tool detection
  const selectedAgents = await stepToolSelection(ui, cwd);

  // Step 6: Index build with spinner
  await stepIndexBuild(ui);

  // Step 7: Scan for knowledge gaps
  const { gaps, connectSuggestions } = await stepGapDetection(ui, cwd);

  // Step 8: Connect project docs
  const indexedSources = await stepConnectDocs(ui, cwd, connectSuggestions);

  // Step 9: Offer GitHub releases for post-training deps
  await stepConnectGitHub(ui, gaps);

  // Step 10: Recommend + install + cleanup
  const selectedSkills = await stepRecommendAndInstall(ui, project, slotsUsed, installedNames);

  // Step 11: Write config files
  const skillsForConfig = selectedSkills.length > 0 ? selectedSkills : installedNames.slice(0, 10);
  const stack = project.languages.join(', ');
  await stepWriteConfigs(ui, cwd, selectedAgents, skillsForConfig, profile, stack);

  // Step 12: Summary
  ui.outro('BookLib is ready');

  const finalSlots = countInstalledSlots();
  console.log('');
  if (selectedSkills.length > 0) console.log(`  \u2713 ${selectedSkills.length} skills configured`);
  console.log(`  \u2713 ${finalSlots} total skills loaded`);
  if (indexedSources.length > 0) console.log(`  \u2713 ${indexedSources.length} doc source(s) indexed`);
  if (gaps?.postTraining?.length > 0) console.log(`  \u26a0 ${gaps.postTraining.length} post-training dep(s) detected`);
  console.log('');
  console.log(`  ${sep()}`);
  console.log('  Quick reference:');
  console.log('');
  console.log('  booklib search "query"         find patterns');
  console.log('  booklib search "q" --graph     include graph links');
  console.log('  booklib capture --title "..."   save knowledge');
  console.log('  booklib gaps                   find knowledge gaps');
  console.log('  booklib check-imports <file>   check import coverage');
  console.log('  booklib check-decisions <file> check for contradictions');
  console.log('  booklib connect <source>       add knowledge source');
  console.log('  booklib doctor                 health check');
  console.log('  booklib doctor --cure          auto-fix issues');
  console.log('  booklib init --reset           re-run setup');
  console.log(`  ${sep()}`);
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

async function stepIndexBuild(ui) {
  const s = ui.spinner();
  const { indexPath } = resolveBookLibPaths();
  const indexDir = path.dirname(indexPath);
  const indexFile = path.join(indexPath, 'index.json');
  const bm25File = path.join(indexDir, 'bm25.json');

  // If index already exists, skip build entirely
  if (fs.existsSync(indexFile) && fs.existsSync(bm25File)) {
    const bm25Size = fs.statSync(bm25File).size;
    if (bm25Size > 100) { // non-empty BM25 means a real index
      s.start('Index found');
      s.stop('Index ready (existing)');
      return;
    }
  }

  // Try pre-built index package first — instant setup, no model download
  try {
    const { installIndex, hasPrebuiltIndex } = await import('@booklib/index');
    if (hasPrebuiltIndex()) {
      s.start('Installing pre-built index (~93 MB, one-time download)...');
      await installIndex(indexDir);
      s.stop('Index ready (pre-built)');
      return;
    }
  } catch {
    // @booklib/index not installed — fall through to build
  }

  // Fall back to building index locally
  const indexer = new BookLibIndexer();

  if (!fs.existsSync(indexFile)) {
    s.start('Downloading embedding model (~25 MB, first time only)...');
    await indexer.loadModel({ quiet: true });
    s.message('Building knowledge index...');
  } else {
    s.start('Building knowledge index...');
  }

  try {
    const { skillsPath } = resolveBookLibPaths();
    await indexer.indexDirectory(skillsPath, false, {
      quiet: true,
      onProgress({ current, total, file }) {
        const name = file.split('/')[0] ?? file;
        s.message(`Building knowledge index... [${current}/${total}] ${name}`);
      },
    });
    s.stop('Index ready');
  } catch (err) {
    s.stop(`Index build failed: ${err.message}`);
  }
}

async function stepRecommendAndInstall(ui, project, slotsUsed, installedNames) {
  const s = ui.spinner();
  s.start('Finding best skills for your project...');

  const searcher = new BookLibSearcher();
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
  } catch { /* search unavailable — show all without recommendations */ }

  // Collect ALL available skills: bundled + community registry
  const { skillsPath } = resolveBookLibPaths();
  const skillMeta = new Map(); // name → { source, description }

  // Bundled skills (in skills/ directory)
  try {
    const bundled = fs.readdirSync(skillsPath)
      .filter(d => fs.existsSync(path.join(skillsPath, d, 'SKILL.md')))
      .filter(d => d !== 'skill-router');
    for (const name of bundled) {
      skillMeta.set(name, { source: 'bundled', description: '' });
    }
  } catch { /* skills dir missing */ }

  // Community registry skills
  try {
    const registryPath = path.join(path.dirname(skillsPath), 'community', 'registry.json');
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
      const sourcePath = pkmDirs.includes(dir) ? '.' : dir;
      const type = pkmDirs.includes(dir) ? 'pkm' : 'sdd-spec';
      if (!docSources.some(d => d.path === sourcePath)) {
        docSources.push({ path: sourcePath, type, fileCount: '?' });
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
      await indexer.indexDirectory(sourcePath, false, { sourceName, quiet: true });

      mgr.markIndexed(sourceName, 0);
      s.stop(`${doc.path} \u2192 indexed as ${sourceType}`);
      indexed.push(sourceName);
    } catch (err) {
      s.stop(`${doc.path}: failed (${err.message})`);
    }
  }

  return indexed;
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
